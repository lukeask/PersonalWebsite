import type { Command, CommandOutput, TerminalOutputLine } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { resolvePath, joinPath } from "@/lib/util/paths";
import { errOut } from "@/lib/util/output";

function parentDir(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return "/" + parts.slice(0, -1).join("/");
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? "/";
}

// --- Directory marker convention ---
// The overlay FS infers directories from file entries beneath them.
// To create an empty directory, we write a hidden `.keep` marker.

const DIR_MARKER = ".keep";

function dirMarkerPath(dirPath: string): string {
  return dirPath === "/" ? `/${DIR_MARKER}` : `${dirPath}/${DIR_MARKER}`;
}

function ensureDirectoryExists(dirPath: string, ctx: { fs: { exists(p: string): boolean; isDirectory(p: string): boolean; write(p: string, c: string): void } }): void {
  if (ctx.fs.exists(dirPath) && ctx.fs.isDirectory(dirPath)) return;
  ctx.fs.write(dirMarkerPath(dirPath), "");
}

// --- touch ---

const touchCommand: Command = {
  name: "touch",
  aliases: [],
  description: "Create empty files or update timestamps",
  usage: "touch <file...>",
  execute(args, _flags, _stdin, ctx) {
    if (args.length === 0) return errOut("touch: missing file operand");

    for (const arg of args) {
      const path = resolvePath(arg, ctx.cwd, ctx.user.home);
      const parent = parentDir(path);

      if (!ctx.fs.exists(parent) || !ctx.fs.isDirectory(parent)) {
        return errOut(`touch: cannot touch '${arg}': No such file or directory`);
      }

      if (ctx.fs.exists(path) && ctx.fs.isDirectory(path)) {
        continue;
      }

      if (ctx.fs.exists(path)) {
        const content = ctx.fs.read(path);
        ctx.fs.write(path, content);
      } else {
        ctx.fs.write(path, "");
      }
    }

    return { lines: [], exitCode: 0 };
  },
};

// --- mkdir ---

const mkdirCommand: Command = {
  name: "mkdir",
  aliases: [],
  description: "Create directories",
  usage: "mkdir [-p] <directory...>",
  execute(args, flags, _stdin, ctx) {
    if (args.length === 0) return errOut("mkdir: missing operand");

    const createParents = !!flags.p;

    for (const arg of args) {
      const path = resolvePath(arg, ctx.cwd, ctx.user.home);

      if (ctx.fs.exists(path)) {
        if (createParents) continue;
        return errOut(`mkdir: cannot create directory '${arg}': File exists`);
      }

      if (createParents) {
        const parts = path.split("/").filter(Boolean);
        let current = "";
        for (const part of parts) {
          current += "/" + part;
          if (!ctx.fs.exists(current) || !ctx.fs.isDirectory(current)) {
            ensureDirectoryExists(current, ctx);
          }
        }
      } else {
        const parent = parentDir(path);
        if (!ctx.fs.exists(parent) || !ctx.fs.isDirectory(parent)) {
          return errOut(`mkdir: cannot create directory '${arg}': No such file or directory`);
        }
        ensureDirectoryExists(path, ctx);
      }
    }

    return { lines: [], exitCode: 0 };
  },
};

// --- rm ---

function collectRecursive(path: string, ctx: { fs: { list(p: string): string[]; isDirectory(p: string): boolean } }): string[] {
  const results: string[] = [];
  if (ctx.fs.isDirectory(path)) {
    const entries = ctx.fs.list(path);
    for (const entry of entries) {
      const fullPath = joinPath(path, entry);
      results.push(...collectRecursive(fullPath, ctx));
    }
  }
  results.push(path);
  return results;
}

