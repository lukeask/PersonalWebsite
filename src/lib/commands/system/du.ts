import type { Command, FileSystem, TerminalOutputLine } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { resolvePath, joinPath } from "@/lib/util/paths";

// --- Helpers ---

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)}M`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;
}

export function dirSize(fs: FileSystem, path: string): number {
  if (!fs.isDirectory(path)) {
    return fs.read(path).length * 2; // UTF-16 bytes
  }
  let total = 0;
  for (const entry of fs.list(path)) {
    const child = joinPath(path, entry);
    total += dirSize(fs, child);
  }
  return total;
}

// --- du ---

const duCommand: Command = {
  name: "du",
  aliases: [],
  description: "estimate file space usage",
  usage: "du [-sh] [path...]",
  execute(args, flags, _stdin, ctx) {
    const human = !!flags.h || !!flags.s; // -s implies human summary

    const fmt = (bytes: number) =>
      (human ? humanSize(bytes) : String(bytes)).padEnd(8);

    const targets: string[] =
      args.length === 0
        ? [ctx.cwd] // bare du → size of cwd
        : args.map((a) => resolvePath(a, ctx.cwd, ctx.user.home));

    const lines: TerminalOutputLine[] = [];
    for (const target of targets) {
      if (!ctx.fs.exists(target)) {
        lines.push({
          content: `du: ${target}: No such file or directory`,
          style: "error",
        });
        continue;
      }
      const bytes = dirSize(ctx.fs, target);
      // Show last path segment (or "." for cwd)
      const label =
        target === ctx.cwd && args.length === 0
          ? "."
          : target.split("/").pop() ?? target;
      lines.push({ content: `${fmt(bytes)}${label}` });
    }

    return { lines, exitCode: lines.some((l) => l.style === "error") ? 1 : 0 };
  },
};

// --- Register ---

registry.register(duCommand);
