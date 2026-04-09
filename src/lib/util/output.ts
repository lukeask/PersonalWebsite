import type { CommandOutput } from "@/lib/types";

/**
 * Return a CommandOutput representing a command error.
 * Use for all non-zero exits from command execute() functions.
 *
 * Convention: prefix the message with the command name, e.g.
 *   errOut("ls: cannot access '/foo': No such file or directory")
 */
export function errOut(msg: string): CommandOutput {
  return { lines: [{ content: msg, style: "error" }], exitCode: 1 };
}
