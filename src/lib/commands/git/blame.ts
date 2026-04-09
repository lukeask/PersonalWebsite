import { createElement } from "react";
import type { ReactNode } from "react";

import type { Command, CommandOutput, TerminalOutputLine } from "@/lib/types";
import { resolvePath } from "@/lib/util/paths";
import { errOut } from "@/lib/util/output";

import { FAKE_LOG, BLAME_MESSAGES, BLAME_DATES } from "./_data";
import { asGitFS } from "./_helpers";

// --- Helpers ---

// Short fake hashes for blame column.
const BLAME_HASHES = FAKE_LOG.map((c) => c.hash);

function blameMsg(lineIndex: number): string {
  return BLAME_MESSAGES[lineIndex % BLAME_MESSAGES.length];
}

function blameDate(lineIndex: number): string {
  return BLAME_DATES[lineIndex % BLAME_DATES.length];
}

function blameHash(lineIndex: number): string {
  return BLAME_HASHES[lineIndex % BLAME_HASHES.length];
}

type DiffOp = "same" | "del" | "add";

function lineDiff(
  oldLines: string[],
  newLines: string[],
): { op: DiffOp; text: string }[] {
  const m = oldLines.length;
  const n = newLines.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const result: { op: DiffOp; text: string }[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ op: "same", text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ op: "add", text: newLines[j - 1] });
      j--;
    } else {
      result.push({ op: "del", text: oldLines[i - 1] });
      i--;
    }
  }
  return result.reverse();
}

// --- git blame ---

export const gitBlameCommand: Command = {
  name: "git-blame",
  aliases: [],
  description: "show who wrote each line (internal — dispatched by git)",
  usage: "git blame <file>",
  execute(args, _flags, _stdin, ctx): CommandOutput {
    const filePath = args[0];
    if (!filePath) {
      return errOut(
        "usage: git blame <file>\n" +
        "fatal: no path specified",
      );
    }

    const resolved = resolvePath(filePath, ctx.cwd, ctx.user.home);

    if (!ctx.fs.exists(resolved)) {
      return errOut(`git blame: error: no such path '${filePath}' in HEAD`);
    }
    if (ctx.fs.isDirectory(resolved)) {
      return errOut(`git blame: ${filePath}: Is a directory`);
    }

    let content: string;
    try {
      content = ctx.fs.read(resolved);
    } catch (e) {
      return errOut(`git blame: ${e instanceof Error ? e.message : String(e)}`);
    }

    const gfs = asGitFS(ctx.fs);
    const isOverlayFile = gfs ? gfs.readBase(resolved) === null : false;

    // For diff-attributed blame: determine which lines changed vs base.
    let changedLineSet: Set<number> | null = null;
    if (gfs && !isOverlayFile) {
      const baseContent = gfs.readBase(resolved) ?? "";
      const currentContent = content;
      if (baseContent !== currentContent) {
        const baseLines = baseContent.split(/\r?\n/);
        const currentLines = currentContent.split(/\r?\n/);
        const ops = lineDiff(baseLines, currentLines);
        changedLineSet = new Set<number>();
        let lineIdx = 0;
        for (const { op } of ops) {
          if (op === "add") {
            changedLineSet.add(lineIdx);
          }
          if (op !== "del") lineIdx++;
        }
      }
    }

    const fileLines = content.split(/\r?\n/);
    const lineNumWidth = String(fileLines.length).length;
    const lines: TerminalOutputLine[] = [];

    for (let i = 0; i < fileLines.length; i++) {
      const isUserLine = isOverlayFile || (changedLineSet?.has(i) ?? false);
      const author = isUserLine ? ctx.user.username : "luke";
      const hash = isUserLine ? "0000000" : blameHash(i);
      const date = isUserLine ? new Date().toISOString().slice(0, 10) : blameDate(i);
      const msg = isUserLine ? "local changes" : blameMsg(i);
      const lineNum = String(i + 1).padStart(lineNumWidth);
      const meta = `${hash} (${author.padEnd(8)} ${date} "${msg.padEnd(28)}" ${lineNum})`;

      lines.push({
        content: createElement(
          "span",
          null,
          createElement("span", { className: "text-terminal-dim" }, meta + " "),
          fileLines[i],
        ) as ReactNode,
      });
    }

    return { lines, exitCode: 0 };
  },
};
