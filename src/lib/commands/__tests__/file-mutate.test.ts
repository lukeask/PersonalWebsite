import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FileSystem, CommandContext, UserIdentity } from "@/lib/types";

import "@/lib/commands/file-mutate";
import { registry } from "@/lib/shell/registry";

// --- Mutable in-memory filesystem stub ---

interface FsEntry {
  content: string;
  type: "file" | "directory";
  modified: number;
}

function createMutableFs(initial: Record<string, string> = {}, dirs: string[] = []): FileSystem {
  const entries = new Map<string, FsEntry>();
  let clock = 1000000;

  for (const d of dirs) {
    entries.set(d, { content: "", type: "directory", modified: clock });
  }
  for (const [path, content] of Object.entries(initial)) {
    entries.set(path, { content, type: "file", modified: clock });
  }

  const fs: FileSystem = {
    read(path) {
      const e = entries.get(path);
      if (!e || e.type === "directory") throw new Error(`No such file or directory: ${path}`);
      return e.content;
    },
    write(path, content) {
      clock++;
      entries.set(path, { content, type: "file", modified: clock });
    },
    delete(path) {
      entries.delete(path);
    },
    exists(path) {
      if (entries.has(path)) return true;
      return fs.isDirectory(path);
    },
    stat(path) {
      const e = entries.get(path);
      if (e) {
        return {
          size: e.content.length,
          created: 1000000,
          modified: e.modified,
          type: e.type,
          permissions: e.type === "directory" ? "drwxr-xr-x" : "-rw-r--r--",
        };
      }
      if (fs.isDirectory(path)) {
        return { size: 4096, created: 1000000, modified: 1000000, type: "directory", permissions: "drwxr-xr-x" };
      }
      throw new Error(`No such file or directory: ${path}`);
    },
    list(path) {
      const prefix = path === "/" ? "/" : path + "/";
      const names = new Set<string>();
      for (const key of entries.keys()) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const seg = rest.split("/")[0];
          if (seg) names.add(seg);
        }
      }
      return Array.from(names).sort();
    },
    glob: () => [],
    isDirectory(path) {
      if (path === "/") return true;
      const e = entries.get(path);
      if (e?.type === "directory") return true;
      const prefix = path + "/";
      for (const key of entries.keys()) {
        if (key.startsWith(prefix)) return true;
      }
      return false;
    },
  };

  return fs;
}

const stubUser: UserIdentity = {
  username: "guest",
  uid: 1000,
  groups: ["guest"],
  home: "/home/guest",
  ps1: "$ ",
};

function makeCtx(fs: FileSystem, overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    fs,
    cwd: "/home/guest",
    env: { HOME: "/home/guest", USER: "guest" },
    user: stubUser,
    aliases: {},
    history: [],
    setCwd: vi.fn(),
    setEnv: vi.fn(),
    setUser: vi.fn(),
    addAlias: vi.fn(),
    ...overrides,
  };
}

function run(
  name: string,
  args: string[],
  flags: Record<string, string | boolean> = {},
  ctx?: CommandContext,
) {
  const cmd = registry.get(name);
  if (!cmd) throw new Error(`Command not found: ${name}`);
  return cmd.execute(args, flags, null, ctx ?? makeCtx(createMutableFs()));
}

function defaultFs() {
  return createMutableFs(
    {
      "/home/guest/file.txt": "hello world",
      "/home/guest/notes.txt": "line one\nline two",
      "/home/guest/projects/readme.md": "# Project",
      "/home/guest/projects/src/main.ts": "console.log('hi')",
    },
    ["/", "/home", "/home/guest", "/home/guest/projects", "/home/guest/projects/src"],
  );
}

// --- touch ---

