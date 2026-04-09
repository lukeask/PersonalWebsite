import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FileSystem, CommandContext, UserIdentity } from "@/lib/types";

// Import module — side effect registers commands
import "@/lib/commands/system";
import {
  dirSize,
  localStorageBytes,
  sessionStorageBytes,
} from "@/lib/commands/system";
import { registry } from "@/lib/shell/registry";

// ─── Stubs ────────────────────────────────────────────────────────────────────

const FILES: Record<string, string> = {
  "/home/guest/readme.md": "hello world", // 11 chars → 22 bytes UTF-16
  "/home/guest/notes.txt": "ab",          // 2 chars  → 4 bytes
  "/home/guest/docs/a.txt": "xyz",        // 3 chars  → 6 bytes
  "/home/guest/docs/b.txt": "12345",      // 5 chars  → 10 bytes
};

const DIRS = new Set(["/", "/home", "/home/guest", "/home/guest/docs"]);

const stubFs: FileSystem = {
  read: (path) => {
    if (FILES[path] !== undefined) return FILES[path];
    throw new Error(`No such file: ${path}`);
  },
  write: () => {},
  delete: () => {},
  exists: (path) => path in FILES || DIRS.has(path),
  stat: (path) => ({
    size: FILES[path]?.length ?? 0,
    created: 0,
    modified: 0,
    type: DIRS.has(path) ? "directory" : "file",
    permissions: DIRS.has(path) ? "drwxr-xr-x" : "-rw-r--r--",
  }),
  list: (path) => {
    const prefix = path === "/" ? "/" : path + "/";
    const names = new Set<string>();
    for (const p of [...Object.keys(FILES), ...Array.from(DIRS)]) {
      if (p !== path && p.startsWith(prefix)) {
        const rest = p.slice(prefix.length);
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

function run(
  name: string,
  args: string[] = [],
  flags: Record<string, string | boolean> = {},
  ctx?: CommandContext,
) {
  const cmd = registry.get(name);
  if (!cmd) throw new Error(`Command not found: ${name}`);
  return cmd.execute(args, flags, null, ctx ?? makeCtx());
}

// ─── Mock storage helpers ─────────────────────────────────────────────────────

function makeStorage(entries: Record<string, string>) {
  const store = { ...entries };
  const keys = Object.keys(store);
  return {
    get length() {
      return keys.length;
    },
    key: (i: number) => keys[i] ?? null,
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      keys.length = 0;
    },
  };
}

// ─── dirSize ─────────────────────────────────────────────────────────────────

describe("dirSize", () => {
  it("calculates UTF-16 byte size of a file (length * 2)", () => {
    // "hello world" = 11 chars → 22 bytes
    expect(dirSize(stubFs, "/home/guest/readme.md")).toBe(22);
  });

  it("sums children for a directory", () => {
    // docs/a.txt: 3 chars = 6 bytes, docs/b.txt: 5 chars = 10 bytes → 16
    expect(dirSize(stubFs, "/home/guest/docs")).toBe(16);
  });

  it("recursively sums nested directories", () => {
    // /home/guest: readme.md(22) + notes.txt(4) + docs/(16) = 42
    expect(dirSize(stubFs, "/home/guest")).toBe(42);
  });

  it("returns 0 for empty directory", () => {
    const emptyFs: FileSystem = {
      ...stubFs,
      exists: () => true,
      isDirectory: () => true,
      list: () => [],
    };
    expect(dirSize(emptyFs, "/empty")).toBe(0);
  });
});

// ─── du ──────────────────────────────────────────────────────────────────────

describe("du", () => {
  it("shows size of cwd when no args", () => {
    const out = run("du", [], { h: true });
    expect(out.exitCode).toBe(0);
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].content).toMatch(/\./); // shows "."
  });

  it("shows size of a specific file with -h", () => {
    const out = run("du", ["readme.md"], { h: true });
    expect(out.exitCode).toBe(0);
    expect(String(out.lines[0].content)).toMatch(/readme\.md/);
  });

  it("shows size of a specific directory with -h", () => {
    const out = run("du", ["docs"], { h: true });
    expect(out.exitCode).toBe(0);
    expect(String(out.lines[0].content)).toMatch(/docs/);
  });

  it("shows multiple targets when multiple args provided", () => {
    const out = run("du", ["readme.md", "notes.txt"], { h: true });
    expect(out.exitCode).toBe(0);
    expect(out.lines).toHaveLength(2);
  });

  it("returns raw byte count without -h", () => {
    const out = run("du", ["readme.md"]);
    // "hello world" = 11 chars * 2 = 22
    expect(String(out.lines[0].content)).toMatch(/^22/);
  });

  it("returns error for nonexistent path", () => {
    const out = run("du", ["nonexistent.txt"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });

  it("continues processing valid paths after an error", () => {
    const out = run("du", ["nonexistent.txt", "readme.md"]);
    expect(out.lines).toHaveLength(2);
    expect(out.lines[0].style).toBe("error");
    expect(String(out.lines[1].content)).toMatch(/readme\.md/);
  });
});

// ─── localStorageBytes / sessionStorageBytes ──────────────────────────────────

describe("localStorageBytes", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal(
      "localStorage",
      makeStorage({ foo: "bar", hello: "world!" }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sums key+value lengths * 2 for UTF-16", () => {
    // "foo"(3) + "bar"(3) = 6, * 2 = 12
    // "hello"(5) + "world!"(6) = 11, * 2 = 22
    // total = 34
    expect(localStorageBytes()).toBe(34);
  });

  it("returns 0 for empty storage", () => {
    vi.stubGlobal("localStorage", makeStorage({}));
    expect(localStorageBytes()).toBe(0);
  });
});

describe("sessionStorageBytes", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("sessionStorage", makeStorage({ tmp: "data" }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sums key+value lengths * 2 for UTF-16", () => {
    // "tmp"(3) + "data"(4) = 7, * 2 = 14
    expect(sessionStorageBytes()).toBe(14);
  });
});

// ─── df ──────────────────────────────────────────────────────────────────────

describe("df", () => {
  const IDB_USAGE = 4096;
  const IDB_QUOTA = 10 * 1024 * 1024;

  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", makeStorage({ k: "v" })); // 4 bytes
    vi.stubGlobal("sessionStorage", makeStorage({}));
    vi.stubGlobal("navigator", {
      storage: {
        estimate: vi.fn().mockResolvedValue({
          usage: IDB_USAGE,
          quota: IDB_QUOTA,
        }),
      },
      hardwareConcurrency: 4,
      onLine: true,
      userAgent: "test",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 4 output lines (header + 3 filesystems)", async () => {
    const result = await run("df");
    expect(result.lines).toHaveLength(4);
    expect(result.exitCode).toBe(0);
  });

  it("header has bold style", async () => {
    const result = await run("df");
    expect(result.lines[0].style).toBe("bold");
  });

  it("overlay row shows idb quota and usage", async () => {
    const result = await run("df", [], { h: true });
    const overlayLine = String(result.lines[1].content);
    expect(overlayLine).toContain("overlay (idb)");
    expect(overlayLine).toContain("/"); // mount point
  });

  it("localStorage row is mounted at /local", async () => {
    const result = await run("df");
    const lsLine = String(result.lines[2].content);
    expect(lsLine).toContain("localStorage");
    expect(lsLine).toContain("/local");
  });

  it("sessionStorage row is mounted at /tmp", async () => {
    const result = await run("df");
    const ssLine = String(result.lines[3].content);
    expect(ssLine).toContain("sessionStorage");
    expect(ssLine).toContain("/tmp");
  });

  it("-h flag produces human-readable sizes", async () => {
    const result = await run("df", [], { h: true });
    // 10 MiB quota should display as "10.0M"
    const overlayLine = String(result.lines[1].content);
    expect(overlayLine).toMatch(/\d+\.\d+[BKMG]/);
  });

  it("calls navigator.storage.estimate()", async () => {
    await run("df");
    expect(navigator.storage.estimate).toHaveBeenCalled();
  });
});

// ─── uname ───────────────────────────────────────────────────────────────────

describe("uname", () => {
  it("prints OS name without flags", () => {
    const out = run("uname");
    expect(out.lines[0].content).toBe("AskewOS");
    expect(out.exitCode).toBe(0);
  });

  it("-r prints version", () => {
    const out = run("uname", [], { r: true });
    expect(String(out.lines[0].content)).toMatch(/\d+\.\d+\.\d+/);
  });

  it("-a prints full system string", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {
      hardwareConcurrency: 8,
      userAgent: "test Linux x86_64",
    });
    const out = run("uname", [], { a: true });
    const str = String(out.lines[0].content);
    expect(str).toContain("AskewOS");
    expect(str).toContain("askew.sh");
    vi.unstubAllGlobals();
  });
});

