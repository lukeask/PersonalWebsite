// ---------------------------------------------------------------------------
// Telemetry client — batches command events and flushes to /api/telemetry.
// ---------------------------------------------------------------------------

import { MAX_TELEMETRY_COMMAND_LEN } from "@/lib/telemetry/constants";

interface BufferedEvent {
  command: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Session ID — persisted in sessionStorage for the lifetime of the tab.
// ---------------------------------------------------------------------------

function getOrCreateSessionId(): string {
  if (typeof sessionStorage === "undefined") return "ssr";

  const key = "askew:telemetry:sessionId";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;

  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);

  sessionStorage.setItem(key, id);
  return id;
}

// ---------------------------------------------------------------------------
// DO_NOT_TRACK check — respects both the in-memory env passed to trackCommand
// and the persisted localStorage env (key: askew:env).
// ---------------------------------------------------------------------------

function isDntEnabled(env?: Record<string, string>): boolean {
  // Check the env map passed at call time (live shell env)
  if (env?.DO_NOT_TRACK === "1") return true;

  // Also check what was persisted to localStorage (survives page reloads)
  try {
    const stored = localStorage.getItem("askew:env");
    if (stored) {
      const parsed: Record<string, string> = JSON.parse(stored);
      if (parsed.DO_NOT_TRACK === "1") return true;
    }
  } catch {
    // localStorage unavailable or corrupted — ignore
  }

  return false;
}

// ---------------------------------------------------------------------------
// Command redaction — strip values from sensitive commands.
// ---------------------------------------------------------------------------

export function redactCommand(command: string): string {
  const trimmed = command.trimStart();

  // export VAR=value  →  export VAR=<redacted>
  if (/^export\s+\w+=/.test(trimmed)) {
    return trimmed.replace(/(export\s+\w+=).*/, "$1<redacted>");
  }

  // set VAR=value (bash-style assignment via set builtin)
  if (/^set\s+\w+=/.test(trimmed)) {
    return trimmed.replace(/(set\s+\w+=).*/, "$1<redacted>");
  }

  // passwd — redact everything after the command name
  if (/^passwd(\s|$)/.test(trimmed)) {
    return "passwd <redacted>";
  }

  // alias name='...' — alias bodies can contain secrets
  if (/^alias\s+\w+=/.test(trimmed)) {
    return trimmed.replace(/(alias\s+\w+=).*/, "$1<redacted>");
  }

  // Inline VAR=value command — e.g. `FOO=bar some-command`
  if (/^\w+=\S/.test(trimmed) && !trimmed.startsWith("//")) {
    return trimmed.replace(/^(\w+=).*/, "$1<redacted>");
  }

  return command;
}

/**
 * Ensures telemetry commands fit API validation ({@link MAX_TELEMETRY_COMMAND_LEN}).
 * Long strings become a prefix plus U+2026 HORIZONTAL ELLIPSIS.
 */
function clampCommandForTelemetry(command: string): string {
  const max = MAX_TELEMETRY_COMMAND_LEN;
  if (command.length <= max) return command;
  return command.slice(0, max - 1) + "…";
}

// ---------------------------------------------------------------------------
// Client state
// ---------------------------------------------------------------------------

let sessionId: string;
let buffer: BufferedEvent[] = [];
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;
let flushIntervalId: ReturnType<typeof setInterval> | null = null;
let initialized = false;

// ---------------------------------------------------------------------------
// Flush — sends buffered events to the API.
// ---------------------------------------------------------------------------

async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return;

  const events = buffer.map((ev) => ({
    command: ev.command,
    timestamp: ev.timestamp,
    sessionId,
  }));

  const payload = JSON.stringify({ events, sessionId });

  // Optimistically clear buffer before the request to avoid double-sends
  // on slow networks; restore on failure.
  const snapshot = buffer.slice();
  buffer = [];

  try {
    const res = await fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    });

    if (!res.ok) {
      // Server rejected — don't retry; discard the batch.
      consecutiveFailures++;
    } else {
      consecutiveFailures = 0;
    }
  } catch {
    // Network error — restore the snapshot so we can retry.
    buffer = [...snapshot, ...buffer];
    consecutiveFailures++;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Must be called once (e.g. from the main page component) to set up the
 * auto-flush interval and beforeunload beacon.
 */
export function initTelemetry(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  sessionId = getOrCreateSessionId();

  flushIntervalId = setInterval(() => {
    void flush();
  }, 30_000);

  window.addEventListener("beforeunload", () => {
    if (buffer.length === 0) return;
    const events = buffer.map((ev) => ({
      command: ev.command,
      timestamp: ev.timestamp,
      sessionId,
    }));
    navigator.sendBeacon(
      "/api/telemetry",
      JSON.stringify({ events, sessionId }),
    );
  });
}

/**
 * Record a command execution event.
 *
 * @param command  The raw command string typed by the user.
 * @param env      The current shell env (used for DO_NOT_TRACK check).
 */
export function trackCommand(
  command: string,
  env?: Record<string, string>,
): void {
  if (isDntEnabled(env)) return;
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return;

  // Lazily initialise sessionId in environments where initTelemetry was not
  // called (SSR guard — should not normally happen in the browser).
  if (!sessionId) {
    sessionId = getOrCreateSessionId();
  }

  buffer.push({
    command: clampCommandForTelemetry(redactCommand(command)),
    timestamp: Date.now(),
  });
}

// Exposed for testing only.
export function _getBuffer(): BufferedEvent[] {
  return buffer;
}

export function _resetForTesting(): void {
  buffer = [];
  consecutiveFailures = 0;
  initialized = false;
  flushIntervalId = null;
  sessionId = "";
}

export function _setConsecutiveFailures(n: number): void {
  consecutiveFailures = n;
}

export function _flushForTesting(): Promise<void> {
  return flush();
}
