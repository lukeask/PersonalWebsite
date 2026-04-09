// ---------------------------------------------------------------------------
// POST /api/telemetry — receives batched command telemetry events, hashes
// the client IP for privacy, and inserts them into Neon Postgres.
// ---------------------------------------------------------------------------

import { createHmac } from "crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { isRateLimited } from "@/lib/rate-limit";

type NeonSql = NeonQueryFunction<false, false>;

// ---------------------------------------------------------------------------
// Types & validation
// ---------------------------------------------------------------------------

export interface TelemetryEvent {
  command: string;
  timestamp: number;
  sessionId: string;
}

export interface TelemetryBody {
  events: TelemetryEvent[];
}

type ValidationOk = { valid: true; body: TelemetryBody };
type ValidationErr = { valid: false; error: string };

const MAX_EVENTS = 100;
const MAX_COMMAND_LEN = 500;
const MAX_SESSION_ID_LEN = 64;

export function validate(data: unknown): ValidationOk | ValidationErr {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { valid: false, error: "Invalid request body." };
  }

  const { events } = data as Record<string, unknown>;

  if (!Array.isArray(events)) {
    return { valid: false, error: "events must be an array." };
  }

  if (events.length === 0) {
    return { valid: false, error: "events must not be empty." };
  }

  if (events.length > MAX_EVENTS) {
    return {
      valid: false,
      error: `events must contain at most ${MAX_EVENTS} items.`,
    };
  }

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (typeof ev !== "object" || ev === null || Array.isArray(ev)) {
      return { valid: false, error: `events[${i}] is not a valid object.` };
    }

    const { command, timestamp, sessionId } = ev as Record<string, unknown>;

    if (typeof command !== "string" || !command) {
      return { valid: false, error: `events[${i}].command must be a non-empty string.` };
    }
    if (command.length > MAX_COMMAND_LEN) {
      return {
        valid: false,
        error: `events[${i}].command must be at most ${MAX_COMMAND_LEN} characters.`,
      };
    }

    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
      return { valid: false, error: `events[${i}].timestamp must be a finite number.` };
    }

    if (typeof sessionId !== "string" || !sessionId) {
      return { valid: false, error: `events[${i}].sessionId must be a non-empty string.` };
    }
    if (sessionId.length > MAX_SESSION_ID_LEN) {
      return {
        valid: false,
        error: `events[${i}].sessionId must be at most ${MAX_SESSION_ID_LEN} characters.`,
      };
    }
  }

  return {
    valid: true,
    body: { events: events as TelemetryEvent[] },
  };
}

// ---------------------------------------------------------------------------
// IP extraction (Vercel / Cloudflare aware)
// ---------------------------------------------------------------------------

export function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

// ---------------------------------------------------------------------------
// HMAC hashing for privacy
// ---------------------------------------------------------------------------

export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(ip)
    .digest("hex")
    .substring(0, 16);
}

// ---------------------------------------------------------------------------
// Rate limiting — 10 requests per minute per hashed IP.
// Persistent across serverless cold starts via Neon Postgres.
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

// ---------------------------------------------------------------------------
// Database — ensure table exists, then batch insert
// ---------------------------------------------------------------------------

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS telemetry (
  id SERIAL PRIMARY KEY,
  hashed_ip VARCHAR(16) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  command TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_telemetry_created ON telemetry(created_at);
`;

let tableInitialized = false;

async function ensureTable(sql: NeonSql): Promise<void> {
  if (tableInitialized) return;
  await sql.query(INIT_SQL);
  tableInitialized = true;
}

async function insertEvents(
  sql: NeonSql,
  hashedIp: string,
  events: TelemetryEvent[],
): Promise<void> {
  // Build a single parameterized INSERT with multiple value rows
  const values: unknown[] = [];
  const placeholders: string[] = [];

  for (let i = 0; i < events.length; i++) {
    const offset = i * 4;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`,
    );
    values.push(hashedIp, events[i].sessionId, events[i].command, events[i].timestamp);
  }

  await sql.query(
    `INSERT INTO telemetry (hashed_ip, session_id, command, timestamp) VALUES ${placeholders.join(", ")}`,
    values,
  );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  // Parse JSON
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // Validate
  const result = validate(data);
  if (!result.valid) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  // Hash IP
  const secret = process.env.TELEMETRY_SECRET;
  if (!secret) {
    console.error("[telemetry] TELEMETRY_SECRET is not set.");
    return Response.json(
      { error: "Server configuration error." },
      { status: 500 },
    );
  }

  const ip = getClientIp(request);
  const hashedIp = hashIp(ip, secret);

  // Database
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[telemetry] DATABASE_URL is not set.");
    return Response.json(
      { error: "Server configuration error." },
      { status: 500 },
    );
  }

  const sql = neon(databaseUrl);

  // Rate limit — persistent via Postgres so it survives cold starts.
  try {
    const key = `telemetry:${hashedIp}`;
    if (await isRateLimited(sql, key, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX)) {
      return Response.json(
        { error: "Rate limited. Try again later." },
        { status: 429 },
      );
    }
  } catch (e) {
    // Non-fatal: if rate-limit check fails, let the request through.
    console.error("[telemetry] Rate limit check failed:", e);
  }

  // Insert events
  try {
    await ensureTable(sql);
    await insertEvents(sql, hashedIp, result.body.events);
  } catch (e) {
    console.error("[telemetry] Database error:", e);
    return Response.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }

  return Response.json({ ok: true }, { status: 200 });
}
