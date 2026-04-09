import { createElement } from "react";
import type { ReactNode } from "react";

import type { Command, CommandOutput, TerminalOutputLine } from "@/lib/types";
import { resolvePath } from "@/lib/util/paths";

import { asGitFS } from "./_helpers";

// --- Helpers ---

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

function diffLines(
  path: string,
  baseContent: string,
  currentContent: string,
): TerminalOutputLine[] {
  const oldLines = baseContent.split(/\r?\n/);
  const newLines = currentContent.split(/\r?\n/);
  const ops = lineDiff(oldLines, newLines);

  const out: TerminalOutputLine[] = [
    { content: `diff --git a${path} b${path}`, style: "bold" },
    { content: `--- a${path}`, style: "dim" },
    { content: `+++ b${path}`, style: "dim" },
  ];

  for (const { op, text } of ops) {
    if (op === "same") {
      out.push({ content: ` ${text}` });
    } else if (op === "del") {
      out.push({
        content: createElement(
          "span",
          { className: "text-terminal-error" },
          `-${text}`,
        ) as ReactNode,
      });
    } else {
      out.push({
        content: createElement(
          "span",
          { className: "text-terminal-green" },
          `+${text}`,
        ) as ReactNode,
      });
    }
  }

  return out;
}

// --- git diff ---

export const gitDiffCommand: Command = {
  name: "git-diff",
  aliases: [],
  description: "show changes (internal — dispatched by git)",
  usage: "git diff [file...]",
  execute(args, _flags, _stdin, ctx): CommandOutput {
    const gfs = asGitFS(ctx.fs);
    if (!gfs) {
      return { lines: [{ content: "" }], exitCode: 0 };
    }

    const fs = ctx.fs as {
      read(p: string): string;
      exists(p: string): boolean;
      isDirectory(p: string): boolean;
    };

    let pathsToCheck: string[];

    if (args.length > 0) {
      pathsToCheck = args.map((p) => resolvePath(p, ctx.cwd, ctx.user.home));
    } else {
      pathsToCheck = gfs.getModifiedPaths();
    }

    const lines: TerminalOutputLine[] = [];
    let hasDiff = false;

    for (const path of pathsToCheck) {
      if (!fs.exists(path)) {
        lines.push({ content: `error: pathspec '${path}' did not match any file(s)`, style: "error" });
        continue;
      }
      if (fs.isDirectory(path)) continue;

      const baseContent = gfs.readBase(path);
      if (baseContent === null) continue; // new file, no base to diff against

      let current: string;
      try {
        current = fs.read(path);
      } catch {
        continue;
      }

      if (baseContent === current) continue;

      hasDiff = true;
      lines.push(...diffLines(path, baseContent, current));
      lines.push({ content: "" });
    }

    if (!hasDiff && lines.length === 0) {
      return { lines: [], exitCode: 0 };
    }

    return { lines, exitCode: hasDiff ? 1 : 0 };
  },
};
