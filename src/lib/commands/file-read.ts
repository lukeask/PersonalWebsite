import type { Command, CommandOutput, CommandContext, TerminalOutputLine } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { resolvePath } from "@/lib/util/paths";
import { errOut } from "@/lib/util/output";

// --- Markdown renderer ---

function processInlineLine(line: string): TerminalOutputLine {
  if (/\*\*[^*]+\*\*/.test(line)) {
    return { content: line.replace(/\*\*([^*]+)\*\*/g, "$1"), style: "bold" };
  }
  if (/`[^`]+`/.test(line)) {
    return { content: line.replace(/`([^`]+)`/g, "$1"), style: "highlight" };
  }
  if (/\[[^\]]+\]\([^)]+\)/.test(line)) {
    return { content: line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)"), style: "link" };
  }
  if (/\*[^*]+\*/.test(line) || /_[^_]+_/.test(line)) {
    return {
      content: line.replace(/\*([^*]+)\*/g, "$1").replace(/_([^_]+)_/g, "$1"),
      style: "dim",
    };
  }
  return { content: line };
}

function renderMarkdown(content: string): TerminalOutputLine[] {
  const result: TerminalOutputLine[] = [];
  let inCodeBlock = false;

  for (const raw of content.split("\n")) {
    if (raw.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      result.push({ content: raw, style: "dim" });
      continue;
    }
    if (inCodeBlock) {
      result.push({ content: raw, style: "dim" });
      continue;
    }
    const hm = raw.match(/^(#{1,6})\s+(.*)/);
    if (hm) {
      result.push({ content: hm[2], style: "bold" });
      continue;
    }
    if (/^[-*_]{3,}\s*$/.test(raw.trim())) {
      result.push({ content: "─".repeat(40), style: "dim" });
      continue;
    }
    result.push(processInlineLine(raw));
  }
  return result;
}

// --- File type detection ---

function detectFileType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    md: "UTF-8 text, Markdown",
    txt: "UTF-8 text",
    ts: "UTF-8 text, TypeScript source",
    tsx: "UTF-8 text, TypeScript/React source",
    js: "UTF-8 text, JavaScript source",
    jsx: "UTF-8 text, JavaScript/React source",
    json: "UTF-8 text, JSON data",
    html: "UTF-8 text, HTML document",
    css: "UTF-8 text, CSS stylesheet",
    scss: "UTF-8 text, SCSS stylesheet",
    sh: "POSIX shell script",
    py: "UTF-8 text, Python source",
    go: "UTF-8 text, Go source",
    rs: "UTF-8 text, Rust source",
    pdf: "PDF document",
    png: "PNG image data",
    jpg: "JPEG image data",
    jpeg: "JPEG image data",
    svg: "SVG image data",
    gif: "GIF image data",
  };
  return ext && types[ext] ? types[ext] : "data";
}

// --- wc helpers ---

function countContent(content: string): { lines: number; words: number; chars: number } {
  const lines = content.length === 0 ? 0 : content.split("\n").length;
  const words = content.trim() === "" ? 0 : content.trim().split(/\s+/).length;
  const chars = content.length;
  return { lines, words, chars };
}

function formatWcLine(
  counts: { lines: number; words: number; chars: number },
  label: string,
  modeL: boolean,
  modeW: boolean,
  modeC: boolean,
): string {
  const pad = (n: number) => String(n).padStart(7);
  if (modeL) return `${pad(counts.lines)} ${label}`.trimEnd();
  if (modeW) return `${pad(counts.words)} ${label}`.trimEnd();
  if (modeC) return `${pad(counts.chars)} ${label}`.trimEnd();
  return `${pad(counts.lines)} ${pad(counts.words)} ${pad(counts.chars)} ${label}`.trimEnd();
}

// --- Commands ---

const catCommand: Command = {
  name: "cat",
  aliases: [],
  description: "Concatenate and display file contents",
  usage: "cat [file...]",
  execute(args, _flags, stdin, ctx) {
    if (args.length === 0) {
      if (stdin === null) return { lines: [], exitCode: 0 };
      return {
        lines: stdin.split("\n").map((l) => ({ content: l })),
        exitCode: 0,
      };
    }

    const lines: TerminalOutputLine[] = [];
    for (const arg of args) {
      const path = resolvePath(arg, ctx.cwd, ctx.user.home);
      if (!ctx.fs.exists(path)) {
        return errOut(`cat: ${arg}: No such file or directory`);
      }
      if (ctx.fs.isDirectory(path)) {
        return errOut(`cat: ${arg}: Is a directory`);
      }
      const content = ctx.fs.read(path);
      if (path.endsWith(".md")) {
        lines.push(...renderMarkdown(content));
      } else {
        lines.push(...content.split("\n").map((l) => ({ content: l })));
      }
    }
    return { lines, exitCode: 0 };
  },
};

