import type { Command, CommandOutput, FileSystem, TerminalOutputLine } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { resolvePath } from "@/lib/util/paths";
import { errOut } from "@/lib/util/output";

// --- Format helpers for ls -l ---

function formatSize(bytes: number): string {
  if (bytes < 1024) return String(bytes).padStart(6);
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`.padStart(6);
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`.padStart(6);
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(d.getDate()).padStart(2, " ");
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${months[d.getMonth()]} ${day} ${hour}:${min}`;
}

// --- ls ---

const lsCommand: Command = {
  name: "ls",
  aliases: [],
  description: "List directory contents",
  usage: "ls [-alt] [path]",
  execute(args, flags, _stdin, ctx) {
    const pathArg = args[0];
    const targetPath = pathArg ? resolvePath(pathArg, ctx.cwd, ctx.user.home) : ctx.cwd;

    if (!ctx.fs.exists(targetPath)) {
      return errOut(`ls: cannot access '${pathArg}': No such file or directory`);
    }

    // Single file — just show it
    if (!ctx.fs.isDirectory(targetPath)) {
      const stat = ctx.fs.stat(targetPath);
      const name = targetPath.split("/").pop() ?? targetPath;
      if (flags.l) {
        return {
          lines: [{
            content: `${stat.permissions}  ${formatSize(stat.size)} ${formatDate(stat.modified)}  ${name}`,
            clickAction: { command: `cat ${targetPath}` },
          }],
          exitCode: 0,
        };
      }
      return { lines: [{ content: name, clickAction: { command: `cat ${targetPath}` } }], exitCode: 0 };
    }

    const showAll = !!flags.a;
    const longFormat = !!flags.l;
    const sortByTime = !!flags.t;

    let entries = ctx.fs.list(targetPath);

    if (!showAll) {
      entries = entries.filter((e) => !e.startsWith("."));
    }

    if (sortByTime) {
      entries = [...entries].sort((a, b) => {
        const sa = ctx.fs.stat(resolvePath(a, targetPath, ctx.user.home));
        const sb = ctx.fs.stat(resolvePath(b, targetPath, ctx.user.home));
        return sb.modified - sa.modified;
      });
    } else {
      entries = [...entries].sort();
    }

    if (entries.length === 0) {
      return { lines: [], exitCode: 0 };
    }

    const lines: TerminalOutputLine[] = entries.map((entry) => {
      const fullPath = resolvePath(entry, targetPath, ctx.user.home);
      const isDir = ctx.fs.isDirectory(fullPath);
      const displayName = isDir ? `${entry}/` : entry;
      const clickAction = isDir
        ? { command: `cd ${fullPath} && ls` }
        : { command: `cat ${fullPath}` };

      if (longFormat) {
        const stat = ctx.fs.stat(fullPath);
        return {
          content: `${stat.permissions}  ${formatSize(stat.size)} ${formatDate(stat.modified)}  ${displayName}`,
          style: isDir ? ("highlight" as const) : undefined,
          clickAction,
        };
      }

      return {
        content: displayName,
        style: isDir ? ("highlight" as const) : undefined,
        clickAction,
      };
    });

    return { lines, exitCode: 0 };
  },
};

// --- cd ---

const cdCommand: Command = {
  name: "cd",
  aliases: [],
  description: "Change the current working directory",
  usage: "cd [path]",
  execute(args, _flags, _stdin, ctx) {
    let targetPath: string;

    if (args.length === 0) {
      targetPath = ctx.user.home;
    } else if (args[0] === "-") {
      const oldpwd = ctx.env.OLDPWD;
      if (!oldpwd) {
        return errOut("cd: OLDPWD not set");
      }
      targetPath = oldpwd;
    } else {
      targetPath = resolvePath(args[0], ctx.cwd, ctx.user.home);
    }

    if (!ctx.fs.exists(targetPath)) {
      return errOut(`cd: ${args[0] ?? targetPath}: No such file or directory`);
    }

    if (!ctx.fs.isDirectory(targetPath)) {
      return errOut(`cd: ${args[0]}: Not a directory`);
    }

    ctx.setEnv("OLDPWD", ctx.cwd);
    ctx.setCwd(targetPath);

    return { lines: [], exitCode: 0 };
  },
};

// --- pwd ---

const pwdCommand: Command = {
  name: "pwd",
  aliases: [],
  description: "Print the current working directory",
  usage: "pwd",
  execute(_args, _flags, _stdin, ctx) {
    return { lines: [{ content: ctx.cwd }], exitCode: 0 };
  },
};

// --- tree ---

function buildTree(
  fs: FileSystem,
  path: string,
  home: string,
  prefix: string,
  depth: number,
  maxDepth: number,
  lines: TerminalOutputLine[],
): void {
  if (depth > maxDepth) return;

  const entries = fs.list(path).sort();

  entries.forEach((entry, i) => {
    const isLast = i === entries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const fullPath = resolvePath(entry, path, home);
    const isDir = fs.isDirectory(fullPath);
    const displayName = isDir ? `${entry}/` : entry;

    lines.push({
      content: prefix + connector + displayName,
      style: isDir ? "highlight" : undefined,
      clickAction: isDir
        ? { command: `cd ${fullPath} && ls` }
        : { command: `cat ${fullPath}` },
    });

    if (isDir) {
      const childPrefix = prefix + (isLast ? "    " : "│   ");
      buildTree(fs, fullPath, home, childPrefix, depth + 1, maxDepth, lines);
    }
  });
}

const treeCommand: Command = {
  name: "tree",
  aliases: [],
  description: "Display directory tree structure",
  usage: "tree [-L depth] [path]",
  execute(args, flags, _stdin, ctx) {
    const rawDepth = typeof flags.L === "string" ? parseInt(flags.L, 10) : NaN;
    const maxDepth = isNaN(rawDepth) ? Infinity : rawDepth;

    const pathArg = args[0];
    const targetPath = pathArg ? resolvePath(pathArg, ctx.cwd, ctx.user.home) : ctx.cwd;

    if (!ctx.fs.exists(targetPath)) {
      return errOut(`tree: ${targetPath}: No such file or directory`);
    }

    if (!ctx.fs.isDirectory(targetPath)) {
      return { lines: [{ content: targetPath }], exitCode: 0 };
    }

    const lines: TerminalOutputLine[] = [{ content: targetPath, style: "highlight" }];
    buildTree(ctx.fs, targetPath, ctx.user.home, "", 1, maxDepth, lines);

    return { lines, exitCode: 0 };
  },
};

// --- xdg-open / open ---

// Exported as an object so tests can replace `.trigger` without fighting ESM
// binding immutability.
export const downloadImpl = {
  trigger(url: string, filename: string): void {
    if (typeof document === "undefined") return;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },
};

const xdgOpenCommand: Command = {
  name: "xdg-open",
  aliases: ["open"],
  description: "Open a file with its default application",
  usage: "xdg-open <file>",
  execute(args, _flags, _stdin, _ctx) {
    if (args.length === 0) {
      return errOut("xdg-open: no arguments given");
    }

    const filePath = args[0];
    const basename = filePath.split("/").pop() ?? filePath;
    const dotIdx = basename.lastIndexOf(".");
    const ext = dotIdx !== -1 ? basename.slice(dotIdx).toLowerCase() : "";

    if (ext === ".pdf") {
      downloadImpl.trigger("/luke-askew-resume.pdf", "luke-askew-resume.pdf");
      return {
        lines: [{ content: `Opening ${basename}…`, style: "dim" }],
        exitCode: 0,
      };
    }

    if (!ext) {
      return errOut(`xdg-open: no application registered for '${basename}'`);
    }

    return errOut(`xdg-open: no application registered for ${ext}`);
  },
};

// --- Register ---

registry.register(lsCommand);
registry.register(cdCommand);
registry.register(pwdCommand);
registry.register(treeCommand);
registry.register(xdgOpenCommand);