const rmCommand: Command = {
  name: "rm",
  aliases: [],
  description: "Remove files or directories",
  usage: "rm [-r|-rf] <file...>",
  execute(args, flags, _stdin, ctx) {
    if (args.length === 0) return errOut("rm: missing operand");

    const recursive = !!flags.r || !!flags.rf;
    const force = !!flags.f || !!flags.rf;

    for (const arg of args) {
      const path = resolvePath(arg, ctx.cwd, ctx.user.home);

      // Easter egg: rm -rf / is delegated, not executed
      if (recursive && path === "/") {
        return {
          lines: [{ content: "rm: refusing to remove '/' recursively. Nice try.", style: "bold" }],
          exitCode: 1,
        };
      }

      if (!ctx.fs.exists(path)) {
        if (force) continue;
        return errOut(`rm: cannot remove '${arg}': No such file or directory`);
      }

      if (ctx.fs.isDirectory(path)) {
        if (!recursive) {
          return errOut(`rm: cannot remove '${arg}': Is a directory`);
        }
        const allPaths = collectRecursive(path, ctx);
        for (const p of allPaths) {
          ctx.fs.delete(p);
        }
      } else {
        ctx.fs.delete(path);
      }
    }

    return { lines: [], exitCode: 0 };
  },
};

// --- mv ---

const mvCommand: Command = {
  name: "mv",
  aliases: [],
  description: "Move or rename files and directories",
  usage: "mv <source> <destination>",
  execute(args, _flags, _stdin, ctx) {
    if (args.length < 2) return errOut("mv: missing operand");
    if (args.length > 2) return errOut("mv: too many arguments");

    const srcPath = resolvePath(args[0], ctx.cwd, ctx.user.home);
    let destPath = resolvePath(args[1], ctx.cwd, ctx.user.home);

    if (!ctx.fs.exists(srcPath)) {
      return errOut(`mv: cannot stat '${args[0]}': No such file or directory`);
    }

    if (ctx.fs.exists(destPath) && ctx.fs.isDirectory(destPath)) {
      destPath = destPath === "/" ? `/${basename(srcPath)}` : `${destPath}/${basename(srcPath)}`;
    }

    if (ctx.fs.isDirectory(srcPath)) {
      const allPaths = collectRecursive(srcPath, ctx);
      for (const p of allPaths) {
        if (ctx.fs.isDirectory(p)) continue;
        const relativeSuffix = p.slice(srcPath.length);
        const newPath = destPath + relativeSuffix;
        const content = ctx.fs.read(p);
        ctx.fs.write(newPath, content);
        ctx.fs.delete(p);
      }
    } else {
      const content = ctx.fs.read(srcPath);
      ctx.fs.write(destPath, content);
      ctx.fs.delete(srcPath);
    }

    return { lines: [], exitCode: 0 };
  },
};

// --- cp ---

const cpCommand: Command = {
  name: "cp",
  aliases: [],
  description: "Copy files and directories",
  usage: "cp [-r] <source> <destination>",
  execute(args, flags, _stdin, ctx) {
    if (args.length < 2) return errOut("cp: missing operand");
    if (args.length > 2) return errOut("cp: too many arguments");

    const recursive = !!flags.r || !!flags.R;
    const srcPath = resolvePath(args[0], ctx.cwd, ctx.user.home);
    let destPath = resolvePath(args[1], ctx.cwd, ctx.user.home);

    if (!ctx.fs.exists(srcPath)) {
      return errOut(`cp: cannot stat '${args[0]}': No such file or directory`);
    }

    if (ctx.fs.isDirectory(srcPath) && !recursive) {
      return errOut(`cp: -r not specified; omitting directory '${args[0]}'`);
    }

    if (ctx.fs.exists(destPath) && ctx.fs.isDirectory(destPath)) {
      destPath = destPath === "/" ? `/${basename(srcPath)}` : `${destPath}/${basename(srcPath)}`;
    }

    if (ctx.fs.isDirectory(srcPath)) {
      const allPaths = collectRecursive(srcPath, ctx);
      for (const p of allPaths) {
        if (ctx.fs.isDirectory(p)) continue;
        const relativeSuffix = p.slice(srcPath.length);
        const newPath = destPath + relativeSuffix;
        const content = ctx.fs.read(p);
        ctx.fs.write(newPath, content);
      }
    } else {
      const content = ctx.fs.read(srcPath);
      ctx.fs.write(destPath, content);
    }

    return { lines: [], exitCode: 0 };
  },
};

// --- Register ---

registry.register(touchCommand);
registry.register(mkdirCommand);
registry.register(rmCommand);
registry.register(mvCommand);
registry.register(cpCommand);
