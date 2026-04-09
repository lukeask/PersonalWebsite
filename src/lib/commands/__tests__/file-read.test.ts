import { describe, it, expect, beforeAll, vi } from "vitest";
import type { FileSystem, CommandContext, UserIdentity } from "@/lib/types";

// Import the module — registrations happen as a side effect
import "@/lib/commands/file-read";
import { registry } from "@/lib/shell/registry";

// --- Stub filesystem ---

const FILES: Record<string, string> = {
  "/home/guest/readme.md":
    "# Hello World\n\nThis is **bold** text.\n\nSome *italic* text.\n\n`inline code` here.\n\n```\ncode block\n```\n",
  "/home/guest/notes.txt": "line one\nline two\nline three",
  "/home/guest/data.json": '{"key":"value"}',
  "/home/guest/script.ts": "export const x = 1;\nexport const y = 2;",
  "/home/guest/many.txt": Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n"),
  "/home/guest/empty.txt": "",
  "/home/guest/a.txt": "file a line 1\nfile a line 2",
  "/home/guest/b.txt": "file b line 1\nfile b line 2",
};

const DIRS = new Set(["/", "/home", "/home/guest", "/home/guest/projects"]);

const stubFs: FileSystem = {
  read: (path) => {
    if (FILES[path] !== undefined) return FILES[path];
    throw new Error(`No such file or directory: ${path}`);
  },
  write: () => {},
  delete: () => {},
  exists: (path) => path in FILES || DIRS.has(path),
  stat: (path) => ({
    size: FILES[path]?.length ?? 0,
    created: 1000000,
    modified: 2000000,
    type: DIRS.has(path) ? "directory" : "file",
    permissions: DIRS.has(path) ? "drwxr-xr-x" : "-r--r--r--",
  }),
  list: (path) => {
    const prefix = path === "/" ? "/" : path + "/";
    const names = new Set<string>();
    for (const f of Object.keys(FILES)) {
      if (f.startsWith(prefix)) {
        const rest = f.slice(prefix.length);
        const seg = rest.split("/")[0];
        if (seg) names.add(seg);
      }
    }
    return Array.from(names).sort();
  },
  glob: () => [],
  isDirectory: (path) => DIRS.has(path),
};

const stubUser: UserIdentity = {
  username: "guest",
  uid: 1000,
  groups: ["guest"],
  home: "/home/guest",
  ps1: "$ ",
};

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    fs: stubFs,
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
  stdin: string | null = null,
  ctx?: CommandContext,
) {
  const cmd = registry.get(name);
  if (!cmd) throw new Error(`Command not found: ${name}`);
  return cmd.execute(args, flags, stdin, ctx ?? makeCtx());
}

// --- cat ---

