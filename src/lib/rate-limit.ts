// ---------------------------------------------------------------------------
// Persistent rate limiting via Neon Postgres.
//
// Uses a `rate_limits` table with (key, window_start) as primary key.
// Each request in a given time window increments the counter atomically
// using INSERT … ON CONFLICT DO UPDATE. Works correctly across all serverless
// instances because state lives in the database, not in-process memory.
//
// Schema (created on first use):
//
//   CREATE TABLE IF NOT EXISTS rate_limits (
//     key          VARCHAR(64) NOT NULL,
//     window_start BIGINT      NOT NULL,
//     request_count INTEGER    NOT NULL DEFAULT 1,
//     PRIMARY KEY (key, window_start)
//   );
//
// Old rows accumulate but are tiny (~100 bytes each) and harmless. Add a
// periodic cleanup job or a Postgres TTL extension if you ever care.
// ---------------------------------------------------------------------------

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// The concrete type returned by neon() with default generic arguments.
export type NeonSql = NeonQueryFunction<false, false>;

// ---------------------------------------------------------------------------
// One-time table creation (cached per isolate, harmless to redo on cold start)
// ---------------------------------------------------------------------------

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS rate_limits (
  key           VARCHAR(64) NOT NULL,
  window_start  BIGINT      NOT NULL,
  request_count INTEGER     NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);
`;

let tableInitialized = false;

export async function ensureRateLimitTable(sql: NeonSql): Promise<void> {
  if (tableInitialized) return;
  await sql.query(INIT_SQL);
  tableInitialized = true;
}

// ---------------------------------------------------------------------------
// isRateLimited — increment the counter and return true if limit exceeded.
//
// @param sql        - neon() SQL client
// @param key        - unique identifier, e.g. "contact:<hashed_ip>"
// @param windowMs   - length of the rate-limit window in milliseconds
// @param maxRequests - maximum requests allowed within the window
//
// Returns true  → caller should respond 429
// Returns false → request is allowed, counter has been incremented
// ---------------------------------------------------------------------------

export async function isRateLimited(
  sql: NeonSql,
  key: string,
  windowMs: number,
  maxRequests: number,
): Promise<boolean> {
  await ensureRateLimitTable(sql);

  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;

  const rows = await sql.query(
    `INSERT INTO rate_limits (key, window_start, request_count)
     VALUES ($1, $2, 1)
     ON CONFLICT (key, window_start)
     DO UPDATE SET request_count = rate_limits.request_count + 1
     RETURNING request_count`,
    [key, windowStart],
  );

  const count: number = rows[0]?.request_count ?? 1;
  return count > maxRequests;
}
