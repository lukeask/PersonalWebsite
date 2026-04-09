import { createElement, Fragment, type ReactNode } from "react";
import type {
  Command,
  CommandContext,
  CommandOutput,
  TerminalOutputLine,
} from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { resolvePath } from "@/lib/util/paths";
import { errOut } from "@/lib/util/output";

function lineContains(
  line: string,
  needle: string,
  caseInsensitive: boolean,
): boolean {
  if (needle === "") return true;
  return caseInsensitive
    ? line.toLowerCase().includes(needle.toLowerCase())
    : line.includes(needle);
}

function highlightLine(line: string, needle: string, ci: boolean): ReactNode {
  if (needle === "") return line;
  const parts: ReactNode[] = [];
  let key = 0;
  let rest = line;
  const lowerNeedle = ci ? needle.toLowerCase() : needle;
  while (rest.length) {
    const idx = ci
      ? rest.toLowerCase().indexOf(lowerNeedle)
      : rest.indexOf(needle);
    if (idx === -1) {
      parts.push(rest);
      break;
    }
    if (idx > 0) parts.push(rest.slice(0, idx));
    const matched = rest.slice(idx, idx + needle.length);
    parts.push(
      createElement(
        "span",
        { key: key++, className: "text-terminal-highlight" },
        matched,
      ),
    );
    rest = rest.slice(idx + needle.length);
  }
  if (parts.length === 1) return parts[0];
  return createElement(Fragment, null, ...parts);
}

function basename(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function nameGlobMatch(filename: string, pattern: string): boolean {
  let re = "^";
  for (const ch of pattern) {
    if (ch === "*") re += ".*";
    else if (ch === "?") re += ".";
    else if (".+^${}()|[]\\".includes(ch)) re += "\\" + ch;
    else re += ch;
  }
  re += "$";
  return new RegExp(re).test(filename);
}

function collectGrepFiles(
  fs: CommandContext["fs"],
  roots: string[],
): string[] {
  const out = new Set<string>();
  for (const root of roots) {
    if (!fs.exists(root)) continue;
    if (fs.isDirectory(root)) {
      for (const p of fs.glob("**/*", root)) {
        if (fs.exists(p) && !fs.isDirectory(p)) out.add(p);
      }
    } else {
      out.add(root);
    }
  }
  return Array.from(out).sort();
}

function grepExecute(
  args: string[],
  flags: Record<string, string | boolean>,
  stdin: string | null,
  ctx: CommandContext,
): CommandOutput {
  const recursive = flags.r === true;
  const ci = flags.i === true;
  const lineNumbers = flags.n === true;
  const countOnly = flags.c === true;

  if (args.length === 0) {
    return errOut("grep: missing pattern");
  }

  const pattern = args[0];
  let fileArgs = args.slice(1);
  if (recursive && fileArgs.length === 0 && stdin === null) {
    fileArgs = ["."];
  }

  const useStdin = stdin !== null && fileArgs.length === 0;

  if (useStdin) {
    const lines = stdin.split("\n");
    const outLines: TerminalOutputLine[] = [];
    let total = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!lineContains(line, pattern, ci)) continue;
      total++;
      if (countOnly) continue;
      const body = highlightLine(line, pattern, ci);
      const content =
        lineNumbers
          ? createElement(
              Fragment,
              null,
              createElement(
                "span",
                { className: "text-terminal-dim" },
                `${i + 1}:`,
              ),
              body,
            )
          : body;
      outLines.push({ content });
    }
    if (countOnly) {
      outLines.push({ content: String(total) });
    }
    return {
      lines: outLines,
      exitCode: total === 0 ? 1 : 0,
    };
  }

  if (fileArgs.length === 0) {
    return errOut("grep: missing file operand (or use stdin)");
  }

  let paths: string[];
  if (recursive) {
    const roots = fileArgs.map((p) => resolvePath(p, ctx.cwd, ctx.user.home));
    paths = collectGrepFiles(ctx.fs, roots);
  } else {
    paths = fileArgs.map((p) => resolvePath(p, ctx.cwd, ctx.user.home));
  }

  const multiFile = paths.length > 1;
  const outLines: TerminalOutputLine[] = [];
  let anyMatch = false;

  for (const filePath of paths) {
    if (!ctx.fs.exists(filePath)) {
      outLines.push({
        content: `grep: ${filePath}: No such file or directory`,
        style: "error",
      });
      continue;
    }
    if (ctx.fs.isDirectory(filePath)) {
      outLines.push({
        content: `grep: ${filePath}: Is a directory`,
        style: "error",
      });
      continue;
    }

    let content: string;
    try {
      content = ctx.fs.read(filePath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      outLines.push({
        content: `grep: ${filePath}: ${msg}`,
        style: "error",
      });
      continue;
    }

    const lines = content.split("\n");
    let fileCount = 0;
    const fileOut: TerminalOutputLine[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!lineContains(line, pattern, ci)) continue;
      anyMatch = true;
      fileCount++;
      if (countOnly) continue;

      const hl = highlightLine(line, pattern, ci);
      let body: ReactNode = hl;
      if (lineNumbers) {
        body = createElement(
          Fragment,
          null,
          createElement(
            "span",
            { className: "text-terminal-dim" },
            `${i + 1}:`,
          ),
          hl,
        );
      }

      const prefix = multiFile
        ? createElement(
            "span",
            { className: "text-terminal-dim" },
            `${filePath}:`,
          )
        : null;

      const contentNode =
        prefix !== null
          ? createElement(Fragment, null, prefix, body)
          : body;

      fileOut.push({ content: contentNode, clickAction: { command: `cat ${filePath}` } });
    }

    if (countOnly) {
      const ctext = multiFile ? `${filePath}:${fileCount}` : String(fileCount);
      fileOut.push({ content: ctext });
      if (fileCount > 0) anyMatch = true;
    }

    outLines.push(...fileOut);
  }

  return { lines: outLines, exitCode: anyMatch ? 0 : 1 };
}