describe("cat", () => {
  it("reads a single file", () => {
    const out = run("cat", ["notes.txt"]);
    const text = out.lines.map((l) => l.content).join("\n");
    expect(text).toContain("line one");
    expect(text).toContain("line three");
    expect(out.exitCode).toBe(0);
  });

  it("concatenates multiple files", () => {
    const out = run("cat", ["a.txt", "b.txt"]);
    const text = out.lines.map((l) => l.content).join("\n");
    expect(text).toContain("file a line 1");
    expect(text).toContain("file b line 2");
    expect(out.exitCode).toBe(0);
  });

  it("renders markdown headers as bold", () => {
    const out = run("cat", ["readme.md"]);
    const headerLine = out.lines.find((l) => typeof l.content === "string" && (l.content as string).includes("Hello World"));
    expect(headerLine).toBeDefined();
    expect(headerLine?.style).toBe("bold");
    expect(out.exitCode).toBe(0);
  });

  it("renders markdown bold as bold style", () => {
    const out = run("cat", ["readme.md"]);
    const boldLine = out.lines.find((l) => l.style === "bold" && typeof l.content === "string" && (l.content as string).includes("bold"));
    expect(boldLine).toBeDefined();
  });

  it("renders markdown code blocks as dim", () => {
    const out = run("cat", ["readme.md"]);
    const dimLines = out.lines.filter((l) => l.style === "dim");
    expect(dimLines.length).toBeGreaterThan(0);
  });

  it("passes through stdin when no args given", () => {
    const out = run("cat", [], {}, "hello\nworld");
    expect(out.lines[0].content).toBe("hello");
    expect(out.lines[1].content).toBe("world");
    expect(out.exitCode).toBe(0);
  });

  it("returns empty output when no args and no stdin", () => {
    const out = run("cat", [], {}, null);
    expect(out.lines).toHaveLength(0);
    expect(out.exitCode).toBe(0);
  });

  it("returns error for non-existent file", () => {
    const out = run("cat", ["nope.txt"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
    expect(out.lines[0].content).toMatch(/No such file/);
  });

  it("returns error for directory", () => {
    const out = run("cat", ["projects"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
    expect(out.lines[0].content).toMatch(/Is a directory/);
  });

  it("resolves relative paths from cwd", () => {
    const ctx = makeCtx({ cwd: "/home" });
    const out = run("cat", ["guest/notes.txt"], {}, null, ctx);
    expect(out.exitCode).toBe(0);
    expect(out.lines[0].content).toBe("line one");
  });
});

// --- head ---

describe("head", () => {
  it("returns first 10 lines by default", () => {
    const out = run("head", ["many.txt"]);
    expect(out.lines).toHaveLength(10);
    expect(out.lines[0].content).toBe("line 1");
    expect(out.lines[9].content).toBe("line 10");
    expect(out.exitCode).toBe(0);
  });

  it("-n N returns first N lines", () => {
    const out = run("head", ["many.txt"], { n: "3" });
    expect(out.lines).toHaveLength(3);
    expect(out.lines[2].content).toBe("line 3");
  });

  it("returns all lines if N > total lines", () => {
    const out = run("head", ["notes.txt"], { n: "100" });
    expect(out.lines).toHaveLength(3);
  });

  it("works as pipe target (stdin)", () => {
    const out = run("head", [], { n: "2" }, "a\nb\nc\nd");
    expect(out.lines).toHaveLength(2);
    expect(out.lines[0].content).toBe("a");
    expect(out.lines[1].content).toBe("b");
  });

  it("uses empty string for null stdin as pipe target", () => {
    const out = run("head", [], {}, null);
    expect(out.exitCode).toBe(0);
  });

  it("returns error for non-existent file", () => {
    const out = run("head", ["ghost.txt"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });

  it("returns error for directory", () => {
    const out = run("head", ["projects"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/Is a directory/);
  });

  it("shows file headers for multiple files", () => {
    const out = run("head", ["a.txt", "b.txt"], { n: "1" });
    const headers = out.lines.filter((l) => typeof l.content === "string" && (l.content as string).startsWith("==>"));
    expect(headers).toHaveLength(2);
  });
});

// --- tail ---

describe("tail", () => {
  it("returns last 10 lines by default", () => {
    const out = run("tail", ["many.txt"]);
    expect(out.lines).toHaveLength(10);
    expect(out.lines[0].content).toBe("line 11");
    expect(out.lines[9].content).toBe("line 20");
    expect(out.exitCode).toBe(0);
  });

  it("-n N returns last N lines", () => {
    const out = run("tail", ["many.txt"], { n: "3" });
    expect(out.lines).toHaveLength(3);
    expect(out.lines[2].content).toBe("line 20");
  });

  it("returns all lines if N > total lines", () => {
    const out = run("tail", ["notes.txt"], { n: "100" });
    expect(out.lines).toHaveLength(3);
  });

  it("works as pipe target (stdin)", () => {
    const out = run("tail", [], { n: "2" }, "a\nb\nc\nd");
    expect(out.lines).toHaveLength(2);
    expect(out.lines[0].content).toBe("c");
    expect(out.lines[1].content).toBe("d");
  });

  it("returns error for non-existent file", () => {
    const out = run("tail", ["ghost.txt"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });

  it("returns error for directory", () => {
    const out = run("tail", ["projects"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/Is a directory/);
  });

  it("shows file headers for multiple files", () => {
    const out = run("tail", ["a.txt", "b.txt"], { n: "1" });
    const headers = out.lines.filter((l) => typeof l.content === "string" && (l.content as string).startsWith("==>"));
    expect(headers).toHaveLength(2);
  });
});

// --- file ---

describe("file", () => {
  it("reports directory", () => {
    const out = run("file", ["projects"]);
    expect(out.exitCode).toBe(0);
    expect(out.lines[0].content).toContain("directory");
  });

  it("reports markdown file type", () => {
    const out = run("file", ["readme.md"]);
    expect(out.exitCode).toBe(0);
    expect(out.lines[0].content).toContain("Markdown");
  });

  it("reports TypeScript file type", () => {
    const out = run("file", ["script.ts"]);
    expect(out.exitCode).toBe(0);
    expect(out.lines[0].content).toContain("TypeScript");
  });

  it("reports JSON file type", () => {
    const out = run("file", ["data.json"]);
    expect(out.lines[0].content).toContain("JSON");
  });

  it("returns error for non-existent file", () => {
    const out = run("file", ["ghost.txt"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });

  it("returns error for missing operand", () => {
    const out = run("file", []);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });

  it("handles multiple files", () => {
    const out = run("file", ["readme.md", "notes.txt"]);
    expect(out.lines).toHaveLength(2);
    expect(out.lines[0].content).toContain("Markdown");
    expect(out.lines[1].content).toContain("UTF-8 text");
  });
});

// --- wc ---

describe("wc", () => {
  it("default: shows lines, words, chars, filename", () => {
    const out = run("wc", ["notes.txt"]);
    expect(out.exitCode).toBe(0);
    const line = out.lines[0].content as string;
    // lines=3, words=6, chars=29 for "line one\nline two\nline three"
    expect(line).toContain("notes.txt");
    expect(line.trim().split(/\s+/).length).toBeGreaterThanOrEqual(4);
  });

  it("-l shows only line count", () => {
    const out = run("wc", ["notes.txt"], { l: true });
    const line = out.lines[0].content as string;
    expect(line).toContain("3");
    // Should not have separate word and char columns
    const parts = line.trim().split(/\s+/);
    expect(parts).toHaveLength(2); // count + filename
  });

  it("-w shows only word count", () => {
    const out = run("wc", ["notes.txt"], { w: true });
    const line = out.lines[0].content as string;
    expect(line).toContain("6");
    const parts = line.trim().split(/\s+/);
    expect(parts).toHaveLength(2);
  });

  it("-c shows only character count", () => {
    const out = run("wc", ["notes.txt"], { c: true });
    const notes = FILES["/home/guest/notes.txt"];
    const charCount = notes.length;
    const line = out.lines[0].content as string;
    expect(line).toContain(String(charCount));
  });

  it("works as pipe target (stdin)", () => {
    const out = run("wc", [], {}, "hello world\nfoo bar");
    expect(out.exitCode).toBe(0);
    const line = out.lines[0].content as string;
    // 2 lines, 4 words, 19 chars
    expect(line.trim()).toBeTruthy();
  });

  it("multiple files show each + total", () => {
    const out = run("wc", ["a.txt", "b.txt"]);
    expect(out.lines).toHaveLength(3);
    const totalLine = out.lines[2].content as string;
    expect(totalLine).toContain("total");
  });

  it("returns error for non-existent file", () => {
    const out = run("wc", ["ghost.txt"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });

  it("returns error for directory", () => {
    const out = run("wc", ["projects"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/Is a directory/);
  });

  it("-l with multiple files shows total", () => {
    const out = run("wc", ["a.txt", "b.txt"], { l: true });
    expect(out.lines).toHaveLength(3);
    expect((out.lines[2].content as string)).toContain("total");
  });

  it("empty file counts as 0 lines", () => {
    const out = run("wc", ["empty.txt"], { l: true });
    const line = out.lines[0].content as string;
    expect(line.trim()).toMatch(/^0/);
  });
});
