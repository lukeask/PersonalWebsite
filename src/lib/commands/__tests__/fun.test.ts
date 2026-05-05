import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FileSystem, CommandContext, UserIdentity } from "@/lib/types";

// Provide minimal React stubs so fun commands can be imported in Node (no DOM).
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: vi.fn((init: unknown) => [init, vi.fn()]),
    useEffect: vi.fn(),
    useRef: vi.fn((init: unknown) => ({ current: init })),
    useCallback: vi.fn((fn: unknown) => fn),
  };
});

// Import the module — side effect registers commands
import "@/lib/commands/fun";
import { isForkBomb, makeForkBombOutput } from "@/lib/commands/fun";
import { registry } from "@/lib/shell/registry";

// ─── Stubs ────────────────────────────────────────────────────────────────────

const stubFs: FileSystem = {
  read: () => "",
  write: () => {},
  delete: () => {},
  exists: () => false,
  stat: () => ({ size: 0, created: 0, modified: 0, type: "file", permissions: "-rw-r--r--" }),
  list: () => [],
  glob: () => [],
  isDirectory: () => false,
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

function run(name: string, args: string[] = [], flags: Record<string, string | boolean> = {}) {
  const cmd = registry.get(name);
  expect(cmd, `command '${name}' not registered`).toBeDefined();
  return cmd!.execute(args, flags, null, makeCtx());
}

// ─── isForkBomb ───────────────────────────────────────────────────────────────

describe("isForkBomb", () => {
  it("detects classic fork bomb", () => {
    expect(isForkBomb(":(){ :|:& };:")).toBe(true);
  });

  it("detects variant with no spaces", () => {
    expect(isForkBomb(":(){ :|:&};:")).toBe(true);
  });

  it("does not flag a plain colon", () => {
    expect(isForkBomb(":")).toBe(false);
  });

  it("does not flag random input", () => {
    expect(isForkBomb("echo hello")).toBe(false);
  });
});

// ─── makeForkBombOutput ───────────────────────────────────────────────────────

describe("makeForkBombOutput", () => {
  it("returns exitCode 0 with content", () => {
    const out = makeForkBombOutput();
    expect(out.exitCode).toBe(0);
    expect(out.lines.length).toBeGreaterThan(0);
  });
});

// ─── cowsay ───────────────────────────────────────────────────────────────────

describe("cowsay", () => {
  it("renders without crashing", async () => {
    const out = await run("cowsay", ["Hello,", "world!"]);
    expect(out.exitCode).toBe(0);
    expect(out.lines.length).toBeGreaterThan(0);
  });

  it("uses stdin when no args given", async () => {
    const cmd = registry.get("cowsay")!;
    const out = await cmd.execute([], {}, "from stdin", makeCtx());
    expect(out.exitCode).toBe(0);
  });

  it("errors when no message and no stdin", async () => {
    const cmd = registry.get("cowsay")!;
    const out = await cmd.execute([], {}, null, makeCtx());
    expect(out.exitCode).toBe(1);
  });

  it("speech bubble contains the message", async () => {
    const out = await run("cowsay", ["moo"]);
    const text = out.lines.map((l) => l.content).join("\n");
    expect(text).toContain("moo");
  });
});

// ─── figlet ───────────────────────────────────────────────────────────────────

describe("figlet", () => {
  it("renders 5 rows without crashing", async () => {
    const out = await run("figlet", ["HI"]);
    expect(out.exitCode).toBe(0);
    expect(out.lines.length).toBe(5);
  });

  it("errors on empty input", async () => {
    const out = await run("figlet", []);
    expect(out.exitCode).toBe(1);
  });

  it("handles numbers", async () => {
    const out = await run("figlet", ["42"]);
    expect(out.exitCode).toBe(0);
    expect(out.lines.length).toBe(5);
  });
});

// ─── make ────────────────────────────────────────────────────────────────────

describe("make", () => {
  it("no target prints stop message", async () => {
    const out = await run("make");
    expect(out.exitCode).toBe(0);
    const text = out.lines.map((l) => l.content).join(" ");
    expect(text).toContain("No targets");
  });

  it("make coffee returns ASCII art", async () => {
    const out = await run("make", ["coffee"]);
    expect(out.exitCode).toBe(0);
    expect(out.lines.length).toBeGreaterThan(3);
  });

  it("make love returns quip", async () => {
    const out = await run("make", ["love"]);
    expect(out.exitCode).toBe(0);
    const text = out.lines.map((l) => l.content).join(" ");
    expect(text).toContain("love");
  });

  it("make install returns website message", async () => {
    const out = await run("make", ["install"]);
    expect(out.exitCode).toBe(0);
    const text = out.lines.map((l) => l.content).join(" ");
    expect(text).toContain("website");
  });
});

// ─── rm (override) ───────────────────────────────────────────────────────────

describe("rm easter egg", () => {
  it("rm -rf / returns animation, not an error", async () => {
    const out = await run("rm", ["/"], { r: true, f: true });
    expect(out.exitCode).toBe(0);
    expect(out.lines.length).toBeGreaterThan(0);
  });

  it("rm -rf /* triggers easter egg", async () => {
    const out = await run("rm", ["/*"], { r: true, f: true });
    expect(out.exitCode).toBe(0);
  });
});

// ─── : (colon / no-op) ───────────────────────────────────────────────────────

describe("colon no-op", () => {
  it("succeeds with empty output", async () => {
    const out = await run(":");
    expect(out.exitCode).toBe(0);
    expect(out.lines).toHaveLength(0);
  });
});

// ─── dd ──────────────────────────────────────────────────────────────────────

describe("dd", () => {
  it("dd if=/dev/zero of=/dev/sda returns permission denied", async () => {
    const out = await run("dd", ["if=/dev/zero", "of=/dev/sda"]);
    expect(out.exitCode).toBe(1);
    const text = out.lines.map((l) => l.content).join(" ");
    expect(text).toContain("permission denied");
  });

  it("dd if=/dev/zero of=/dev/nvme0n1 also blocked", async () => {
    const out = await run("dd", ["if=/dev/zero", "of=/dev/nvme0n1"]);
    expect(out.exitCode).toBe(1);
  });
});

// ─── kill ─────────────────────────────────────────────────────────────────────

describe("kill", () => {
  it("kill -9 1 returns unkillable message", async () => {
    const out = await run("kill", ["1"], { 9: true });
    expect(out.exitCode).toBe(0);
    const text = out.lines.map((l) => l.content).join(" ");
    expect(text).toContain("not permitted");
  });

  it("kill -9 $$ returns unkillable message", async () => {
    const out = await run("kill", ["$$"], { 9: true });
    expect(out.exitCode).toBe(0);
  });
});

// ─── exit ────────────────────────────────────────────────────────────────────

describe("exit", () => {
  it("returns HAL 9000 message with username", async () => {
    const out = await run("exit");
    expect(out.exitCode).toBe(0);
    const text = out.lines.map((l) => l.content).join(" ");
    expect(text).toContain("guest");
    expect(text).toContain("I'm sorry");
  });
});

// ─── emacs ───────────────────────────────────────────────────────────────────

describe("emacs", () => {
  it("suggests vim", async () => {
    const out = await run("emacs");
    expect(out.exitCode).toBe(0);
    const text = out.lines.map((l) => l.content).join(" ");
    expect(text).toContain("vim");
  });
});

// ─── nano ─────────────────────────────────────────────────────────────────────

describe("nano", () => {
  it("suggests vim", async () => {
    const out = await run("nano");
    expect(out.exitCode).toBe(0);
    const text = out.lines.map((l) => l.content).join(" ");
    expect(text).toContain("vim");
  });
});

// ─── python / python3 ─────────────────────────────────────────────────────────

describe("python", () => {
  it("python returns Snake game component", async () => {
    const out = await run("python");
    expect(out.exitCode).toBe(0);
    expect(out.lines.length).toBeGreaterThan(0);
  });

  it("python3 alias works", async () => {
    const out = await run("python3");
    expect(out.exitCode).toBe(0);
    expect(out.lines.length).toBeGreaterThan(0);
  });
});

// ─── neofetch / screenfetch ───────────────────────────────────────────────────

describe("neofetch", () => {
  it("returns stub without crashing", async () => {
    const out = await run("neofetch");
    expect(out.exitCode).toBe(0);
  });

  it("screenfetch alias works", async () => {
    const out = await run("screenfetch");
    expect(out.exitCode).toBe(0);
  });
});
