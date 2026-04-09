import { describe, it, expect, vi } from "vitest";
import type { FileSystem, CommandContext, UserIdentity } from "@/lib/types";

import "@/lib/commands/git";
import { registry } from "@/lib/shell/registry";

// --- Git-aware filesystem stub ---
// Mimics the shape that MergedFileSystem exposes at runtime.

interface GitFsStub extends FileSystem {
  _files: Map<string, string>;
  _baseFiles: Map<string, string>;
  _tombstones: Set<string>;
  getModifiedPaths(): string[];
  getTombstonedPaths(): string[];
  readBase(path: string): string | null;
  reset: ReturnType<typeof vi.fn>;
}

function createGitFs(
  baseFiles: Record<string, string> = {},
  overlayFiles: Record<string, string> = {},
  tombstones: string[] = [],
): GitFsStub {
  const base = new Map(Object.entries(baseFiles));
  const overlay = new Map(Object.entries(overlayFiles));
  const tomb = new Set(tombstones);

  const allFiles = new Map([...base, ...overlay]);

  const fs: GitFsStub = {
    _files: allFiles,
    _baseFiles: base,
    _tombstones: tomb,

    read(path) {
      if (tomb.has(path)) throw new Error(`No such file: ${path}`);
      if (overlay.has(path)) return overlay.get(path)!;
      if (base.has(path)) return base.get(path)!;
      throw new Error(`No such file: ${path}`);
    },
    write(path, content) {
      overlay.set(path, content);
      allFiles.set(path, content);
    },
    delete(path) {
      tomb.add(path);
      overlay.delete(path);
      allFiles.delete(path);
    },
    exists(path) {
      if (tomb.has(path)) return false;
      return overlay.has(path) || base.has(path);
    },
    isDirectory() {
      return false;
    },
    stat(path) {
      const content = this.read(path);
      return {
        size: content.length,
        created: 0,
        modified: 0,
        type: "file",
        permissions: "-rw-r--r--",
      };
    },
    list() {
      return [];
    },
    glob() {
      return [];
    },

    getModifiedPaths() {
      return Array.from(overlay.keys()).sort();
    },
    getTombstonedPaths() {
      return Array.from(tomb).sort();
    },
    readBase(path) {
      return base.get(path) ?? null;
    },
    reset: vi.fn(async () => {
      overlay.clear();
      tomb.clear();
      allFiles.clear();
      for (const [k, v] of base) allFiles.set(k, v);
    }),
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

function makeCtx(
  fs: FileSystem,
  overrides: Partial<CommandContext> = {},
): CommandContext {
  return {
    fs,
    cwd: "/",
    env: {},
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

// Recursively extract plain text from a TerminalOutputLine content value,
// which may be a string or a nested React element tree.
function lineText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(lineText).join("");
  if (content && typeof content === "object") {
    const el = content as { props?: { children?: unknown } };
    if (el.props?.children !== undefined) return lineText(el.props.children);
  }
  return "";
}

function outputText(lines: { content: unknown }[]): string {
  return lines.map((l) => lineText(l.content)).join("\n");
}

async function run(
  sub: string,
  args: string[] = [],
  fs?: FileSystem,
): Promise<{ lines: { content: unknown }[]; exitCode: number }> {
  const cmd = registry.get("git");
  if (!cmd) throw new Error("git command not registered");
  const result = await cmd.execute(
    [sub, ...args],
    {},
    null,
    makeCtx(fs ?? createGitFs()),
  );
  return result;
}

// --- git status ---

describe("git status", () => {
  it("reports clean when overlay is empty", async () => {
    const fs = createGitFs({ "/home/readme.md": "hello" });
    const result = await run("status", [], fs);
    expect(result.exitCode).toBe(0);
    const text = outputText(result.lines);
    expect(text).toContain("nothing to commit");
    expect(text).toContain("working tree clean");
  });

  it("shows modified files when overlay contains a changed base file", async () => {
    const fs = createGitFs(
      { "/home/readme.md": "original" },
      { "/home/readme.md": "changed" },
    );
    const result = await run("status", [], fs);
    expect(result.exitCode).toBe(0);
    const text = outputText(result.lines);
    expect(text).toMatch(/modified|\/home\/readme\.md/);
  });

  it("shows new files when overlay has a file not in base", async () => {
    const fs = createGitFs({}, { "/home/newfile.txt": "hi" });
    const result = await run("status", [], fs);
    expect(result.exitCode).toBe(0);
    expect(outputText(result.lines)).toContain("newfile");
  });

  it("shows deleted files when a base file is tombstoned", async () => {
    const fs = createGitFs(
      { "/home/gone.md": "bye" },
      {},
      ["/home/gone.md"],
    );
    const result = await run("status", [], fs);
    expect(result.exitCode).toBe(0);
    const text = outputText(result.lines);
    expect(text).toMatch(/deleted|\/home\/gone\.md/);
  });
});

// --- git pull ---

describe("git pull", () => {
  it("returns 'Already up to date.' when overlay is empty", async () => {
    const fs = createGitFs({ "/home/readme.md": "hello" });
    const result = await run("pull", [], fs);
    expect(result.exitCode).toBe(0);
    expect(outputText(result.lines)).toContain("Already up to date");
  });

  it("calls reset() and reports changed files", async () => {
    const fs = createGitFs(
      { "/home/readme.md": "original", "/home/notes.md": "notes" },
      { "/home/readme.md": "changed" },
      ["/home/notes.md"],
    );

    const result = await run("pull", [], fs);
    expect(fs.reset).toHaveBeenCalledOnce();
    expect(result.exitCode).toBe(0);
    expect(outputText(result.lines)).toContain("Fast-forward");
  });

  it("lists all changed + deleted paths in output", async () => {
    const fs = createGitFs(
      { "/a.md": "a", "/b.md": "b" },
      { "/a.md": "modified" },
      ["/b.md"],
    );
    const result = await run("pull", [], fs);
    const text = outputText(result.lines);
    expect(text).toContain("/a.md");
    expect(text).toContain("/b.md");
  });
});

// --- git log ---

describe("git log", () => {
  it("returns a non-empty commit history", async () => {
    const result = await run("log");
    expect(result.exitCode).toBe(0);
    expect(result.lines.length).toBeGreaterThan(10);
  });

  it("first commit line contains HEAD", async () => {
    const result = await run("log");
    expect(lineText(result.lines[0].content)).toContain("HEAD");
  });
});

// --- git blame ---

describe("git blame", () => {
  it("errors when no file is given", async () => {
    const result = await run("blame", []);
    expect(result.exitCode).toBe(1);
  });

  it("errors on missing file", async () => {
    const fs = createGitFs();
    const result = await run("blame", ["/missing.ts"], fs);
    expect(result.exitCode).toBe(1);
  });

  it("produces one output line per file line", async () => {
    const content = "line one\nline two\nline three";
    const fs = createGitFs({ "/file.ts": content });
    const result = await run("blame", ["/file.ts"], fs);
    expect(result.exitCode).toBe(0);
    expect(result.lines.length).toBe(3);
  });
});

// --- unknown subcommand ---

describe("git unknown subcommand", () => {
  it("returns exit code 1 with error message", async () => {
    const result = await run("frobnicate");
    expect(result.exitCode).toBe(1);
  });
});
