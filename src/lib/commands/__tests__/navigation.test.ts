import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FileSystem, CommandContext, UserIdentity } from "@/lib/types";

// Import the module — registrations happen as a side effect
import * as nav from "@/lib/commands/navigation";
import { registry } from "@/lib/shell/registry";

// --- Stub filesystem ---
//
// Structure:
//   /home/guest/
//     .bashrc           (file, size: 100, modified: 1000)
//     docs/             (dir, modified: 2000)
//       readme.md       (file, size: 200, modified: 3000)
//       notes.txt       (file, size: 150, modified: 2000)
//     projects/         (dir, modified: 4000)
//       site/           (dir, modified: 4000)
//         index.ts      (file, size: 500, modified: 4000)
//   /etc/               (dir)
//     passwd            (file, size: 80, modified: 500)

type FsEntry = { type: "file" | "directory"; size: number; modified: number; permissions: string };

const FS_MAP: Record<string, FsEntry> = {
  "/": { type: "directory", size: 0, modified: 0, permissions: "drwxr-xr-x" },
  "/home": { type: "directory", size: 0, modified: 0, permissions: "drwxr-xr-x" },
  "/home/guest": { type: "directory", size: 0, modified: 0, permissions: "drwxr-xr-x" },
  "/home/guest/.bashrc": { type: "file", size: 100, modified: 1000, permissions: "-rw-r--r--" },
  "/home/guest/docs": { type: "directory", size: 0, modified: 2000, permissions: "drwxr-xr-x" },
  "/home/guest/docs/readme.md": { type: "file", size: 200, modified: 3000, permissions: "-rw-r--r--" },
  "/home/guest/docs/notes.txt": { type: "file", size: 150, modified: 2000, permissions: "-rw-r--r--" },
  "/home/guest/projects": { type: "directory", size: 0, modified: 4000, permissions: "drwxr-xr-x" },
  "/home/guest/projects/site": { type: "directory", size: 0, modified: 4000, permissions: "drwxr-xr-x" },
  "/home/guest/projects/site/index.ts": { type: "file", size: 500, modified: 4000, permissions: "-rw-r--r--" },
  "/etc": { type: "directory", size: 0, modified: 500, permissions: "drwxr-xr-x" },
  "/etc/passwd": { type: "file", size: 80, modified: 500, permissions: "-rw-r--r--" },
};

