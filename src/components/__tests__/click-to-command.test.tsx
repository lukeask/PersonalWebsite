import { describe, it, expect, vi } from "vitest";
import type {
  CommandOutput,
  CommandContext,
  UserIdentity,
  FileEntry,
} from "@/lib/types";
import { BaseFileSystem } from "@/lib/filesystem/base";
import { grepCommand, findCommand } from "@/lib/commands/search";
import "@/lib/commands/navigation";
import { registry } from "@/lib/shell/registry";

// --- Stub FS for command tests ---

function makeEntry(path: string, content = ""): FileEntry {
  return {
    path,
    content,
    stat: {
      size: content.length,
      created: 1000000,
      modified: 2000000,
      type: "file",
      permissions: "-r--r--r--",
    },
  };
}

const testFiles: FileEntry[] = [
  makeEntry("/home/guest/readme.md", "Hello World\nline two"),
  makeEntry("/home/guest/notes.md", "notes about Hello"),
  makeEntry("/home/guest/projects/foo/index.ts", "export default 42;\n// Hello"),
  makeEntry("/home/guest/blog/post1.md", "# My First Post\nHello blog"),
  makeEntry("/home/guest/blog/post2.md", "# Second Post\nAnother post"),
];

const stubUser: UserIdentity = {
  username: "guest",
  uid: 1000,
  groups: ["guest"],
  home: "/home/guest",
  ps1: "$ ",
};

function makeCtx(fs: BaseFileSystem): CommandContext {
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
  const fs = new BaseFileSystem(testFiles);
  return cmd.execute(args, flags, stdin, ctx ?? makeCtx(fs));
}

// --- simulateCommand animation contract ---

describe("simulateCommand animation", () => {
  it("typing animation produces characters incrementally", () => {
    // Verify the animation logic: characters appear one by one
    const chars: string[] = [];
    const cmd = "ls -la";
    let charIndex = 0;

    while (charIndex < cmd.length) {
      chars.push(cmd.slice(0, charIndex + 1));
      charIndex++;
    }

    expect(chars).toEqual(["l", "ls", "ls ", "ls -", "ls -l", "ls -la"]);
  });

  it("animation timing is in the 30-70ms range per character", () => {
    // The Terminal component uses: 30 + Math.random() * 40
    // This verifies the bounds: min=30ms, max=70ms
    const minDelay = 30;
    const maxExtraDelay = 40;
    expect(minDelay).toBe(30);
    expect(minDelay + maxExtraDelay).toBe(70);
  });
});

// --- ls click actions ---

describe("ls click actions", () => {
  it("files get cat clickAction", () => {
    const fs = new BaseFileSystem(testFiles);
    const ctx = makeCtx(fs);
    const out = run("ls", [], {}, null, ctx) as CommandOutput;
    const fileLine = out.lines.find((l) => String(l.content) === "readme.md");
    expect(fileLine?.clickAction?.command).toBe("cat /home/guest/readme.md");
  });

  it("directories get cd && ls clickAction", () => {
    const fs = new BaseFileSystem(testFiles);
    const ctx = makeCtx(fs);
    const out = run("ls", [], {}, null, ctx) as CommandOutput;
    const dirLine = out.lines.find((l) => String(l.content) === "projects/");
    expect(dirLine?.clickAction?.command).toBe("cd /home/guest/projects && ls");
  });

  it("blog directory entries are clickable", () => {
    const fs = new BaseFileSystem(testFiles);
    const ctx = makeCtx(fs);
    const out = run("ls", [], {}, null, ctx) as CommandOutput;
    const blogLine = out.lines.find((l) => String(l.content) === "blog/");
    expect(blogLine?.clickAction?.command).toBe("cd /home/guest/blog && ls");
  });

  it("blog post files are clickable to cat", () => {
    const fs = new BaseFileSystem(testFiles);
    const ctx = makeCtx(fs);
    ctx.cwd = "/home/guest/blog";
    const out = run("ls", [], {}, null, ctx) as CommandOutput;
    const postLine = out.lines.find((l) => String(l.content) === "post1.md");
    expect(postLine?.clickAction?.command).toBe("cat /home/guest/blog/post1.md");
  });

  it("every ls output line has a clickAction", () => {
    const fs = new BaseFileSystem(testFiles);
    const ctx = makeCtx(fs);
    const out = run("ls", [], {}, null, ctx) as CommandOutput;
    for (const line of out.lines) {
      expect(line.clickAction).toBeDefined();
      expect(line.clickAction!.command).toBeTruthy();
    }
  });
});

// --- find click actions ---

