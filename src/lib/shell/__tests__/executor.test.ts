import { describe, it, expect, beforeEach, vi } from "vitest";
import { executeCommand, executePipeline, executeChain, execute } from "../executor";
import { registry } from "../registry";
import type { Command, CommandContext, CommandOutput, FileSystem, UserIdentity } from "@/lib/types";

// --- Minimal stub filesystem ---

const stubFs: FileSystem = {
  read: () => "",
  write: () => {},
  delete: () => {},
  exists: () => false,
  stat: () => ({ size: 0, created: 0, modified: 0, type: "file", permissions: "rw-r--r--" }),
  list: () => [],
  glob: () => [],
  isDirectory: () => false,
};

// --- Minimal stub user ---

const stubUser: UserIdentity = {
  username: "guest",
  uid: 1000,
  groups: ["guest"],
  home: "/home/guest",
  ps1: "$ ",
};

// --- Factory for CommandContext ---

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

// --- Register helpers ---

function makeCommand(
  name: string,
  aliases: string[] = [],
  fn?: (args: string[], _flags: Record<string, string | boolean>, stdin: string | null) => CommandOutput,
): Command {
  return {
    name,
    aliases,
    description: `test command ${name}`,
    usage: name,
    execute: fn
      ? (args, flags, stdin) => fn(args, flags, stdin)
      : (_args, _flags, stdin) => ({
          lines: [{ content: `${name}${stdin ? ` <<${stdin}` : ""}` }],
          exitCode: 0,
        }),
  };
}

beforeEach(() => {
  // Register a small set of test commands fresh before each test
  const echo = makeCommand("echo", [], (args) => ({
    lines: [{ content: args.join(" ") }],
    exitCode: 0,
  }));

  const upper = makeCommand("upper", [], (_args, _flags, stdin) => ({
    lines: [{ content: (stdin ?? "").toUpperCase() }],
    exitCode: 0,
  }));

  const fail = makeCommand("fail", [], () => ({
    lines: [{ content: "oops", style: "error" }],
    exitCode: 1,
  }));

  const next = makeCommand("next", [], () => ({
    lines: [{ content: "next ran" }],
    exitCode: 0,
  }));

  const thrower = makeCommand("thrower", [], () => {
    throw new Error("boom");
  });

  registry.register(echo);
  registry.register(upper);
  registry.register(fail);
  registry.register(next);
  registry.register(thrower);
});

// --- executeCommand ---