describe("touch", () => {
  it("creates a new empty file", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("touch", ["newfile.txt"], {}, ctx);
    expect(out.exitCode).toBe(0);
    expect(fs.exists("/home/guest/newfile.txt")).toBe(true);
    expect(fs.read("/home/guest/newfile.txt")).toBe("");
  });

  it("updates modified timestamp on existing file", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const statBefore = fs.stat("/home/guest/file.txt");
    run("touch", ["file.txt"], {}, ctx);
    const statAfter = fs.stat("/home/guest/file.txt");
    expect(statAfter.modified).toBeGreaterThan(statBefore.modified);
    expect(fs.read("/home/guest/file.txt")).toBe("hello world");
  });

  it("writes to overlay filesystem", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    run("touch", ["brand-new.txt"], {}, ctx);
    expect(fs.exists("/home/guest/brand-new.txt")).toBe(true);
  });

  it("errors with missing operand", () => {
    const out = run("touch", []);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/missing file operand/);
  });

  it("errors when parent directory does not exist", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("touch", ["nonexistent/file.txt"], {}, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/No such file or directory/);
  });

  it("skips directories without error", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("touch", ["projects"], {}, ctx);
    expect(out.exitCode).toBe(0);
  });

  it("handles multiple files", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("touch", ["a.txt", "b.txt"], {}, ctx);
    expect(out.exitCode).toBe(0);
    expect(fs.exists("/home/guest/a.txt")).toBe(true);
    expect(fs.exists("/home/guest/b.txt")).toBe(true);
  });
});

// --- mkdir ---

describe("mkdir", () => {
  it("creates a directory", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("mkdir", ["newdir"], {}, ctx);
    expect(out.exitCode).toBe(0);
    expect(fs.isDirectory("/home/guest/newdir")).toBe(true);
  });

  it("errors if directory already exists", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("mkdir", ["projects"], {}, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/File exists/);
  });

  it("-p does not error if directory already exists", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("mkdir", ["projects"], { p: true }, ctx);
    expect(out.exitCode).toBe(0);
  });

  it("-p creates parent directories as needed", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("mkdir", ["a/b/c"], { p: true }, ctx);
    expect(out.exitCode).toBe(0);
    expect(fs.isDirectory("/home/guest/a")).toBe(true);
    expect(fs.isDirectory("/home/guest/a/b")).toBe(true);
    expect(fs.isDirectory("/home/guest/a/b/c")).toBe(true);
  });

  it("errors if parent does not exist without -p", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("mkdir", ["x/y"], {}, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/No such file or directory/);
  });

  it("errors with missing operand", () => {
    const out = run("mkdir", []);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/missing operand/);
  });
});

// --- rm ---

describe("rm", () => {
  it("removes a file", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("rm", ["file.txt"], {}, ctx);
    expect(out.exitCode).toBe(0);
    expect(fs.exists("/home/guest/file.txt")).toBe(false);
  });

  it("errors for non-existent file", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("rm", ["ghost.txt"], {}, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/No such file or directory/);
  });

  it("-f silently ignores non-existent files", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("rm", ["ghost.txt"], { f: true }, ctx);
    expect(out.exitCode).toBe(0);
  });

  it("errors when trying to remove directory without -r", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("rm", ["projects"], {}, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/Is a directory/);
  });

  it("-r removes directory recursively", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("rm", ["projects"], { r: true }, ctx);
    expect(out.exitCode).toBe(0);
    expect(fs.exists("/home/guest/projects")).toBe(false);
    expect(fs.exists("/home/guest/projects/readme.md")).toBe(false);
    expect(fs.exists("/home/guest/projects/src/main.ts")).toBe(false);
  });

  it("-rf removes directory recursively", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("rm", ["projects"], { rf: true }, ctx);
    expect(out.exitCode).toBe(0);
    expect(fs.exists("/home/guest/projects")).toBe(false);
  });

  it("rm -rf / shows easter egg message", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("rm", ["/"], { rf: true }, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/refusing to remove/i);
  });

  it("errors with missing operand", () => {
    const out = run("rm", []);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/missing operand/);
  });

  it("creates tombstone for overlay delete (file disappears from exists)", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    expect(fs.exists("/home/guest/file.txt")).toBe(true);
    run("rm", ["file.txt"], {}, ctx);
    expect(fs.exists("/home/guest/file.txt")).toBe(false);
  });
});