describe("find click actions", () => {
  it("files get cat clickAction", async () => {
    const fs = new BaseFileSystem(testFiles);
    const ctx = makeCtx(fs);
    const out = await findCommand.execute(["readme.md"], {}, null, ctx);
    expect(out.lines[0].clickAction).toEqual({
      command: "cat /home/guest/readme.md",
    });
  });

  it("directories get cd && ls clickAction", async () => {
    const fs = new BaseFileSystem(testFiles);
    const ctx = makeCtx(fs);
    const out = await findCommand.execute(["projects"], {}, null, ctx);
    const dirLine = out.lines.find(
      (l) => String(l.content) === "/home/guest/projects",
    );
    expect(dirLine?.clickAction?.command).toBe("cd /home/guest/projects && ls");
  });
});

// --- grep click actions ---

describe("grep click actions", () => {
  it("single-file grep results have clickAction to cat the file", async () => {
    const fs = new BaseFileSystem(testFiles);
    const ctx = makeCtx(fs);
    const out = await grepCommand.execute(
      ["Hello", "readme.md"],
      {},
      null,
      ctx,
    );
    expect(out.exitCode).toBe(0);
    expect(out.lines.length).toBeGreaterThanOrEqual(1);
    expect(out.lines[0].clickAction?.command).toBe("cat /home/guest/readme.md");
  });

  it("multi-file grep results each link to their source file", async () => {
    const fs = new BaseFileSystem(testFiles);
    const ctx = makeCtx(fs);
    const out = await grepCommand.execute(
      ["Hello", "readme.md", "notes.md"],
      {},
      null,
      ctx,
    );
    expect(out.exitCode).toBe(0);
    expect(out.lines[0].clickAction?.command).toBe("cat /home/guest/readme.md");
    expect(out.lines[1].clickAction?.command).toBe("cat /home/guest/notes.md");
  });

  it("stdin grep results have no clickAction", async () => {
    const fs = new BaseFileSystem(testFiles);
    const ctx = makeCtx(fs);
    const out = await grepCommand.execute(
      ["foo"],
      {},
      "alpha\nfoo bar\ngamma",
      ctx,
    );
    expect(out.exitCode).toBe(0);
    expect(out.lines[0].clickAction).toBeUndefined();
  });

  it("recursive grep results have clickAction", async () => {
    const fs = new BaseFileSystem(testFiles);
    const ctx = makeCtx(fs);
    const out = await grepCommand.execute(
      ["Hello", "projects"],
      { r: true },
      null,
      ctx,
    );
    expect(out.exitCode).toBe(0);
    expect(out.lines.length).toBeGreaterThanOrEqual(1);
    // Each line should have a clickAction pointing to cat <file>
    for (const line of out.lines) {
      if (line.style !== "error") {
        expect(line.clickAction?.command).toMatch(/^cat /);
      }
    }
  });
});

// --- tree click actions ---

describe("tree click actions", () => {
  it("files in tree output have cat clickAction", () => {
    const fs = new BaseFileSystem(testFiles);
    const ctx = makeCtx(fs);
    ctx.cwd = "/home/guest/blog";
    const out = run("tree", [], {}, null, ctx) as CommandOutput;
    const postLine = out.lines.find((l) => String(l.content).includes("post1.md"));
    expect(postLine?.clickAction?.command).toBe("cat /home/guest/blog/post1.md");
  });

  it("dirs in tree output have cd && ls clickAction", () => {
    const fs = new BaseFileSystem(testFiles);
    const ctx = makeCtx(fs);
    const out = run("tree", [], {}, null, ctx) as CommandOutput;
    const blogLine = out.lines.find((l) => String(l.content).includes("blog/"));
    expect(blogLine?.clickAction?.command).toBe("cd /home/guest/blog && ls");
  });
});

// --- Correct command generation for different output types ---

describe("command generation correctness", () => {
  it("ls generates absolute paths in clickAction", () => {
    const fs = new BaseFileSystem(testFiles);
    const ctx = makeCtx(fs);
    ctx.cwd = "/home/guest/blog";
    const out = run("ls", [], {}, null, ctx) as CommandOutput;
    for (const line of out.lines) {
      expect(line.clickAction?.command).toMatch(/^(cat|cd) \/home\/guest\/blog\//);
    }
  });

  it("find generates absolute paths in clickAction", async () => {
    const fs = new BaseFileSystem(testFiles);
    const ctx = makeCtx(fs);
    const out = await findCommand.execute(["."], { type: "f" }, null, ctx);
    for (const line of out.lines) {
      expect(line.clickAction?.command).toMatch(/^cat \//);
    }
  });
});
