import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CommandContext, UserIdentity, FileSystem } from "@/lib/types";

import "@/lib/commands/environment";
import { registry } from "@/lib/shell/registry";

// --- localStorage mock ---

const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { localStorageStore[key] = value; },
  removeItem: (key: string) => { delete localStorageStore[key]; },
  clear: () => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]); },
  get length() { return Object.keys(localStorageStore).length; },
  key: (i: number) => Object.keys(localStorageStore)[i] ?? null,
};
vi.stubGlobal("localStorage", localStorageMock);

// --- Stubs ---

const stubFs: FileSystem = {
  read: () => "",
  write: () => {},
  delete: () => {},
  exists: () => false,
  stat: () => { throw new Error("not found"); },
  list: () => [],
  glob: () => [],
  isDirectory: () => false,
};

const stubUser: UserIdentity = {
  username: "guest",
  uid: 1000,
  groups: ["guest", "sudo"],
  home: "/home/guest",
  ps1: "$ ",
};

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    fs: stubFs,
    cwd: "/home/guest",
    env: { HOME: "/home/guest", USER: "guest", SHELL: "/bin/bash" },
    user: stubUser,
    aliases: {},
    history: [],
    setCwd: vi.fn(),
    setEnv: vi.fn(),
    setUser: vi.fn(),
    addAlias: vi.fn(),
    removeAlias: vi.fn(),
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

beforeEach(() => {
  localStorageMock.clear();
});

// --- echo ---

describe("echo", () => {
  it("prints arguments joined by spaces", () => {
    const out = run("echo", ["hello", "world"]);
    expect(out.lines[0].content).toBe("hello world");
    expect(out.exitCode).toBe(0);
  });

  it("prints empty line with no args", () => {
    const out = run("echo", []);
    expect(out.lines[0].content).toBe("");
    expect(out.exitCode).toBe(0);
  });

  it("-n suppresses trailing newline (single line output)", () => {
    const out = run("echo", ["hello"], { n: true });
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].content).toBe("hello");
  });

  it("-e processes \\n into separate lines", () => {
    const out = run("echo", ["line1\\nline2"], { e: true });
    expect(out.lines).toHaveLength(2);
    expect(out.lines[0].content).toBe("line1");
    expect(out.lines[1].content).toBe("line2");
  });

  it("-e processes \\t as tab", () => {
    const out = run("echo", ["a\\tb"], { e: true });
    expect(out.lines[0].content).toBe("a\tb");
  });

  it("-e processes \\\\ as backslash", () => {
    const out = run("echo", ["a\\\\b"], { e: true });
    expect(out.lines[0].content).toBe("a\\b");
  });

  it("without -e, escape sequences are literal", () => {
    const out = run("echo", ["a\\nb"]);
    expect(out.lines[0].content).toBe("a\\nb");
  });
});

// --- export ---

describe("export", () => {
  it("sets an env var via ctx.setEnv", () => {
    const ctx = makeCtx();
    run("export", ["FOO=bar"], {}, null, ctx);
    expect(ctx.setEnv).toHaveBeenCalledWith("FOO", "bar");
  });

  it("lists all env vars when no args", () => {
    const ctx = makeCtx({ env: { HOME: "/home/guest", USER: "guest" } });
    const out = run("export", [], {}, null, ctx);
    const contents = out.lines.map((l) => l.content as string);
    expect(contents.some((c) => c.startsWith("HOME="))).toBe(true);
    expect(contents.some((c) => c.startsWith("USER="))).toBe(true);
    expect(out.exitCode).toBe(0);
  });

  it("persists env var to localStorage", () => {
    run("export", ["MY_VAR=hello"]);
    const stored = JSON.parse(localStorageStore["askew:env"] ?? "{}") as Record<string, string>;
    expect(stored.MY_VAR).toBe("hello");
  });

  it("persists DO_NOT_TRACK so telemetry respects it on future loads", () => {
    run("export", ["DO_NOT_TRACK=1"]);
    const stored = JSON.parse(localStorageStore["askew:env"] ?? "{}") as Record<string, string>;
    expect(stored.DO_NOT_TRACK).toBe("1");
  });

  it("returns exitCode 0 on success", () => {
    const out = run("export", ["X=1"]);
    expect(out.exitCode).toBe(0);
  });
});

// --- env ---

