import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  trackCommand,
  redactCommand,
  initTelemetry,
  _getBuffer,
  _resetForTesting,
  _setConsecutiveFailures,
  _flushForTesting,
} from "../client";

// ---------------------------------------------------------------------------
// Browser globals
// ---------------------------------------------------------------------------

const sessionStorageStore: Record<string, string> = {};
const sessionStorageMock = {
  getItem: (key: string) => sessionStorageStore[key] ?? null,
  setItem: (key: string, value: string) => {
    sessionStorageStore[key] = value;
  },
  removeItem: (key: string) => {
    delete sessionStorageStore[key];
  },
  clear: () => {
    Object.keys(sessionStorageStore).forEach((k) => delete sessionStorageStore[k]);
  },
};

const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => {
    localStorageStore[key] = value;
  },
  removeItem: (key: string) => {
    delete localStorageStore[k];
  },
  clear: () => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
  },
};

// Fix typo in removeItem:
localStorageMock.removeItem = (key: string) => {
  delete localStorageStore[key];
};

vi.stubGlobal("sessionStorage", sessionStorageMock);
vi.stubGlobal("localStorage", localStorageMock);

// ---------------------------------------------------------------------------
// Fetch mock
// ---------------------------------------------------------------------------

const fetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal("fetch", fetchMock);

// navigator.sendBeacon mock
const sendBeaconMock = vi.fn().mockReturnValue(true);
vi.stubGlobal("navigator", { sendBeacon: sendBeaconMock });

