import { describe, it, expect, vi, beforeEach } from "vitest";
import { validate, POST } from "../route";

// ---------------------------------------------------------------------------
// validate() — unit tests
// ---------------------------------------------------------------------------

describe("validate()", () => {
  const valid = {
    from: "user@example.com",
    subject: "Hello",
    body: "This is a test message.",
  };

  it("accepts a valid payload", () => {
    const result = validate(valid);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.body.from).toBe("user@example.com");
      expect(result.body.subject).toBe("Hello");
      expect(result.body.body).toBe("This is a test message.");
    }
  });

  it("trims whitespace from all fields", () => {
    const result = validate({
      from: "  user@example.com  ",
      subject: "  Subject  ",
      body: "  body  ",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.body.from).toBe("user@example.com");
      expect(result.body.subject).toBe("Subject");
      expect(result.body.body).toBe("body");
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

  // from validation
  it("rejects missing from", () => {
    const result = validate({ ...valid, from: undefined });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/from/i);
  });

  it("rejects empty from", () => {
    const result = validate({ ...valid, from: "   " });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/from/i);
  });

  it("rejects from with invalid email format", () => {
    for (const bad of ["notanemail", "missing@", "@nodomain", "no spaces@ok.com"]) {
      const result = validate({ ...valid, from: bad });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toMatch(/email/i);
    }
  });

  it("accepts various valid email formats", () => {
    for (const good of [
      "user@example.com",
      "user+tag@sub.domain.org",
      "first.last@company.io",
    ]) {
      const result = validate({ ...valid, from: good });
      expect(result.valid).toBe(true);
    }
  });

  it("rejects from that exceeds max length", () => {
    const long = "a".repeat(243) + "@example.com"; // 255 chars, > 254
    const result = validate({ ...valid, from: long });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/254/);
  });

  // subject validation
  it("rejects missing subject", () => {
    const result = validate({ ...valid, subject: undefined });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/subject/i);
  });

  it("rejects empty subject", () => {
    const result = validate({ ...valid, subject: "" });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/subject/i);
  });

  it("rejects subject that exceeds max length", () => {
    const result = validate({ ...valid, subject: "x".repeat(201) });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/200/);
  });

  it("rejects subject with control characters (e.g. newline, NUL, DEL)", () => {
    for (const bad of [
      "Hello\nBcc: evil",
      "Hi\r\n",
      "x\x00y",
      "x\x7Fy",
    ]) {
      const result = validate({ ...valid, subject: bad });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toMatch(/subject.*control/i);
      }
    }
  });

  it("accepts body with newlines when subject is clean", () => {
    const result = validate({
      ...valid,
      subject: "Normal subject",
      body: "Line one\nLine two\n\nThanks.",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.body.body).toContain("\n");
    }
  });

  // body validation
  it("rejects missing body", () => {
    const result = validate({ ...valid, body: undefined });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/body/i);
  });

  it("rejects empty body", () => {
    const result = validate({ ...valid, body: "   " });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/body/i);
  });

  it("rejects body that exceeds max length", () => {
    const result = validate({ ...valid, body: "x".repeat(10_001) });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/10[,_]?000/);
  });
});

// ---------------------------------------------------------------------------
// POST handler — integration-style tests
// ---------------------------------------------------------------------------

// Mock @neondatabase/serverless so no real DB connections are made.
const mockSql = vi.fn().mockResolvedValue([]);
vi.mock("@neondatabase/serverless", () => ({
  neon: () => mockSql,
}));

// Mock @/lib/rate-limit so we can control rate-limit behaviour per test.
const mockIsRateLimited = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
vi.mock("@/lib/rate-limit", () => ({
  isRateLimited: (...args: unknown[]) => mockIsRateLimited(...args),
}));

function makeRequest(
  body: unknown,
  opts: { ip?: string } = {},
): Request {
  const req = new Request("http://localhost/api/contact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.ip ? { "x-forwarded-for": opts.ip } : {}),
    },
    body: JSON.stringify(body),
  });
  return req;
}

const validPayload = {
  from: "tester@example.com",
  subject: "Test subject",
  body: "Hello from the test.",
};

describe("POST /api/contact", () => {
  beforeEach(() => {
    // Ensure no RESEND_API_KEY so tests don't attempt real network calls
    vi.stubEnv("RESEND_API_KEY", "");
    // Provide a DATABASE_URL so the rate-limit code path is exercised
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
    mockSql.mockClear();
    mockIsRateLimited.mockClear();
    mockIsRateLimited.mockResolvedValue(false);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 200 for a valid request (no Resend key → logs only)", async () => {
    const req = makeRequest(validPayload, { ip: "10.0.0.1" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.0.0.2",
      },
      body: "not json at all{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });

  it("returns 400 when from field is missing", async () => {
    const req = makeRequest(
      { subject: "Hi", body: "Body text" },
      { ip: "10.0.0.3" },
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/from/i);
  });

  it("returns 400 when from is an invalid email", async () => {
    const req = makeRequest(
      { ...validPayload, from: "notvalid" },
      { ip: "10.0.0.4" },
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/email/i);
  });

  it("returns 400 when body is empty", async () => {
    const req = makeRequest(
      { ...validPayload, body: "" },
      { ip: "10.0.0.5" },
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/body/i);
  });

  it("returns 429 when isRateLimited returns true", async () => {
    mockIsRateLimited.mockResolvedValue(true);
    const req = makeRequest(validPayload, { ip: "10.0.1.1" });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toMatch(/rate limit/i);
  });

  it("passes correct key prefix and window to isRateLimited", async () => {
    const req = makeRequest(validPayload, { ip: "10.0.1.2" });
    await POST(req);
    expect(mockIsRateLimited).toHaveBeenCalledOnce();
    const [, key, windowMs, maxRequests] = mockIsRateLimited.mock.calls[0] as [unknown, string, number, number];
    expect(key).toMatch(/^contact:/);
    expect(windowMs).toBe(60_000);
    expect(maxRequests).toBe(1);
  });

  it("allows request through when DATABASE_URL is not set (rate limit skipped)", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const req = makeRequest(validPayload, { ip: "10.0.1.3" });
    const res = await POST(req);
    // Rate limit is skipped when no DB is configured — request should succeed
    expect(res.status).toBe(200);
  });

  it("allows request through when rate-limit DB check throws", async () => {
    mockIsRateLimited.mockRejectedValue(new Error("db error"));
    const req = makeRequest(validPayload, { ip: "10.0.1.4" });
    const res = await POST(req);
    // Non-fatal: request proceeds even if rate-limit check fails
    expect(res.status).toBe(200);
  });

  it("calls Resend and returns 200 when RESEND_API_KEY is set and Resend succeeds", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "abc123" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const req = makeRequest(validPayload, { ip: "10.0.2.1" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("resend.com");
    const sentBody = JSON.parse(opts.body as string);
    expect(sentBody.reply_to).toBe("tester@example.com");
    expect(sentBody.subject).toContain("Test subject");

    vi.unstubAllGlobals();
  });

  it("returns 502 when Resend returns an error", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Unauthorized" }), {
          status: 401,
        }),
      ),
    );

    const req = makeRequest(validPayload, { ip: "10.0.3.1" });
    const res = await POST(req);
    expect(res.status).toBe(502);

    vi.unstubAllGlobals();
  });

  it("returns 502 when Resend fetch throws", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network failure")),
    );

    const req = makeRequest(validPayload, { ip: "10.0.4.1" });
    const res = await POST(req);
    expect(res.status).toBe(502);

    vi.unstubAllGlobals();
  });
});