describe("env", () => {
  it("lists all env vars in KEY=VALUE format", () => {
    const ctx = makeCtx({ env: { HOME: "/home/guest", USER: "guest" } });
    const out = run("env", [], {}, null, ctx);
    const contents = out.lines.map((l) => l.content as string);
    expect(contents.some((c) => c === "HOME=/home/guest")).toBe(true);
    expect(out.exitCode).toBe(0);
  });

  it("printenv is an alias for env", () => {
    const ctx = makeCtx({ env: { HOME: "/home/guest" } });
    const out = run("printenv", [], {}, null, ctx);
    expect(out.lines.some((l) => (l.content as string).includes("HOME"))).toBe(true);
  });

  it("printenv FOO prints value of FOO", () => {
    const ctx = makeCtx({ env: { FOO: "bar" } });
    const out = run("printenv", ["FOO"], {}, null, ctx);
    expect(out.lines[0].content).toBe("bar");
    expect(out.exitCode).toBe(0);
  });

  it("returns exitCode 1 when var not found", () => {
    const out = run("env", ["NONEXISTENT"]);
    expect(out.exitCode).toBe(1);
  });
});

// --- alias ---

describe("alias", () => {
  it("lists 'No aliases defined.' when no aliases set", () => {
    const out = run("alias", [], {}, null, makeCtx({ aliases: {} }));
    expect(out.lines[0].content).toMatch(/No aliases/i);
    expect(out.exitCode).toBe(0);
  });

  it("lists existing aliases in alias name='cmd' format", () => {
    const out = run("alias", [], {}, null, makeCtx({ aliases: { ll: "ls -la" } }));
    expect(out.lines[0].content).toBe("alias ll='ls -la'");
  });

  it("creates an alias and calls ctx.addAlias", () => {
    const ctx = makeCtx();
    run("alias", ["ll=ls -la"], {}, null, ctx);
    expect(ctx.addAlias).toHaveBeenCalledWith("ll", "ls -la");
  });

  it("strips surrounding quotes from expansion", () => {
    const ctx = makeCtx();
    run("alias", ["ll='ls -la'"], {}, null, ctx);
    expect(ctx.addAlias).toHaveBeenCalledWith("ll", "ls -la");
  });

  it("persists alias to localStorage", () => {
    run("alias", ["ll=ls -la"]);
    const stored = JSON.parse(localStorageStore["askew:aliases"] ?? "{}") as Record<string, string>;
    expect(stored.ll).toBe("ls -la");
  });

  it("shows a single alias when name given without =", () => {
    const out = run("alias", ["ll"], {}, null, makeCtx({ aliases: { ll: "ls -la" } }));
    expect(out.lines[0].content).toBe("alias ll='ls -la'");
  });

  it("returns error for unknown alias name", () => {
    const out = run("alias", ["nope"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });
});

// --- unalias ---

describe("unalias", () => {
  it("calls ctx.removeAlias", () => {
    const ctx = makeCtx({ aliases: { ll: "ls -la" } });
    run("unalias", ["ll"], {}, null, ctx);
    expect(ctx.removeAlias).toHaveBeenCalledWith("ll");
  });

  it("removes from localStorage", () => {
    localStorageStore["askew:aliases"] = JSON.stringify({ ll: "ls -la" });
    run("unalias", ["ll"]);
    const stored = JSON.parse(localStorageStore["askew:aliases"] ?? "{}") as Record<string, string>;
    expect(stored.ll).toBeUndefined();
  });

  it("returns error with no args", () => {
    const out = run("unalias", []);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });
});

// --- whoami ---

describe("whoami", () => {
  it("prints the current username", () => {
    const out = run("whoami", []);
    expect(out.lines[0].content).toBe("guest");
    expect(out.exitCode).toBe(0);
  });

  it("reflects ctx.user.username", () => {
    const ctx = makeCtx({ user: { ...stubUser, username: "luke" } });
    const out = run("whoami", [], {}, null, ctx);
    expect(out.lines[0].content).toBe("luke");
  });
});

// --- id ---

describe("id", () => {
  it("prints uid, gid, groups", () => {
    const out = run("id", []);
    const line = out.lines[0].content as string;
    expect(line).toMatch(/uid=1000\(guest\)/);
    expect(line).toMatch(/groups=/);
    expect(out.exitCode).toBe(0);
  });

  it("includes all groups", () => {
    const out = run("id", []);
    const line = out.lines[0].content as string;
    expect(line).toMatch(/guest/);
    expect(line).toMatch(/sudo/);
  });
});

// --- clear ---

describe("clear", () => {
  it("returns clearScreen: true", () => {
    const out = run("clear", []);
    expect(out.clearScreen).toBe(true);
    expect(out.exitCode).toBe(0);
  });

  it("returns empty lines", () => {
    const out = run("clear", []);
    expect(out.lines).toHaveLength(0);
  });
});

// --- history ---

describe("history", () => {
  it("prints numbered command history", () => {
    const ctx = makeCtx({
      history: [
        { command: "ls", timestamp: 1 },
        { command: "pwd", timestamp: 2 },
      ],
    });
    const out = run("history", [], {}, null, ctx);
    expect(out.lines).toHaveLength(2);
    expect(out.lines[0].content as string).toMatch(/1.*ls/);
    expect(out.lines[1].content as string).toMatch(/2.*pwd/);
    expect(out.exitCode).toBe(0);
  });

  it("limits output when n given", () => {
    const ctx = makeCtx({
      history: [
        { command: "ls", timestamp: 1 },
        { command: "cd /", timestamp: 2 },
        { command: "pwd", timestamp: 3 },
      ],
    });
    const out = run("history", ["2"], {}, null, ctx);
    expect(out.lines).toHaveLength(2);
    expect(out.lines[0].content as string).toMatch(/cd \//);
  });

  it("each entry has a clickAction to re-run the command", () => {
    const ctx = makeCtx({ history: [{ command: "ls -la", timestamp: 1 }] });
    const out = run("history", [], {}, null, ctx);
    expect(out.lines[0].clickAction?.command).toBe("ls -la");
  });

  it("returns empty output for empty history", () => {
    const out = run("history", []);
    expect(out.lines).toHaveLength(0);
  });
});

// --- which ---

describe("which", () => {
  it("returns path for known command", () => {
    const out = run("which", ["echo"]);
    expect(out.lines[0].content).toBe("/usr/bin/echo");
    expect(out.exitCode).toBe(0);
  });

  it("returns error for unknown command", () => {
    const out = run("which", ["foobar"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });

  it("handles multiple arguments", () => {
    const out = run("which", ["echo", "foobar"]);
    expect(out.lines).toHaveLength(2);
    expect(out.exitCode).toBe(1);
  });

  it("returns error when no args given", () => {
    const out = run("which", []);
    expect(out.exitCode).toBe(1);
  });
});

// --- type ---

describe("type", () => {
  it("identifies known command as shell builtin", () => {
    const out = run("type", ["echo"]);
    expect(out.lines[0].content as string).toMatch(/shell builtin/);
    expect(out.exitCode).toBe(0);
  });

  it("identifies aliases", () => {
    const ctx = makeCtx({ aliases: { ll: "ls -la" } });
    const out = run("type", ["ll"], {}, null, ctx);
    expect(out.lines[0].content as string).toMatch(/aliased to/);
    expect(out.lines[0].content as string).toMatch(/ls -la/);
  });

  it("returns error for unknown name", () => {
    const out = run("type", ["foobar"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });

  it("returns error when no args given", () => {
    const out = run("type", []);
    expect(out.exitCode).toBe(1);
  });
});

// --- help ---

describe("help", () => {
  it("lists available commands", () => {
    const out = run("help", []);
    const contents = out.lines.map((l) => l.content as string);
    expect(contents.some((c) => c.includes("echo"))).toBe(true);
    expect(contents.some((c) => c.includes("whoami"))).toBe(true);
    expect(out.exitCode).toBe(0);
  });

  it("shows usage for a specific command", () => {
    const out = run("help", ["echo"]);
    const contents = out.lines.map((l) => l.content as string);
    expect(contents.some((c) => c.toLowerCase().includes("usage"))).toBe(true);
    expect(out.exitCode).toBe(0);
  });

  it("returns error for unknown command", () => {
    const out = run("help", ["foobar"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });

  it("each command entry has a clickAction to open its help", () => {
    const out = run("help", []);
    const echoLine = out.lines.find((l) => (l.content as string).includes("echo"));
    expect(echoLine?.clickAction?.command).toBe("help echo");
  });
});