const headCommand: Command = {
  name: "head",
  aliases: [],
  description: "Output the first lines of a file",
  usage: "head [-n N] [file...]",
  execute(args, flags, stdin, ctx) {
    const rawN = flags.n !== undefined ? parseInt(String(flags.n), 10) : 10;
    if (isNaN(rawN) || rawN < 0) {
      return errOut(`head: invalid number of lines: ${flags.n}`);
    }
    const n = rawN;

    const firstN = (content: string): TerminalOutputLine[] =>
      content.split("\n").slice(0, n).map((l) => ({ content: l }));

    if (args.length === 0) {
      return { lines: firstN(stdin ?? ""), exitCode: 0 };
    }

    const lines: TerminalOutputLine[] = [];
    for (const arg of args) {
      const path = resolvePath(arg, ctx.cwd, ctx.user.home);
      if (!ctx.fs.exists(path)) {
        return errOut(`head: ${arg}: No such file or directory`);
      }
      if (ctx.fs.isDirectory(path)) {
        return errOut(`head: ${arg}: Is a directory`);
      }
      if (args.length > 1) {
        lines.push({ content: `==> ${arg} <==` });
      }
      lines.push(...firstN(ctx.fs.read(path)));
    }
    return { lines, exitCode: 0 };
  },
};

const tailCommand: Command = {
  name: "tail",
  aliases: [],
  description: "Output the last lines of a file",
  usage: "tail [-n N] [file...]",
  execute(args, flags, stdin, ctx) {
    const rawN = flags.n !== undefined ? parseInt(String(flags.n), 10) : 10;
    if (isNaN(rawN) || rawN < 0) {
      return errOut(`tail: invalid number of lines: ${flags.n}`);
    }
    const n = rawN;

    const lastN = (content: string): TerminalOutputLine[] => {
      const all = content.split("\n");
      return (n === 0 ? [] : all.slice(-n)).map((l) => ({ content: l }));
    };

    if (args.length === 0) {
      return { lines: lastN(stdin ?? ""), exitCode: 0 };
    }

    const lines: TerminalOutputLine[] = [];
    for (const arg of args) {
      const path = resolvePath(arg, ctx.cwd, ctx.user.home);
      if (!ctx.fs.exists(path)) {
        return errOut(`tail: ${arg}: No such file or directory`);
      }
      if (ctx.fs.isDirectory(path)) {
        return errOut(`tail: ${arg}: Is a directory`);
      }
      if (args.length > 1) {
        lines.push({ content: `==> ${arg} <==` });
      }
      lines.push(...lastN(ctx.fs.read(path)));
    }
    return { lines, exitCode: 0 };
  },
};

const fileCommand: Command = {
  name: "file",
  aliases: [],
  description: "Determine file type",
  usage: "file <file...>",
  execute(args, _flags, _stdin, ctx) {
    if (args.length === 0) return errOut("file: missing operand");

    const lines: TerminalOutputLine[] = [];
    let hasError = false;
    for (const arg of args) {
      const path = resolvePath(arg, ctx.cwd, ctx.user.home);
      if (!ctx.fs.exists(path)) {
        lines.push({ content: `${arg}: ERROR: No such file or directory`, style: "error" });
        hasError = true;
        continue;
      }
      if (ctx.fs.isDirectory(path)) {
        lines.push({ content: `${arg}: directory` });
        continue;
      }
      lines.push({ content: `${arg}: ${detectFileType(path)}` });
    }
    return { lines, exitCode: hasError ? 1 : 0 };
  },
};

const wcCommand: Command = {
  name: "wc",
  aliases: [],
  description: "Count lines, words, and characters in files",
  usage: "wc [-l|-w|-c] [file...]",
  execute(args, flags, stdin, ctx) {
    const modeL = flags.l === true;
    const modeW = flags.w === true;
    const modeC = flags.c === true;

    if (args.length === 0) {
      const counts = countContent(stdin ?? "");
      return {
        lines: [{ content: formatWcLine(counts, "", modeL, modeW, modeC) }],
        exitCode: 0,
      };
    }

    const outputLines: TerminalOutputLine[] = [];
    const totals = { lines: 0, words: 0, chars: 0 };
    let hasError = false;

    for (const arg of args) {
      const path = resolvePath(arg, ctx.cwd, ctx.user.home);
      if (!ctx.fs.exists(path)) {
        outputLines.push({ content: `wc: ${arg}: No such file or directory`, style: "error" });
        hasError = true;
        continue;
      }
      if (ctx.fs.isDirectory(path)) {
        outputLines.push({ content: `wc: ${arg}: Is a directory`, style: "error" });
        hasError = true;
        continue;
      }
      const counts = countContent(ctx.fs.read(path));
      totals.lines += counts.lines;
      totals.words += counts.words;
      totals.chars += counts.chars;
      outputLines.push({ content: formatWcLine(counts, arg, modeL, modeW, modeC) });
    }

    const validCount = outputLines.filter((l) => l.style !== "error").length;
    if (validCount > 1) {
      outputLines.push({ content: formatWcLine(totals, "total", modeL, modeW, modeC) });
    }

    return { lines: outputLines, exitCode: hasError ? 1 : 0 };
  },
};

// --- Register ---

registry.register(catCommand);
registry.register(headCommand);
registry.register(tailCommand);
registry.register(fileCommand);
registry.register(wcCommand);