describe("executeCommand", () => {
  it("runs a known command and returns output", async () => {
    const ctx = makeCtx();
    const out = await executeCommand({ name: "echo", args: ["hello", "world"], flags: {} }, ctx);
    expect(out.exitCode).toBe(0);
    expect(out.lines[0].content).toBe("hello world");
  });

  it("returns command-not-found error for unknown command", async () => {
    const ctx = makeCtx();
    const out = await executeCommand({ name: "notacommand", args: [], flags: {} }, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/command not found: notacommand/);
    expect(out.lines[0].content).toMatch(/help/);
  });

  it("passes stdin to the command", async () => {
    const ctx = makeCtx();
    const out = await executeCommand({ name: "upper", args: [], flags: {} }, ctx, "hello");
    expect(out.lines[0].content).toBe("HELLO");
  });

  it("returns error output when command throws", async () => {
    const ctx = makeCtx();
    const out = await executeCommand({ name: "thrower", args: [], flags: {} }, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
    expect(out.lines[0].content).toMatch(/boom/);
  });

  it("returns empty output for empty command name", async () => {
    const ctx = makeCtx();
    const out = await executeCommand({ name: "", args: [], flags: {} }, ctx);
    expect(out.exitCode).toBe(0);
    expect(out.lines).toHaveLength(0);
  });
});

// --- sudo interception ---

describe("sudo handling", () => {
  it("intercepts sudo and returns sudoers error", async () => {
    const ctx = makeCtx();
    const out = await executeCommand({ name: "sudo", args: ["echo", "hi"], flags: {} }, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/not in the sudoers file/);
    expect(out.lines[1].content).toMatch(/another way/);
  });

  it("returns error when sudo has no subcommand", async () => {
    const ctx = makeCtx();
    const out = await executeCommand({ name: "sudo", args: [], flags: {} }, ctx);
    expect(out.exitCode).toBe(1);
  });
});

// --- executePipeline ---

describe("executePipeline", () => {
  it("runs a single-stage pipeline", async () => {
    const ctx = makeCtx();
    const out = await executePipeline([{ name: "echo", args: ["piped"], flags: {} }], ctx);
    expect(out.lines[0].content).toBe("piped");
  });

  it("pipes output of first command as stdin to second", async () => {
    const ctx = makeCtx();
    const out = await executePipeline(
      [
        { name: "echo", args: ["hello"], flags: {} },
        { name: "upper", args: [], flags: {} },
      ],
      ctx,
    );
    expect(out.lines[0].content).toBe("HELLO");
  });

  it("returns empty output for empty pipeline", async () => {
    const ctx = makeCtx();
    const out = await executePipeline([], ctx);
    expect(out.exitCode).toBe(0);
    expect(out.lines).toHaveLength(0);
  });
});

// --- executeChain ---

describe("executeChain with &&", () => {
  it("runs all commands when all succeed", async () => {
    const ctx = makeCtx();
    const out = await executeChain(
      [
        { pipeline: [{ name: "echo", args: ["a"], flags: {} }], operator: "&&" },
        { pipeline: [{ name: "next", args: [], flags: {} }], operator: null },
      ],
      ctx,
    );
    expect(out.lines[0].content).toBe("next ran");
    expect(out.exitCode).toBe(0);
  });

  it("stops on first failure with &&", async () => {
    const ctx = makeCtx();
    const out = await executeChain(
      [
        { pipeline: [{ name: "fail", args: [], flags: {} }], operator: "&&" },
        { pipeline: [{ name: "next", args: [], flags: {} }], operator: null },
      ],
      ctx,
    );
    // Should return the failing output and NOT have run "next ran"
    expect(out.lines[0].content).toBe("oops");
    expect(out.exitCode).toBe(1);
  });

  it("continues after failure with ;", async () => {
    const ctx = makeCtx();
    const out = await executeChain(
      [
        { pipeline: [{ name: "fail", args: [], flags: {} }], operator: ";" },
        { pipeline: [{ name: "next", args: [], flags: {} }], operator: null },
      ],
      ctx,
    );
    expect(out.lines[0].content).toBe("next ran");
    expect(out.exitCode).toBe(0);
  });
});

// --- execute (top-level) ---

describe("execute", () => {
  it("parses and runs a simple command", async () => {
    const ctx = makeCtx();
    const out = await execute("echo hello", ctx);
    expect(out.exitCode).toBe(0);
    expect(out.lines[0].content).toBe("hello");
  });

  it("returns empty output for blank input", async () => {
    const ctx = makeCtx();
    const out = await execute("   ", ctx);
    expect(out.exitCode).toBe(0);
    expect(out.lines).toHaveLength(0);
  });

  it("records the command in history", async () => {
    const ctx = makeCtx();
    await execute("echo recorded", ctx);
    expect(ctx.history.some((h) => h.command === "echo recorded")).toBe(true);
  });

  it("handles piped commands via raw input", async () => {
    const ctx = makeCtx();
    const out = await execute("echo world | upper", ctx);
    expect(out.lines[0].content).toBe("WORLD");
  });

  it("handles && chaining via raw input — stops on failure", async () => {
    const ctx = makeCtx();
    const out = await execute("fail && next", ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toBe("oops");
  });

  it("handles ; chaining via raw input — continues after failure", async () => {
    const ctx = makeCtx();
    const out = await execute("fail ; next", ctx);
    expect(out.exitCode).toBe(0);
    expect(out.lines[0].content).toBe("next ran");
  });

  it("intercepts sudo in raw input", async () => {
    const ctx = makeCtx();
    const out = await execute("sudo echo hi", ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/not in the sudoers file/);
  });

  it("returns command-not-found for unknown command", async () => {
    const ctx = makeCtx();
    const out = await execute("unknowncmd", ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].content).toMatch(/command not found: unknowncmd/);
  });
});