// ─── ps ──────────────────────────────────────────────────────────────────────

describe("ps", () => {
  it("returns a header and process rows", () => {
    const out = run("ps", ["aux"]);
    expect(out.exitCode).toBe(0);
    expect(out.lines.length).toBeGreaterThan(2);
  });

  it("first line is bold header", () => {
    const out = run("ps", ["aux"]);
    expect(out.lines[0].style).toBe("bold");
    expect(String(out.lines[0].content)).toContain("PID");
  });

  it("contains known processes", () => {
    const out = run("ps", ["aux"]);
    const text = out.lines.map((l) => String(l.content)).join("\n");
    expect(text).toContain("init");
    expect(text).toContain("node server.js");
    expect(text).toContain("shor_eccd");
    expect(text).toContain("chabauty_colemand");
    expect(text).toContain("weil_conjectd");
  });

  it("includes the username from context", () => {
    const out = run("ps", ["aux"]);
    const text = out.lines.map((l) => String(l.content)).join("\n");
    expect(text).toContain("guest");
  });

  it("last row is the ps command itself", () => {
    const out = run("ps", ["aux"]);
    const last = String(out.lines[out.lines.length - 1].content);
    expect(last).toContain("ps aux");
  });
});

// ─── uptime ──────────────────────────────────────────────────────────────────

describe("uptime", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("outputs a single line", () => {
    const out = run("uptime");
    expect(out.lines).toHaveLength(1);
    expect(out.exitCode).toBe(0);
  });

  it("includes load average", () => {
    const out = run("uptime");
    expect(String(out.lines[0].content)).toContain("load average");
  });

  it("includes network status when browser globals are available", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { onLine: true, hardwareConcurrency: 2, userAgent: "test" });
    vi.stubGlobal("performance", { now: () => 3661000 }); // 1h 1m 1s
    const out = run("uptime");
    expect(String(out.lines[0].content)).toContain("online");
  });
});
