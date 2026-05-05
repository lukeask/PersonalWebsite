// ---------------------------------------------------------------------------
// Telemetry API request body types and validation (split from route.ts so
// route.ts only exports Next.js route handlers).
// ---------------------------------------------------------------------------

import { MAX_TELEMETRY_COMMAND_LEN } from "@/lib/telemetry/constants";

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
    if (command.length > MAX_TELEMETRY_COMMAND_LEN) {
      return {
        valid: false,
        error: `events[${i}].command must be at most ${MAX_TELEMETRY_COMMAND_LEN} characters.`,
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
