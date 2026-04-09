import { describe, it, expect, beforeEach, vi } from "vitest";
import { isValidElement } from "react";
import { BaseFileSystem } from "@/lib/filesystem/base";
import type { FileEntry, CommandContext, UserIdentity } from "@/lib/types";
import { grepCommand, findCommand } from "../search";

function makeEntry(
  path: string,
  content: string = "",
  overrides: Partial<FileEntry["stat"]> = {},
): FileEntry {
  return {
    path,
    content,
    stat: {
      size: content.length,
      created: 1000000,
      modified: 2000000,
      type: "file",
      permissions: "-r--r--r--",
      ...overrides,
    },
  };
}

const testFiles: FileEntry[] = [
  makeEntry("/home/guest/readme.md", "Hello World\nline two\nHELLO again"),
  makeEntry("/home/guest/notes.md", "notes about Hello"),
  makeEntry("/home/guest/projects/foo/index.ts", "export default 42;\n// Hello"),
  makeEntry("/home/guest/projects/bar/main.ts", "console.log('bar');"),
  makeEntry("/etc/hostname", "askew.sh"),
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

describe("grep", () => {
  let fs: BaseFileSystem;
  let ctx: CommandContext;

  beforeEach(() => {
    fs = new BaseFileSystem(testFiles);
    ctx = makeCtx(fs);
  });

  it("finds pattern across a single file", async () => {
    const out = await grepCommand.execute(
      ["Hello", "readme.md"],
      {},
      null,
      ctx,
    );
    expect(out.exitCode).toBe(0);
    expect(out.lines.length).toBeGreaterThanOrEqual(1);
    const first = out.lines[0].content;
    const text =
      typeof first === "string" ? first : JSON.stringify(first);
    expect(text).toMatch(/Hello/);
    expect(text).toMatch(/World/);
  });

  it("searches multiple files with filename prefix", async () => {
    const out = await grepCommand.execute(
      ["Hello", "readme.md", "notes.md"],
      {},
      null,
      ctx,
    );
    expect(out.exitCode).toBe(0);
    expect(out.lines.length).toBe(2);
    expect(out.lines.every((l) => isValidElement(l.content))).toBe(true);
  });

  it("recursive grep finds matches in nested files", async () => {
    const out = await grepCommand.execute(
      ["Hello", "projects"],
      { r: true },
      null,
      ctx,
    );
    expect(out.exitCode).toBe(0);
    expect(out.lines.length).toBeGreaterThanOrEqual(1);
  });

  it("case-insensitive with -i", async () => {
    const out = await grepCommand.execute(
      ["hello", "readme.md"],
      { i: true },
      null,
      ctx,
    );
    expect(out.exitCode).toBe(0);
    expect(out.lines.length).toBeGreaterThanOrEqual(2);
  });

  it("filters piped stdin by pattern", async () => {
    const out = await grepCommand.execute(
      ["foo"],
      {},
      "alpha\nfoo bar\ngamma",
      ctx,
    );
    expect(out.exitCode).toBe(0);
    expect(out.lines).toHaveLength(1);
    expect(isValidElement(out.lines[0].content)).toBe(true);
    expect(JSON.stringify(out.lines[0].content)).toMatch(/foo/);
    expect(JSON.stringify(out.lines[0].content)).toMatch(/bar/);
  });

  it("highlights matches in output (React fragment)", async () => {
    const out = await grepCommand.execute(
      ["Hello", "readme.md"],
      {},
      null,
      ctx,
    );
    expect(out.exitCode).toBe(0);
    const hasHighlight = out.lines.some((l) => isValidElement(l.content));
    expect(hasHighlight).toBe(true);
  });
});

describe("find", () => {
  let fs: BaseFileSystem;
  let ctx: CommandContext;

  beforeEach(() => {
    fs = new BaseFileSystem(testFiles);
    ctx = makeCtx(fs);
  });

  it("lists paths under a directory recursively", async () => {
    const out = await findCommand.execute(["projects"], {}, null, ctx);
    expect(out.exitCode).toBe(0);
    const paths = out.lines.map((l) => String(l.content));
    expect(paths.some((p) => p.endsWith("index.ts"))).toBe(true);
    expect(paths.some((p) => p.endsWith("main.ts"))).toBe(true);
  });

  it("filters by --name glob", async () => {
    const out = await findCommand.execute([], { name: "*.md" }, null, ctx);
    expect(out.exitCode).toBe(0);
    const paths = out.lines.map((l) => String(l.content));
    expect(paths.every((p) => p.endsWith(".md"))).toBe(true);
    expect(paths).toContain("/home/guest/readme.md");
  });

  it("filters by --type=f", async () => {
    const out = await findCommand.execute(["."], { type: "f" }, null, ctx);
    expect(out.exitCode).toBe(0);
    for (const line of out.lines) {
      expect(fs.isDirectory(String(line.content))).toBe(false);
    }
  });

  it("supports find -- path -name pattern via args", async () => {
    const out = await findCommand.execute(
      ["--", "/home/guest", "-name", "*.ts"],
      {},
      null,
      ctx,
    );
    expect(out.exitCode).toBe(0);
    const paths = out.lines.map((l) => String(l.content));
    expect(paths.some((p) => p.endsWith(".ts"))).toBe(true);
    expect(paths.every((p) => p.endsWith(".ts"))).toBe(true);
  });

  it("attaches clickAction for each path", async () => {
    const out = await findCommand.execute(["readme.md"], {}, null, ctx);
    expect(out.exitCode).toBe(0);
    expect(out.lines[0].clickAction).toEqual({
      command: "cat /home/guest/readme.md",
    });
  });
});
