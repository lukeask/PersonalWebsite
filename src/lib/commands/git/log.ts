import type { Command, TerminalOutputLine } from "@/lib/types";

import { FAKE_LOG } from "./_data";

// --- git log ---

export const gitLogCommand: Command = {
  name: "git-log",
  aliases: [],
  description: "show commit history (internal — dispatched by git)",
  usage: "git log",
  execute() {
    const lines: TerminalOutputLine[] = [];

    for (let ci = 0; ci < FAKE_LOG.length; ci++) {
      const commit = FAKE_LOG[ci];
      const headTag = ci === 0 ? " (HEAD -> main, origin/main)" : "";

      lines.push({ content: `commit ${commit.hash}${headTag}`, style: "highlight" });
      lines.push({ content: `Author: ${commit.author} <${commit.email}>` });
      lines.push({ content: `Date:   ${commit.date}`, style: "dim" });
      lines.push({ content: "" });
      lines.push({ content: `    ${commit.subject}` });
      if (commit.body) {
        lines.push({ content: "" });
        lines.push({ content: `    ${commit.body}` });
      }
      lines.push({ content: "" });
    }

    return { lines, exitCode: 0 };
  },
};