// --- mv ---

describe("mv", () => {
  it("moves a file to a new name", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("mv", ["file.txt", "renamed.txt"], {}, ctx);
    expect(out.exitCode).toBe(0);
    expect(fs.exists("/home/guest/file.txt")).toBe(false);
    expect(fs.exists("/home/guest/renamed.txt")).toBe(true);
    expect(fs.read("/home/guest/renamed.txt")).toBe("hello world");
  });

  it("moves a file into a directory", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("mv", ["file.txt", "projects"], {}, ctx);
    expect(out.exitCode).toBe(0);
    expect(fs.exists("/home/guest/file.txt")).toBe(false);
    expect(fs.exists("/home/guest/projects/file.txt")).toBe(true);
  });

  it("moves a directory", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    run("mkdir", ["dest"], {}, ctx);
    const out = run("mv", ["projects", "dest"], {}, ctx);
    expect(out.exitCode).toBe(0);
    expect(fs.exists("/home/guest/dest/projects/readme.md")).toBe(true);
    expect(fs.exists("/home/guest/projects/readme.md")).toBe(false);
  });

  it("errors for non-existent source", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("mv", ["ghost.txt", "dest.txt"], {}, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/No such file or directory/);
  });

  it("errors with missing operand", () => {
    const out = run("mv", ["only-one"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/missing operand/);
  });

  it("errors with too many arguments", () => {
    const out = run("mv", ["a", "b", "c"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/too many arguments/);
  });
});

// --- cp ---

describe("cp", () => {
  it("copies a file", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("cp", ["file.txt", "copy.txt"], {}, ctx);
    expect(out.exitCode).toBe(0);
    expect(fs.exists("/home/guest/file.txt")).toBe(true);
    expect(fs.exists("/home/guest/copy.txt")).toBe(true);
    expect(fs.read("/home/guest/copy.txt")).toBe("hello world");
  });

  it("copies a file into a directory", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("cp", ["file.txt", "projects"], {}, ctx);
    expect(out.exitCode).toBe(0);
    expect(fs.exists("/home/guest/projects/file.txt")).toBe(true);
    expect(fs.read("/home/guest/projects/file.txt")).toBe("hello world");
  });

  it("errors when copying directory without -r", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("cp", ["projects", "backup"], {}, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/-r not specified/);
  });

  it("-r copies directory recursively", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("cp", ["projects", "backup"], { r: true }, ctx);
    expect(out.exitCode).toBe(0);
    expect(fs.exists("/home/guest/backup/readme.md")).toBe(true);
    expect(fs.read("/home/guest/backup/readme.md")).toBe("# Project");
    expect(fs.exists("/home/guest/backup/src/main.ts")).toBe(true);
    expect(fs.exists("/home/guest/projects/readme.md")).toBe(true);
  });

  it("-R also works for recursive copy", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("cp", ["projects", "backup"], { R: true }, ctx);
    expect(out.exitCode).toBe(0);
    expect(fs.exists("/home/guest/backup/readme.md")).toBe(true);
  });

  it("errors for non-existent source", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    const out = run("cp", ["ghost.txt", "dest.txt"], {}, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/No such file or directory/);
  });

  it("errors with missing operand", () => {
    const out = run("cp", ["only-one"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/missing operand/);
  });

  it("errors with too many arguments", () => {
    const out = run("cp", ["a", "b", "c"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/too many arguments/);
  });

  it("preserves original after copy", () => {
    const fs = defaultFs();
    const ctx = makeCtx(fs);
    run("cp", ["file.txt", "copy.txt"], {}, ctx);
    expect(fs.read("/home/guest/file.txt")).toBe("hello world");
  });
});
