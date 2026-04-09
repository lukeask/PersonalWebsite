import type { Command, CommandOutput, TerminalOutputLine } from "@/lib/types";

import { asGitFS } from "./_helpers";

// --- git pull (reset overlay to base) ---

export const gitResetCommand: Command = {
  name: "git-reset",
  aliases: [],
  description: "reset overlay to base state (internal — dispatched by git)",
  usage: "git pull",
  async execute(_args, _flags, _stdin, ctx): Promise<CommandOutput> {
    const gfs = asGitFS(ctx.fs);
    if (!gfs) {
      return {
        lines: [{ content: "Already up to date." }],
        exitCode: 0,
      };
    }

    const modified = gfs.getModifiedPaths();
    const tombstoned = gfs.getTombstonedPaths();
    const changedCount = modified.length + tombstoned.length;

    if (changedCount === 0) {
      return {
        lines: [{ content: "Already up to date." }],
        exitCode: 0,
      };
    }

    const allChanged = [...modified, ...tombstoned].sort();
    await gfs.reset();

    const lines: TerminalOutputLine[] = [
      { content: `Updating 82b1f2e..9cbfb53` },
      { content: "Fast-forward" },
      { content: "" },
    ];
    for (const path of allChanged) {
      lines.push({ content: ` ${path}`, style: "dim" });
    }
    lines.push({ content: "" });
    lines.push({
      content: ` ${allChanged.length} file${allChanged.length !== 1 ? "s" : ""} changed`,
    });

    return { lines, exitCode: 0 };
  },
};
