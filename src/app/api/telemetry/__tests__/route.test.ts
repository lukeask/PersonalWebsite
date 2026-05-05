import { describe, it, expect, vi, beforeEach } from "vitest";
import { getClientIp, hashClientIp } from "@/lib/client-ip-privacy";
import { MAX_TELEMETRY_COMMAND_LEN } from "@/lib/telemetry/constants";
import { validate } from "../validation";

// ---------------------------------------------------------------------------
// validate() — unit tests
// ---------------------------------------------------------------------------

describe("validate()", () => {
  const validEvent = {
    command: "ls -la",
    timestamp: 1700000000000,
    sessionId: "abc-123",
  };
  const validPayload = { events: [validEvent] };

  it("accepts a valid payload with one event", () => {
    const result = validate(validPayload);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.body.events).toHaveLength(1);
      expect(result.body.events[0].command).toBe("ls -la");
    }
  });

  it("accepts a valid payload with multiple events", () => {
    const result = validate({
      events: [validEvent, { ...validEvent, command: "pwd" }],
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.body.events).toHaveLength(2);
    }
  });

  it("rejects null", () => {
    const result = validate(null);
    expect(result.valid).toBe(false);
  });

  it("rejects a non-object", () => {
    const result = validate("string");
    expect(result.valid).toBe(false);
  });

  it("rejects an array", () => {
    const result = validate([]);
    expect(result.valid).toBe(false);
  });

  it("rejects when events is missing", () => {
    const result = validate({});
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/events/);
  });

  it("rejects when events is not an array", () => {
    const result = validate({ events: "not-array" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/events/);
  });

  it("rejects when events is empty", () => {
    const result = validate({ events: [] });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/empty/);
  });

  it("rejects when events exceeds 100 items", () => {
    const events = Array.from({ length: 101 }, () => ({ ...validEvent }));
    const result = validate({ events });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/100/);
  });

  it("accepts exactly 100 events", () => {
    const events = Array.from({ length: 100 }, () => ({ ...validEvent }));
    const result = validate({ events });
    expect(result.valid).toBe(true);
  });

  it("rejects when an event is not an object", () => {
    const result = validate({ events: ["bad"] });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/events\[0\]/);
  });

  it("rejects when command is missing", () => {
    const result = validate({
      events: [{ timestamp: 123, sessionId: "abc" }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/command/);
  });

  it("rejects when command is empty", () => {
    const result = validate({
      events: [{ command: "", timestamp: 123, sessionId: "abc" }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/command/);
  });

  it("rejects when command exceeds max length", () => {
    const result = validate({
      events: [
        {
          command: "x".repeat(MAX_TELEMETRY_COMMAND_LEN + 1),
          timestamp: 123,
          sessionId: "abc",
        },
      ],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(String(MAX_TELEMETRY_COMMAND_LEN));
    }
  });

  it("accepts command at exactly max length", () => {
    const result = validate({
      events: [
        {
          command: "y".repeat(MAX_TELEMETRY_COMMAND_LEN),
          timestamp: 123,
          sessionId: "abc",
        },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("rejects when timestamp is not a number", () => {
    const result = validate({
      events: [{ command: "ls", timestamp: "bad", sessionId: "abc" }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/timestamp/);
  });

  it("rejects when timestamp is NaN", () => {
    const result = validate({
      events: [{ command: "ls", timestamp: NaN, sessionId: "abc" }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/timestamp/);
  });

  it("rejects when sessionId is missing", () => {
    const result = validate({
      events: [{ command: "ls", timestamp: 123 }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/sessionId/);
  });

  it("rejects when sessionId exceeds max length", () => {
    const result = validate({
      events: [{ command: "ls", timestamp: 123, sessionId: "x".repeat(65) }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/64/);
  });
});

// ---------------------------------------------------------------------------
// getClientIp() — unit tests
// ---------------------------------------------------------------------------

describe("getClientIp()", () => {
  function reqWithHeaders(headers: Record<string, string>): Request {
    return new Request("http://localhost/api/telemetry", { headers });
  }

  it("prefers cf-connecting-ip", () => {
    const req = reqWithHeaders({
      "cf-connecting-ip": "1.2.3.4",
      "x-forwarded-for": "5.6.7.8",
      "x-real-ip": "9.10.11.12",
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to first x-forwarded-for entry", () => {
    const req = reqWithHeaders({
      "x-forwarded-for": "1.1.1.1, 2.2.2.2",
    });
    expect(getClientIp(req)).toBe("1.1.1.1");
  });

  it("falls back to x-real-ip", () => {
    const req = reqWithHeaders({
      "x-real-ip": "3.3.3.3",
    });
    expect(getClientIp(req)).toBe("3.3.3.3");
  });

  it("returns 'unknown' when no IP headers present", () => {
    const req = reqWithHeaders({});
    expect(getClientIp(req)).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// hashClientIp() — unit tests
// ---------------------------------------------------------------------------

describe("hashClientIp()", () => {
  it("returns a 16-character hex string", () => {
    const result = hashClientIp("127.0.0.1", "test-secret");
    expect(result).toMatch(/^[0-9a-f]{16}$/);
  });

  it("produces the same hash for the same IP and secret", () => {
    const a = hashClientIp("10.0.0.1", "secret");
    const b = hashClientIp("10.0.0.1", "secret");
    expect(a).toBe(b);
  });

  it("produces different hashes for different IPs", () => {
    const a = hashClientIp("10.0.0.1", "secret");
    const b = hashClientIp("10.0.0.2", "secret");
    expect(a).not.toBe(b);
  });

  it("produces different hashes for different secrets", () => {
    const a = hashClientIp("10.0.0.1", "secret-a");
    const b = hashClientIp("10.0.0.1", "secret-b");
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// POST handler — integration-style tests
// ---------------------------------------------------------------------------

// Mock @neondatabase/serverless — the sql function has a .query() method for
// parameterized queries (used by ensureTable, insertEvents, and isRateLimited).
const mockSqlQuery = vi.fn().mockResolvedValue([]);
const mockSql = Object.assign(vi.fn().mockResolvedValue([]), {
  query: mockSqlQuery,
});
vi.mock("@neondatabase/serverless", () => ({
  neon: () => mockSql,
}));

// Mock @/lib/rate-limit — not rate-limited by default
const mockIsRateLimited = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
vi.mock("@/lib/rate-limit", () => ({
  isRateLimited: (...args: unknown[]) => mockIsRateLimited(...args),
}));

describe("POST /api/telemetry", () => {
  const validPayload = {
    events: [
      { command: "ls", timestamp: 1700000000000, sessionId: "sess-1" },
    ],
  };

  function makeRequest(
    body: unknown,
    opts: { ip?: string } = {},
  ): Request {
    return new Request("http://localhost/api/telemetry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.ip ? { "x-forwarded-for": opts.ip } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    mockSql.mockClear();
    mockSqlQuery.mockClear();
    mockSqlQuery.mockResolvedValue([]);
    mockIsRateLimited.mockClear();
    mockIsRateLimited.mockResolvedValue(false);
    vi.stubEnv("TELEMETRY_SECRET", "test-secret");
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // Dynamically import POST so mocks are in place
  async function getPost() {
    // Re-import to pick up mocks; vitest module cache means this returns
    // the same mocked module on subsequent calls within the same test file.
    const mod = await import("../route");
    return mod.POST;
  }

  it("returns 200 for a valid request", async () => {
    const POST = await getPost();
    const req = makeRequest(validPayload, { ip: "10.1.0.1" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("returns 400 for invalid JSON", async () => {
    const POST = await getPost();
    const req = new Request("http://localhost/api/telemetry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.1.0.2",
      },
      body: "not json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when events is missing", async () => {
    const POST = await getPost();
    const req = makeRequest({}, { ip: "10.1.0.3" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 500 when TELEMETRY_SECRET is not set", async () => {
    vi.stubEnv("TELEMETRY_SECRET", "");
    const POST = await getPost();
    const req = makeRequest(validPayload, { ip: "10.1.0.4" });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("returns 500 when DATABASE_URL is not set", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const POST = await getPost();
    const req = makeRequest(validPayload, { ip: "10.1.0.5" });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("returns 429 when isRateLimited returns true", async () => {
    mockIsRateLimited.mockResolvedValue(true);
    const POST = await getPost();
    const req = makeRequest(validPayload, { ip: "10.1.0.8" });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toMatch(/rate limit/i);
  });

  it("passes correct key prefix and window to isRateLimited", async () => {
    const POST = await getPost();
    const req = makeRequest(validPayload, { ip: "10.1.0.9" });
    await POST(req);
    expect(mockIsRateLimited).toHaveBeenCalled();
    const [, key, windowMs, maxRequests] = mockIsRateLimited.mock.calls[0] as [unknown, string, number, number];
    expect(key).toMatch(/^telemetry:/);
    expect(windowMs).toBe(60_000);
    expect(maxRequests).toBe(10);
  });

  it("allows request through when rate-limit DB check throws", async () => {
    mockIsRateLimited.mockRejectedValue(new Error("db error"));
    const POST = await getPost();
    const req = makeRequest(validPayload, { ip: "10.1.0.10" });
    const res = await POST(req);
    // Non-fatal: request proceeds even if rate-limit check fails
    expect(res.status).toBe(200);
  });

  it("returns 500 when database query fails", async () => {
    // insertEvents uses sql.query() — mock that to fail
    mockSqlQuery.mockRejectedValueOnce(new Error("db error"));
    const POST = await getPost();
    const req = makeRequest(validPayload, { ip: "10.1.0.6" });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("inserts events with parameterized query", async () => {
    const POST = await getPost();
    const events = [
      { command: "ls", timestamp: 1700000000000, sessionId: "sess-1" },
      { command: "pwd", timestamp: 1700000001000, sessionId: "sess-1" },
    ];
    const req = makeRequest({ events }, { ip: "10.1.0.7" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Find the INSERT call (skip the CREATE TABLE and rate-limit calls)
    // insertEvents uses sql.query(queryStr, valuesArray)
    const insertCall = mockSqlQuery.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO telemetry"),
    );
    expect(insertCall).toBeDefined();
    // Should have 8 params (4 per event × 2 events)
    expect(insertCall![1]).toHaveLength(8);
  });
});
