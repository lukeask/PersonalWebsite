// ---------------------------------------------------------------------------
// POST /api/contact — receives a message from the mail composer, validates
// it, and forwards it via Resend (if RESEND_API_KEY is set) or logs it for
// local development.
// ---------------------------------------------------------------------------

import { createHash } from "crypto";
import { neon } from "@neondatabase/serverless";
import { isRateLimited } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Types & validation
// ---------------------------------------------------------------------------

export interface ContactBody {
  from: string;
  subject: string;
  body: string;
}

type ValidationOk = { valid: true; body: ContactBody };
type ValidationErr = { valid: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FROM_LEN = 254;    // RFC 5321 max email length
const MAX_SUBJECT_LEN = 200; // Practical cap (RFC 5322 max is 998)
const MAX_BODY_LEN = 10_000; // ~10 KB of plain text

/** C0/C1-style ASCII controls + DEL — reject in subject to avoid header-injection via newlines etc. */
const SUBJECT_CONTROLS_RE = /[\x00-\x1F\x7F]/;

export function validate(data: unknown): ValidationOk | ValidationErr {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { valid: false, error: "Invalid request body." };
  }

  const { from, subject, body } = data as Record<string, unknown>;

  // from
  if (typeof from !== "string" || !from.trim()) {
    return { valid: false, error: "from is required." };
  }
  if (from.length > MAX_FROM_LEN) {
    return {
      valid: false,
      error: `from must be at most ${MAX_FROM_LEN} characters.`,
    };
  }
  if (!EMAIL_RE.test(from.trim())) {
    return { valid: false, error: "from must be a valid email address." };
  }

  // subject
  if (typeof subject !== "string" || !subject.trim()) {
    return { valid: false, error: "subject is required." };
  }
  if (subject.length > MAX_SUBJECT_LEN) {
    return {
      valid: false,
      error: `subject must be at most ${MAX_SUBJECT_LEN} characters.`,
    };
  }
  if (SUBJECT_CONTROLS_RE.test(subject)) {
    return {
      valid: false,
      error: "subject contains control characters.",
    };
  }

  // body
  if (typeof body !== "string" || !body.trim()) {
    return { valid: false, error: "body is required." };
  }
  if (body.length > MAX_BODY_LEN) {
    return {
      valid: false,
      error: `body must be at most ${MAX_BODY_LEN} characters.`,
    };
  }

  return {
    valid: true,
    body: {
      from: from.trim(),
      subject: subject.trim(),
      body: body.trim(),
    },
  };
}

// ---------------------------------------------------------------------------
// Server-side rate limiting — one message per minute per client IP.
// Persistent across serverless cold starts via Neon Postgres.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MS = 60_000;
const RATE_LIMIT_MAX = 1;

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

function hashIpForContact(ip: string): string {
  // SHA-256 without a secret — deterministic, non-reversible, no env var needed.
  return createHash("sha256").update(ip).digest("hex").substring(0, 56);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  // Rate limit check — persistent via Postgres so it survives cold starts.
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const ip = getClientIp(request);
    const key = `contact:${hashIpForContact(ip)}`;
    try {
      const sql = neon(databaseUrl);
      const limited = await isRateLimited(sql, key, RATE_LIMIT_MS, RATE_LIMIT_MAX);
      if (limited) {
        return Response.json(
          { error: "Rate limited. Try again in 60 seconds." },
          { status: 429 },
        );
      }
    } catch (e) {
      // Non-fatal: if the rate-limit DB check fails, let the request through
      // rather than blocking legitimate users. Log for observability.
      console.error("[contact] Rate limit check failed:", e);
    }
  }

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

  const { from, subject, body } = result.body;

  // Send via Resend if configured; otherwise log (local dev / unconfigured)
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    let resendRes: Response;
    try {
      resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "contact@askew.sh",
          to: ["root@askew.sh"],
          reply_to: from,
          subject: `[askew.sh contact] ${subject}`,
          text: `From: ${from}\n\n${body}`,
        }),
      });
    } catch (e) {
      console.error("[contact] Network error sending via Resend:", e);
      return Response.json(
        { error: "Network error. Please try again." },
        { status: 502 },
      );
    }

    if (!resendRes.ok) {
      const errBody = await resendRes.json().catch(() => ({}));
      console.error("[contact] Resend error:", errBody);
      return Response.json(
        { error: "Failed to send message. Please try again." },
        { status: 502 },
      );
    }
  } else {
    // Local development or unconfigured — log the message so the developer
    // can see it in the server console without actually sending anything.
    console.log("[contact] Message received (RESEND_API_KEY not set):", {
      from,
      subject,
      bodyPreview: body.slice(0, 120),
    });
  }

  return Response.json({ ok: true }, { status: 200 });
}