// window stub (vitest runs in node — window is undefined by default)
const windowListeners: Record<string, EventListenerOrEventListenerObject[]> = {};
vi.stubGlobal("window", {
  addEventListener: (
    type: string,
    handler: EventListenerOrEventListenerObject,
  ) => {
    if (!windowListeners[type]) windowListeners[type] = [];
    windowListeners[type].push(handler);
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  _resetForTesting();
  sessionStorageMock.clear();
  localStorageMock.clear();
  fetchMock.mockClear();
  fetchMock.mockResolvedValue({ ok: true });
  sendBeaconMock.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// redactCommand()
// ---------------------------------------------------------------------------

describe("redactCommand()", () => {
  it("redacts export with a value", () => {
    expect(redactCommand("export SECRET=hunter2")).toBe(
      "export SECRET=<redacted>",
    );
  });

  it("redacts export with complex value", () => {
    expect(redactCommand("export API_KEY=abc123xyz")).toBe(
      "export API_KEY=<redacted>",
    );
  });

  it("passes through export without a value", () => {
    expect(redactCommand("export PATH")).toBe("export PATH");
  });

  it("redacts passwd command", () => {
    expect(redactCommand("passwd")).toBe("passwd <redacted>");
  });

  it("redacts passwd with arguments", () => {
    expect(redactCommand("passwd myuser")).toBe("passwd <redacted>");
  });

  it("does not redact unrelated commands", () => {
    expect(redactCommand("ls -la")).toBe("ls -la");
    expect(redactCommand("cat /etc/passwd")).toBe("cat /etc/passwd");
    expect(redactCommand("cd /home")).toBe("cd /home");
  });

  it("redacts set builtin with a value", () => {
    expect(redactCommand("set FOO=bar")).toBe("set FOO=<redacted>");
  });

  it("redacts alias definitions", () => {
    expect(redactCommand("alias deploy='curl -H auth'")).toBe(
      "alias deploy=<redacted>",
    );
  });

  it("redacts inline VAR=value assignment", () => {
    expect(redactCommand("FOO=bar ./run.sh")).toBe("FOO=<redacted>");
  });

  it("passes through echo $VAR (variable name only, not value)", () => {
    expect(redactCommand("echo $HOME")).toBe("echo $HOME");
  });

  it("passes through ls -la", () => {
    expect(redactCommand("ls -la")).toBe("ls -la");
  });
});

// ---------------------------------------------------------------------------
// Buffer management
// ---------------------------------------------------------------------------

describe("trackCommand() — buffer management", () => {
  it("adds an event to the buffer", () => {
    trackCommand("ls -la");
    const buf = _getBuffer();
    expect(buf).toHaveLength(1);
    expect(buf[0].command).toBe("ls -la");
  });

  it("stores a numeric timestamp", () => {
    const before = Date.now();
    trackCommand("pwd");
    const after = Date.now();
    const ts = _getBuffer()[0].timestamp;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("accumulates multiple events", () => {
    trackCommand("ls");
    trackCommand("pwd");
    trackCommand("whoami");
    expect(_getBuffer()).toHaveLength(3);
  });

  it("redacts sensitive commands before buffering", () => {
    trackCommand("export DB_PASS=secret");
    expect(_getBuffer()[0].command).toBe("export DB_PASS=<redacted>");
  });
});

// ---------------------------------------------------------------------------
// DO_NOT_TRACK — env argument
// ---------------------------------------------------------------------------

describe("trackCommand() — DO_NOT_TRACK via env argument", () => {
  it("silently returns when DO_NOT_TRACK=1 is in env", () => {
    trackCommand("ls", { DO_NOT_TRACK: "1" });
    expect(_getBuffer()).toHaveLength(0);
  });

  it("tracks when DO_NOT_TRACK is unset", () => {
    trackCommand("ls", { HOME: "/home/guest" });
    expect(_getBuffer()).toHaveLength(1);
  });

  it("tracks when DO_NOT_TRACK is not '1'", () => {
    trackCommand("ls", { DO_NOT_TRACK: "0" });
    expect(_getBuffer()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// DO_NOT_TRACK — localStorage
// ---------------------------------------------------------------------------

describe("trackCommand() — DO_NOT_TRACK via localStorage", () => {
  it("respects DO_NOT_TRACK=1 stored in localStorage askew:env", () => {
    localStorageMock.setItem(
      "askew:env",
      JSON.stringify({ DO_NOT_TRACK: "1" }),
    );
    trackCommand("ls");
    expect(_getBuffer()).toHaveLength(0);
  });

  it("tracks when localStorage askew:env has DO_NOT_TRACK=0", () => {
    localStorageMock.setItem(
      "askew:env",
      JSON.stringify({ DO_NOT_TRACK: "0" }),
    );
    trackCommand("ls");
    expect(_getBuffer()).toHaveLength(1);
  });

  it("tracks when localStorage askew:env does not include DO_NOT_TRACK", () => {
    localStorageMock.setItem("askew:env", JSON.stringify({ SHELL: "/bin/bash" }));
    trackCommand("ls");
    expect(_getBuffer()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Auto-flush (interval)
// ---------------------------------------------------------------------------

describe("auto-flush interval", () => {
  it("flushes after 30 seconds", async () => {
    initTelemetry();
    trackCommand("ls");
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/telemetry");
    const body = JSON.parse(init.body as string);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].command).toBe("ls");
  });

  it("does not flush if buffer is empty", async () => {
    initTelemetry();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Error handling — keep buffer on failure, stop after 3 failures
// ---------------------------------------------------------------------------

describe("error handling", () => {
  it("keeps events in buffer when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network error"));
    trackCommand("ls");
    await _flushForTesting();
    expect(_getBuffer()).toHaveLength(1);
  });

  it("clears buffer on successful flush", async () => {
    trackCommand("ls");
    await _flushForTesting();
    expect(_getBuffer()).toHaveLength(0);
  });

  it("stops tracking after 3 consecutive failures", async () => {
    _setConsecutiveFailures(3);
    trackCommand("ls");
    expect(_getBuffer()).toHaveLength(0);
  });

  it("stops flushing after 3 consecutive failures", async () => {
    _setConsecutiveFailures(3);
    // Force a buffered event by bypassing the guard — we test flush directly
    // by calling _flushForTesting after artificially lowering the counter.
    _setConsecutiveFailures(2);
    fetchMock.mockRejectedValueOnce(new Error("fail"));
    trackCommand("ls");
    await _flushForTesting(); // 3rd failure

    // Now at MAX — flush should bail without calling fetch
    fetchMock.mockClear();
    trackCommand("pwd");
    await _flushForTesting();
    // fetch should NOT have been called because we are at MAX_FAILURES and
    // trackCommand skips buffering too.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("discards batch when server returns non-ok", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    trackCommand("ls");
    await _flushForTesting();
    // Buffer was cleared optimistically; server error increments failure count
    expect(_getBuffer()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Session ID
// ---------------------------------------------------------------------------

describe("session ID", () => {
  it("embeds a sessionId in each flushed event", async () => {
    initTelemetry();
    trackCommand("ls");
    await _flushForTesting();
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(typeof body.events[0].sessionId).toBe("string");
    expect(body.events[0].sessionId.length).toBeGreaterThan(0);
  });
});
