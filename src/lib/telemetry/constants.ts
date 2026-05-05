/**
 * Max length of each telemetry `command` string (API + DB).
 * Client `trackCommand` truncates with an ellipsis so payloads never exceed this.
 */
export const MAX_TELEMETRY_COMMAND_LEN = 500;