const stubFs: FileSystem = {
  read: () => "",
  write: () => {},
  delete: () => {},
  exists: (path) => path in FS_MAP,
  stat: (path) => {
    const e = FS_MAP[path];
    if (!e) throw new Error(`stat: ${path}: No such file or directory`);
    return { size: e.size, created: 0, modified: e.modified, type: e.type, permissions: e.permissions };
  },
  list: (path) => {
    const prefix = path === "/" ? "/" : path + "/";
    const names = new Set<string>();
    for (const p of Object.keys(FS_MAP)) {
      if (p.startsWith(prefix)) {
        const rest = p.slice(prefix.length);
        const seg = rest.split("/")[0];
        if (seg) names.add(seg);
      }
    }
    return Array.from(names).sort();
  },
  glob: () => [],
  isDirectory: (path) => FS_MAP[path]?.type === "directory",
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

// --- ls ---

describe("ls", () => {
  it("lists cwd when no args", () => {
    const out = run("ls", []);
    const names = out.lines.map((l) => l.content);
    expect(names).toContain("docs/");
    expect(names).toContain("projects/");
    expect(out.exitCode).toBe(0);
  });

  it("excludes dotfiles by default", () => {
    const out = run("ls", []);
    const names = out.lines.map((l) => l.content);
    expect(names).not.toContain(".bashrc");
  });

  it("includes dotfiles with -a", () => {
    const out = run("ls", [], { a: true });
    const names = out.lines.map((l) => l.content);
    expect(names).toContain(".bashrc");
  });

  it("lists a specific directory path", () => {
    const out = run("ls", ["/home/guest/docs"]);
    const names = out.lines.map((l) => l.content);
    expect(names).toContain("readme.md");
    expect(names).toContain("notes.txt");
    expect(out.exitCode).toBe(0);
  });

  it("resolves relative paths", () => {
    const out = run("ls", ["docs"]);
    const names = out.lines.map((l) => l.content);
    expect(names).toContain("readme.md");
  });

  it("returns error for non-existent path", () => {
    const out = run("ls", ["nonexistent"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });

  it("returns empty lines for empty directory", () => {
    const emptyFs: FileSystem = {
      ...stubFs,
      exists: () => true,
      isDirectory: () => true,
      list: () => [],
    };
    const out = run("ls", [], {}, null, makeCtx({ fs: emptyFs }));
    expect(out.lines).toHaveLength(0);
    expect(out.exitCode).toBe(0);
  });

  it("shows directories with trailing slash and highlight style", () => {
    const out = run("ls", []);
    const docsLine = out.lines.find((l) => String(l.content).startsWith("docs"));
    expect(docsLine?.content).toBe("docs/");
    expect(docsLine?.style).toBe("highlight");
  });

  it("files have clickAction cat <path>", () => {
    const out = run("ls", ["docs"]);
    const mdLine = out.lines.find((l) => l.content === "readme.md");
    expect(mdLine?.clickAction?.command).toBe("cat /home/guest/docs/readme.md");
  });

  it("dirs have clickAction cd <path> && ls", () => {
    const out = run("ls", []);
    const docsLine = out.lines.find((l) => String(l.content).startsWith("docs"));
    expect(docsLine?.clickAction?.command).toBe("cd /home/guest/docs && ls");
  });

  it("long format includes permissions, size, date, name", () => {
    const out = run("ls", ["docs"], { l: true });
    expect(out.lines[0].content).toMatch(/-rw-r--r--/);
    expect(out.lines[0].content).toMatch(/notes\.txt/);
    expect(out.exitCode).toBe(0);
  });

  it("-la includes dotfiles in long format", () => {
    const out = run("ls", [], { l: true, a: true });
    const names = out.lines.map((l) => String(l.content));
    expect(names.some((n) => n.includes(".bashrc"))).toBe(true);
  });

  it("sorts by modification time newest-first with -t", () => {
    // docs/readme.md modified: 3000, docs/notes.txt modified: 2000
    const out = run("ls", ["docs"], { t: true });
    const names = out.lines.map((l) => l.content);
    expect(names.indexOf("readme.md")).toBeLessThan(names.indexOf("notes.txt"));
  });

  it("shows a single file when path points to a file", () => {
    const out = run("ls", ["/home/guest/docs/readme.md"]);
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].content).toBe("readme.md");
    expect(out.lines[0].clickAction?.command).toBe("cat /home/guest/docs/readme.md");
    expect(out.exitCode).toBe(0);
  });

  it("single file long format includes permissions", () => {
    const out = run("ls", ["/home/guest/docs/readme.md"], { l: true });
    expect(out.lines[0].content).toMatch(/-rw-r--r--/);
  });

  it("output is sorted alphabetically by default", () => {
    const out = run("ls", ["docs"]);
    const names = out.lines.map((l) => l.content);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});

// --- cd ---

describe("cd", () => {
  it("changes cwd to given absolute path", () => {
    const ctx = makeCtx();
    const out = run("cd", ["/home/guest/docs"], {}, null, ctx);
    expect(ctx.setCwd).toHaveBeenCalledWith("/home/guest/docs");
    expect(out.exitCode).toBe(0);
    expect(out.lines).toHaveLength(0);
  });

  it("resolves relative paths", () => {
    const ctx = makeCtx();
    run("cd", ["docs"], {}, null, ctx);
    expect(ctx.setCwd).toHaveBeenCalledWith("/home/guest/docs");
  });

  it("resolves ..", () => {
    const ctx = makeCtx({ cwd: "/home/guest/docs" });
    run("cd", [".."], {}, null, ctx);
    expect(ctx.setCwd).toHaveBeenCalledWith("/home/guest");
  });

  it("goes to home when no args", () => {
    const ctx = makeCtx({ cwd: "/etc" });
    run("cd", [], {}, null, ctx);
    expect(ctx.setCwd).toHaveBeenCalledWith("/home/guest");
  });

  it("goes to OLDPWD with cd -", () => {
    const ctx = makeCtx({ env: { HOME: "/home/guest", USER: "guest", OLDPWD: "/etc" } });
    run("cd", ["-"], {}, null, ctx);
    expect(ctx.setCwd).toHaveBeenCalledWith("/etc");
  });

  it("returns error when OLDPWD not set for cd -", () => {
    const ctx = makeCtx();
    const out = run("cd", ["-"], {}, null, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/OLDPWD not set/);
    expect(ctx.setCwd).not.toHaveBeenCalled();
  });

  it("returns error for non-existent path", () => {
    const ctx = makeCtx();
    const out = run("cd", ["nonexistent"], {}, null, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
    expect(ctx.setCwd).not.toHaveBeenCalled();
  });

  it("returns error when path is a file", () => {
    const ctx = makeCtx();
    const out = run("cd", ["/home/guest/docs/readme.md"], {}, null, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/Not a directory/);
    expect(ctx.setCwd).not.toHaveBeenCalled();
  });

  it("sets OLDPWD to previous cwd on success", () => {
    const ctx = makeCtx({ cwd: "/home/guest" });
    run("cd", ["/etc"], {}, null, ctx);
    expect(ctx.setEnv).toHaveBeenCalledWith("OLDPWD", "/home/guest");
  });
});

// --- pwd ---

describe("pwd", () => {
  it("prints the current working directory", () => {
    const out = run("pwd", [], {}, null, makeCtx({ cwd: "/home/guest/docs" }));
    expect(out.lines[0].content).toBe("/home/guest/docs");
    expect(out.exitCode).toBe(0);
  });

  it("prints root correctly", () => {
    const out = run("pwd", [], {}, null, makeCtx({ cwd: "/" }));
    expect(out.lines[0].content).toBe("/");
  });
});

// --- tree ---

describe("tree", () => {
  it("displays tree rooted at cwd", () => {
    const ctx = makeCtx({ cwd: "/home/guest/docs" });
    const out = run("tree", [], {}, null, ctx);
    const contents = out.lines.map((l) => String(l.content));
    expect(contents[0]).toBe("/home/guest/docs");
    expect(contents.some((c) => c.includes("readme.md"))).toBe(true);
    expect(contents.some((c) => c.includes("notes.txt"))).toBe(true);
    expect(out.exitCode).toBe(0);
  });

  it("displays tree rooted at given path", () => {
    const out = run("tree", ["/home/guest/docs"]);
    const contents = out.lines.map((l) => String(l.content));
    expect(contents[0]).toBe("/home/guest/docs");
    expect(contents.some((c) => c.includes("readme.md"))).toBe(true);
  });

  it("uses box-drawing characters", () => {
    const out = run("tree", ["/home/guest/docs"]);
    const contents = out.lines.map((l) => String(l.content));
    const hasBoxChars = contents.some((c) => c.includes("├── ") || c.includes("└── "));
    expect(hasBoxChars).toBe(true);
  });

  it("last item uses └── connector", () => {
    const out = run("tree", ["/home/guest/docs"]);
    const contents = out.lines.map((l) => String(l.content));
    const lastEntry = contents[contents.length - 1];
    expect(lastEntry).toMatch(/└── /);
  });

  it("non-last items use ├── connector", () => {
    const out = run("tree", ["/home/guest/docs"]);
    const contents = out.lines.map((l) => String(l.content));
    // notes.txt comes before readme.md alphabetically
    const notesLine = contents.find((c) => c.includes("notes.txt"));
    expect(notesLine).toMatch(/├── /);
  });

  it("directories have trailing slash and highlight style", () => {
    const out = run("tree", ["/home/guest"]);
    const docsLine = out.lines.find((l) => String(l.content).includes("docs"));
    expect(docsLine?.content).toMatch(/docs\//);
    expect(docsLine?.style).toBe("highlight");
  });

  it("files have clickAction cat <path>", () => {
    const out = run("tree", ["/home/guest/docs"]);
    const mdLine = out.lines.find((l) => String(l.content).includes("readme.md"));
    expect(mdLine?.clickAction?.command).toBe("cat /home/guest/docs/readme.md");
  });

  it("dirs have clickAction cd <path> && ls", () => {
    const out = run("tree", ["/home/guest"]);
    const docsLine = out.lines.find((l) => String(l.content).includes("docs/"));
    expect(docsLine?.clickAction?.command).toBe("cd /home/guest/docs && ls");
  });

  it("respects -L depth limit", () => {
    const out = run("tree", ["/home/guest"], { L: "1" });
    const contents = out.lines.map((l) => String(l.content));
    // With depth 1, we see docs/ and projects/ but NOT their children
    expect(contents.some((c) => c.includes("docs/"))).toBe(true);
    expect(contents.some((c) => c.includes("readme.md"))).toBe(false);
  });

  it("returns error for non-existent path", () => {
    const out = run("tree", ["/nonexistent"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });

  it("returns the path as a single line when path is a file", () => {
    const out = run("tree", ["/home/guest/docs/readme.md"]);
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].content).toBe("/home/guest/docs/readme.md");
    expect(out.exitCode).toBe(0);
  });
});

// --- xdg-open / open ---

describe("xdg-open", () => {
  let downloadSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    downloadSpy = vi.spyOn(nav.downloadImpl, "trigger").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("triggers download for resume.pdf", () => {
    const out = run("xdg-open", ["resume.pdf"]);
    expect(downloadSpy).toHaveBeenCalledWith("/luke-askew-resume.pdf", "luke-askew-resume.pdf");
    expect(out.exitCode).toBe(0);
  });

  it("triggers download for a pdf given by full path", () => {
    const out = run("xdg-open", ["/home/guest/resume.pdf"]);
    expect(downloadSpy).toHaveBeenCalledWith("/luke-askew-resume.pdf", "luke-askew-resume.pdf");
    expect(out.exitCode).toBe(0);
  });

  it("returns error for non-pdf extension", () => {
    const out = run("xdg-open", ["image.png"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
    expect(String(out.lines[0].content)).toMatch(/no application registered for .png/);
    expect(downloadSpy).not.toHaveBeenCalled();
  });

  it("returns error for extensionless file", () => {
    const out = run("xdg-open", ["Makefile"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
    expect(String(out.lines[0].content)).toMatch(/no application registered/);
  });

  it("returns error when no arguments given", () => {
    const out = run("xdg-open", []);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });

  it("open alias also triggers download for pdf", () => {
    const out = run("open", ["resume.pdf"]);
    expect(downloadSpy).toHaveBeenCalledWith("/luke-askew-resume.pdf", "luke-askew-resume.pdf");
    expect(out.exitCode).toBe(0);
  });

  it("open alias returns error for non-pdf", () => {
    const out = run("open", ["photo.jpg"]);
    expect(out.exitCode).toBe(1);
    expect(String(out.lines[0].content)).toMatch(/no application registered for .jpg/);
  });
});