export const grepCommand: Command = {
  name: "grep",
  aliases: [],
  description: "Search for a pattern in files or stdin",
  usage:
    "grep [-ricn] <pattern> [file...] | stdin — use -r for recursive directory search",
  execute: (args, flags, stdin, ctx) =>
    Promise.resolve(grepExecute(args, flags, stdin, ctx)),
};

interface FindOptions {
  root: string;
  nameGlob?: string;
  typeFilter?: "f" | "d";
}

function parseFindOptions(
  args: string[],
  flags: Record<string, string | boolean>,
): FindOptions {
  let nameGlob: string | undefined =
    typeof flags.name === "string" ? flags.name : undefined;
  let typeFilter: "f" | "d" | undefined =
    typeof flags.type === "string" && (flags.type === "f" || flags.type === "d")
      ? flags.type
      : undefined;

  let i = 0;
  if (args[i] === "--") i++;

  let root = ".";
  if (args[i] !== undefined && args[i] !== "-name" && args[i] !== "-type") {
    root = args[i];
    i++;
  }

  while (i < args.length) {
    if (args[i] === "-name" && args[i + 1] !== undefined) {
      nameGlob = args[i + 1];
      i += 2;
    } else if (args[i] === "-type" && args[i + 1] !== undefined) {
      const t = args[i + 1];
      if (t === "f" || t === "d") typeFilter = t;
      i += 2;
    } else {
      i++;
    }
  }

  return { root, nameGlob, typeFilter };
}

function findExecute(
  args: string[],
  flags: Record<string, string | boolean>,
  _stdin: string | null,
  ctx: CommandContext,
): CommandOutput {
  const { root, nameGlob, typeFilter } = parseFindOptions(args, flags);
  const absRoot = resolvePath(root, ctx.cwd, ctx.user.home);

  if (!ctx.fs.exists(absRoot)) {
    return errOut(`find: '${absRoot}': No such file or directory`);
  }

  let paths: string[];
  if (ctx.fs.isDirectory(absRoot)) {
    paths = [absRoot, ...ctx.fs.glob("**/*", absRoot)];
  } else {
    paths = [absRoot];
  }

  paths = Array.from(new Set(paths)).sort();

  const lines: TerminalOutputLine[] = [];
  for (const p of paths) {
    const isDir = ctx.fs.isDirectory(p);
    if (typeFilter === "f" && isDir) continue;
    if (typeFilter === "d" && !isDir) continue;
    if (nameGlob !== undefined && !nameGlobMatch(basename(p), nameGlob)) {
      continue;
    }
    const cmd = isDir ? `cd ${p} && ls` : `cat ${p}`;
    lines.push({
      content: p,
      clickAction: { command: cmd },
    });
  }

  return { lines, exitCode: 0 };
}

export const findCommand: Command = {
  name: "find",
  aliases: [],
  description: "List files under a path (optional --name / --type filters)",
  usage:
    "find [path] [--name=glob] [--type=f|d] — use ‘find -- <path> -name <glob> -type f’ when -name/-type must pass the parser",
  execute: (args, flags, stdin, ctx) =>
    Promise.resolve(findExecute(args, flags, stdin, ctx)),
};

registry.register(grepCommand);
registry.register(findCommand);
