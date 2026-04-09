import { createElement, type ReactNode } from "react";
import type { Command, CommandContext, CommandOutput } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { resolvePath } from "@/lib/util/paths";
import { errOut } from "@/lib/util/output";

function readAllLines(args: string[], ctx: CommandContext): string[] | CommandOutput {
  const lines: string[] = [];
  for (const arg of args) {
    const path = resolvePath(arg, ctx.cwd, ctx.user.home);
    try {
      if (!ctx.fs.exists(path)) {
        return errOut(`${arg}: No such file or directory`);
      }
      if (ctx.fs.isDirectory(path)) {
        return errOut(`${arg}: Is a directory`);
      }
      const content = ctx.fs.read(path);
      lines.push(...content.split(/\r?\n/));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errOut(`${arg}: ${msg}`);
    }
  }
  return lines;
}

function inputLines(
  stdin: string | null,
  args: string[],
  ctx: CommandContext,
): string[] | CommandOutput {
  if (args.length > 0) {
    return readAllLines(args, ctx);
  }
  if (stdin === null) {
    return [];
  }
  return stdin.split(/\r?\n/);
}

function cmpLines(a: string, b: string, numeric: boolean): number {
  if (numeric) {
    const na = Number.parseFloat(a.trim());
    const nb = Number.parseFloat(b.trim());
    const aNum = !Number.isNaN(na);
    const bNum = !Number.isNaN(nb);
    if (aNum && bNum) return na - nb;
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
  }
  return a.localeCompare(b);
}

const sortCommand: Command = {
  name: "sort",
  aliases: [],
  description: "Sort lines of text",
  usage: "sort [-n] [-r] [file ...]",
  execute(args, flags, stdin, ctx) {
    const linesResult = inputLines(stdin, args, ctx);
    if (!Array.isArray(linesResult)) return linesResult;

    const numeric = flags.n === true;
    const reverse = flags.r === true;
    const sorted = [...linesResult].sort((a, b) => {
      const c = cmpLines(a, b, numeric);
      return reverse ? -c : c;
    });

    return {
      lines: sorted.map((line) => ({ content: line })),
      exitCode: 0,
    };
  },
};

const uniqCommand: Command = {
  name: "uniq",
  aliases: [],
  description: "Report or filter adjacent duplicate lines",
  usage: "uniq [-c] [file ...]",
  execute(args, flags, stdin, ctx) {
    const linesResult = inputLines(stdin, args, ctx);
    if (!Array.isArray(linesResult)) return linesResult;

    const countFlag = flags.c === true;
    const outLines: { content: string }[] = [];

    let i = 0;
    while (i < linesResult.length) {
      const line = linesResult[i];
      let count = 1;
      let j = i + 1;
      while (j < linesResult.length && linesResult[j] === line) {
        count++;
        j++;
      }
      if (countFlag) {
        const w = String(count).length;
        const pad = Math.max(7, w);
        outLines.push({
          content: `${String(count).padStart(pad)} ${line}`,
        });
      } else {
        outLines.push({ content: line });
      }
      i = j;
    }

    return { lines: outLines, exitCode: 0 };
  },
};

type DiffOp = "same" | "del" | "add";

function lineDiff(oldLines: string[], newLines: string[]): { op: DiffOp; text: string }[] {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const back: { op: DiffOp; text: string }[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      back.push({ op: "same", text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      back.push({ op: "add", text: newLines[j - 1] });
      j--;
    } else {
      back.push({ op: "del", text: oldLines[i - 1] });
      i--;
    }
  }
  return back.reverse();
}

const diffCommand: Command = {
  name: "diff",
  aliases: [],
  description: "Compare two files line by line",
  usage: "diff <file1> <file2>",
  execute(args, _flags, _stdin, ctx) {
    if (args.length !== 2) {
      return errOut("usage: diff <file1> <file2>");
    }

    const path1 = resolvePath(args[0], ctx.cwd, ctx.user.home);
    const path2 = resolvePath(args[1], ctx.cwd, ctx.user.home);

    let a: string;
    let b: string;
    try {
      if (!ctx.fs.exists(path1)) return errOut(`${args[0]}: No such file or directory`);
      if (!ctx.fs.exists(path2)) return errOut(`${args[1]}: No such file or directory`);
      if (ctx.fs.isDirectory(path1)) return errOut(`${args[0]}: Is a directory`);
      if (ctx.fs.isDirectory(path2)) return errOut(`${args[1]}: Is a directory`);
      a = ctx.fs.read(path1);
      b = ctx.fs.read(path2);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errOut(`diff: ${msg}`);
    }

    const oldLines = a.split(/\r?\n/);
    const newLines = b.split(/\r?\n/);
    const ops = lineDiff(oldLines, newLines);

    const lines: CommandOutput["lines"] = [];
    let exitCode = 0;

    for (const { op, text } of ops) {
      if (op === "same") {
        lines.push({ content: ` ${text}` });
      } else {
        exitCode = 1;
        if (op === "del") {
          lines.push({
            content: createElement(
              "span",
              { className: "text-terminal-error" },
              `-${text}`,
            ) as ReactNode,
          });
        } else {
          lines.push({
            content: createElement(
              "span",
              { className: "text-terminal-green" },
              `+${text}`,
            ) as ReactNode,
          });
        }
      }
    }

    return { lines, exitCode };
  },
};

registry.register(sortCommand);
registry.register(uniqCommand);
registry.register(diffCommand);
