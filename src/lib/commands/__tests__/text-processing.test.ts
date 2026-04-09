import { describe, it, expect, beforeEach } from "vitest";
import { isValidElement } from "react";
import type { Command, CommandContext, FileSystem, UserIdentity } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { executePipeline } from "@/lib/shell/executor";
import "@/lib/commands/text-processing";

const stubUser: UserIdentity = {
  username: "guest",
  uid: 1000,
  groups: ["guest"],
  home: "/home/guest",
  ps1: "$ ",
};

function makeFs(files: Record<string, string>, dirs = new Set<string>()): FileSystem {
  return {
    read: (path: string) => {
      if (dirs.has(path)) throw new Error("Is a directory");
      const c = files[path];
      if (c === undefined) throw new Error(`No such file or directory: ${path}`);
      return c;
    },
    write: () => {},
    delete: () => {},
    exists: (path: string) => dirs.has(path) || path in files,
    stat: () => ({ size: 0, created: 0, modified: 0, type: "file", permissions: "rw-r--r--" }),
    list: () => [],
    glob: () => [],
    isDirectory: (path: string) => dirs.has(path),
  };
}

function makeCtx(fs: FileSystem, cwd = "/home/guest"): CommandContext {
  return {
    fs,
    cwd,
    env: { HOME: "/home/guest", USER: "guest" },
    user: stubUser,
    aliases: {},
    history: [],
    setCwd: () => {},
    setEnv: () => {},
    setUser: () => {},
    addAlias: () => {},
  };
}

const pipeSource: Command = {
  name: "t304lines",
  aliases: [],
  description: "emit lines for pipe tests",
  usage: "t304lines",
  execute: () => ({
    lines: [{ content: "c" }, { content: "a" }, { content: "b" }],
    exitCode: 0,
  }),
};

beforeEach(() => {
  registry.register(pipeSource);
});

describe("sort", () => {
  const sort = registry.get("sort")!;

  it("sorts lines from stdin (pipe target)", async () => {
    const ctx = makeCtx(makeFs({}));
    const out = await sort.execute([], {}, "banana\napple\n", ctx);
    expect(out.exitCode).toBe(0);
    expect(out.lines.map((l) => l.content)).toEqual(["", "apple", "banana"]);
  });

  it("sorts alphabetically via pipeline", async () => {
    const ctx = makeCtx(makeFs({}));
    const out = await executePipeline(
      [
        { name: "t304lines", args: [], flags: {} },
        { name: "sort", args: [], flags: {} },
      ],
      ctx,
    );
    expect(out.exitCode).toBe(0);
    expect(out.lines.map((l) => l.content)).toEqual(["a", "b", "c"]);
  });

  it("sorts lines from a file", async () => {
    const fs = makeFs({ "/home/guest/words.txt": "zebra\napple\nmango\n" });
    const ctx = makeCtx(fs);
    const out = await sort.execute(["words.txt"], {}, null, ctx);
    expect(out.exitCode).toBe(0);
    expect(out.lines.map((l) => l.content)).toEqual(["", "apple", "mango", "zebra"]);
  });

  it("supports -r reverse sort as pipe target", async () => {
    const ctx = makeCtx(makeFs({}));
    const out = await executePipeline(
      [
        { name: "t304lines", args: [], flags: {} },
        { name: "sort", args: [], flags: { r: true } },
      ],
      ctx,
    );
    expect(out.lines.map((l) => l.content)).toEqual(["c", "b", "a"]);
  });

  it("supports -n numeric sort", async () => {
    const ctx = makeCtx(makeFs({}));
    const out = await sort.execute([], { n: true }, "10\n2\n1\n", ctx);
    expect(out.lines.map((l) => l.content)).toEqual(["1", "2", "10", ""]);
  });

  it("returns error for missing file", async () => {
    const ctx = makeCtx(makeFs({}));
    const out = await sort.execute(["nope.txt"], {}, null, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });
});

describe("uniq", () => {
  const uniq = registry.get("uniq")!;

  it("collapses adjacent duplicates from stdin (pipe)", async () => {
    const ctx = makeCtx(makeFs({}));
    const out = await uniq.execute([], {}, "a\na\nb\nb\nb\nc\n", ctx);
    expect(out.exitCode).toBe(0);
    expect(out.lines.map((l) => l.content)).toEqual(["a", "b", "c", ""]);
  });

  it("uniq as pipeline stage after sort removes all dups", async () => {
    const ctx = makeCtx(makeFs({}));
    const out = await executePipeline(
      [
        { name: "t304lines", args: [], flags: {} },
        { name: "sort", args: [], flags: {} },
        { name: "uniq", args: [], flags: {} },
      ],
      ctx,
    );
    expect(out.lines.map((l) => l.content)).toEqual(["a", "b", "c"]);
  });

  it("supports -c counts", async () => {
    const ctx = makeCtx(makeFs({}));
    const out = await uniq.execute([], { c: true }, "x\nx\nx\ny\n", ctx);
    expect(out.exitCode).toBe(0);
    expect(out.lines[0].content).toMatch(/^\s+3 x$/);
    expect(out.lines[1].content).toMatch(/^\s+1 y$/);
  });

  it("reads from file when args given", async () => {
    const fs = makeFs({ "/home/guest/d.txt": "one\none\ntwo\n" });
    const ctx = makeCtx(fs);
    const out = await uniq.execute(["d.txt"], {}, null, ctx);
    expect(out.lines.map((l) => l.content)).toEqual(["one", "two", ""]);
  });
});

describe("diff", () => {
  const diff = registry.get("diff")!;

  it("reports no differences for identical files", async () => {
    const fs = makeFs({ "/home/guest/a.txt": "line1\nline2\n", "/home/guest/b.txt": "line1\nline2\n" });
    const ctx = makeCtx(fs);
    const out = await diff.execute(["a.txt", "b.txt"], {}, null, ctx);
    expect(out.exitCode).toBe(0);
    expect(out.lines.map((l) => l.content)).toEqual([" line1", " line2", " "]);
  });

  it("shows +/- lines with colored spans for changes", async () => {
    const fs = makeFs({
      "/home/guest/old.txt": "keep\nold\n",
      "/home/guest/new.txt": "keep\nnew\n",
    });
    const ctx = makeCtx(fs);
    const out = await diff.execute(["old.txt", "new.txt"], {}, null, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toBe(" keep");
    expect(isValidElement(out.lines[1].content)).toBe(true);
    expect(isValidElement(out.lines[2].content)).toBe(true);
  });

  it("requires two file arguments", async () => {
    const ctx = makeCtx(makeFs({}));
    const out = await diff.execute(["only.txt"], {}, null, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });
});
