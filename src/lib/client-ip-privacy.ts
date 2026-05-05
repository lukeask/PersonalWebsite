// ---------------------------------------------------------------------------
// Shared client IP extraction and privacy-preserving hash for API routes
// (telemetry, contact). T-A27-10.
// ---------------------------------------------------------------------------

import { createHmac } from "crypto";

// ---------------------------------------------------------------------------
// IP extraction (Vercel / Cloudflare aware)
// ---------------------------------------------------------------------------

export function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

// ---------------------------------------------------------------------------
// HMAC-SHA256, truncated to 16 hex digits
// ---------------------------------------------------------------------------
// We use HMAC with TELEMETRY_SECRET (server-only salt) rather than plain
// SHA-256(ip): IPv4 has only ~2^32 values, so an unsalted digest is cheap to
// preimage offline. HMAC ties identifiers to this deployment without storing
// raw IPs. Truncate to 16 hex chars for DB column width and rate-limit keys.
// ---------------------------------------------------------------------------

export function hashClientIp(ip: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(ip)
    .digest("hex")
    .substring(0, 16);
}
