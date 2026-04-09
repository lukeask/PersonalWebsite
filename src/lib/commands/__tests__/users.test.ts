import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CommandContext, UserIdentity, FileSystem } from "@/lib/types";

import "@/lib/commands/users";
import { registry } from "@/lib/shell/registry";
import { loadUsers, loadCurrentUser, saveCurrentUser, ensureGuestUser } from "@/lib/commands/users";

// --- localStorage mock ---

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  get length() { return Object.keys(store).length; },
  key: (i: number) => Object.keys(store)[i] ?? null,
};
vi.stubGlobal("localStorage", localStorageMock);

// --- Stubs ---

const stubFs: FileSystem = {
  read: () => "",
  write: vi.fn(),
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
  groups: ["guest"],
  home: "/home/guest",
  ps1: "guest@askew.sh:~$",
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
  vi.mocked(stubFs.write).mockReset?.();
});

// --- adduser ---

describe("adduser", () => {
  it("creates a new user and persists to localStorage", () => {
    run("adduser", ["alice"]);
    const users = loadUsers();
    expect(users.some((u) => u.username === "alice")).toBe(true);
  });

  it("assigns an incrementing uid starting at 1001", () => {
    run("adduser", ["alice"]);
    run("adduser", ["bob"]);
    const users = loadUsers();
    const alice = users.find((u) => u.username === "alice")!;
    const bob = users.find((u) => u.username === "bob")!;
    expect(alice.uid).toBe(1001);
    expect(bob.uid).toBe(1002);
  });

  it("sets home to /home/<username>", () => {
    run("adduser", ["alice"]);
    const user = loadUsers().find((u) => u.username === "alice")!;
    expect(user.home).toBe("/home/alice");
  });

  it("rejects duplicate usernames", () => {
    run("adduser", ["alice"]);
    const out = run("adduser", ["alice"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });

  it("rejects 'root' with a playful hint", () => {
    const out = run("adduser", ["root"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
    const text = out.lines[0].content as string;
    expect(text).toMatch(/root/i);
    expect(text).toMatch(/key|door|hint|way|try/i);
  });

  it("rejects invalid usernames", () => {
    const out = run("adduser", ["bad name!"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });

  it("returns exit code 0 on success", () => {
    const out = run("adduser", ["alice"]);
    expect(out.exitCode).toBe(0);
  });

  it("returns error when no username given", () => {
    const out = run("adduser", []);
    expect(out.exitCode).toBe(1);
  });
});

// --- passwd ---

describe("passwd", () => {
  it("sets a password for the current user", () => {
    const ctx = makeCtx({ user: { ...stubUser, username: "alice" } });
    run("passwd", ["s3cret"], {}, null, ctx);
    // Can now switch with correct password
    run("adduser", ["alice"]);
    const suOut = run("su", ["alice", "s3cret"]);
    expect(suOut.exitCode).toBe(0);
  });

  it("sets a password for a named user", () => {
    run("adduser", ["alice"]);
    run("passwd", ["alice", "hunter2"]);
    const suOut = run("su", ["alice", "hunter2"]);
    expect(suOut.exitCode).toBe(0);
  });

  it("rejects wrong password after passwd is set", () => {
    run("adduser", ["alice"]);
    run("passwd", ["alice", "correct"]);
    const out = run("su", ["alice", "wrong"]);
    expect(out.exitCode).toBe(1);
  });

  it("rejects root password change", () => {
    const out = run("passwd", ["root", "anything"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });

  it("returns error with no args", () => {
    const out = run("passwd", []);
    expect(out.exitCode).toBe(1);
  });
});

// --- su ---

describe("su", () => {
  it("switches to an existing user and calls ctx.setUser", () => {
    run("adduser", ["alice"]);
    const ctx = makeCtx();
    run("su", ["alice"], {}, null, ctx);
    expect(ctx.setUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: "alice" })
    );
  });

  it("changes cwd to the target user's home", () => {
    run("adduser", ["alice"]);
    const ctx = makeCtx();
    run("su", ["alice"], {}, null, ctx);
    expect(ctx.setCwd).toHaveBeenCalledWith("/home/alice");
  });

  it("persists the new identity to localStorage", () => {
    run("adduser", ["alice"]);
    const ctx = makeCtx();
    run("su", ["alice"], {}, null, ctx);
    const saved = loadCurrentUser();
    expect(saved?.username).toBe("alice");
  });

  it("returns error for non-existent user", () => {
    const out = run("su", ["nobody"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });

  it("rejects su root with a playful hint", () => {
    const out = run("su", ["root"]);
    expect(out.exitCode).toBe(1);
    const text = out.lines.map((l) => l.content as string).join("\n");
    expect(text).toMatch(/root/i);
    expect(text).toMatch(/key|way|yet|escalat|found|door/i);
  });

  it("su with no args attempts root (rejected)", () => {
    const out = run("su", []);
    expect(out.exitCode).toBe(1);
  });

  it("chuser is an alias for su", () => {
    run("adduser", ["alice"]);
    const ctx = makeCtx();
    run("chuser", ["alice"], {}, null, ctx);
    expect(ctx.setUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: "alice" })
    );
  });

  it("new identity has correct ps1 format", () => {
    run("adduser", ["alice"]);
    const ctx = makeCtx();
    run("su", ["alice"], {}, null, ctx);
    const identity = vi.mocked(ctx.setUser).mock.calls[0][0];
    expect(identity.ps1).toMatch(/alice@askew\.sh/);
  });
});

// --- users ---

describe("users", () => {
  it("lists created users", () => {
    run("adduser", ["alice"]);
    run("adduser", ["bob"]);
    const out = run("users", []);
    const text = out.lines.map((l) => l.content as string).join("\n");
    expect(text).toMatch(/alice/);
    expect(text).toMatch(/bob/);
    expect(out.exitCode).toBe(0);
  });

  it("shows empty message when no users", () => {
    const out = run("users", []);
    expect(out.exitCode).toBe(0);
    expect(out.lines[0].content as string).toMatch(/no users/i);
  });
});

// --- who ---

describe("who", () => {
  it("shows the current user", () => {
    const ctx = makeCtx({ user: { ...stubUser, username: "alice" } });
    const out = run("who", [], {}, null, ctx);
    const text = out.lines.map((l) => l.content as string).join("\n");
    expect(text).toMatch(/alice/);
    expect(out.exitCode).toBe(0);
  });

  it("always includes the fixture users", () => {
    const out = run("who", []);
    const text = out.lines.map((l) => l.content as string).join("\n");
    expect(text).toMatch(/temp/);
    expect(text).toMatch(/not_rogue_agi_pls_no_kill9/);
  });

  it("temp has the historical login date", () => {
    const out = run("who", []);
    const text = out.lines.map((l) => l.content as string).join("\n");
    expect(text).toMatch(/2020/);
  });

  it("agi has the april fools login date", () => {
    const out = run("who", []);
    const text = out.lines.map((l) => l.content as string).join("\n");
    expect(text).toMatch(/2025-04-01|Apr 01/);
  });

  it("updates current user entry when switched via su", () => {
    run("adduser", ["alice"]);
    const ctx = makeCtx({ user: { ...stubUser, username: "alice" } });
    const out = run("who", [], {}, null, ctx);
    const text = out.lines.map((l) => l.content as string).join("\n");
    expect(text).toMatch(/alice/);
  });
});

// --- ensureGuestUser ---

describe("ensureGuestUser", () => {
  it("seeds the guest user into the users list on first call", () => {
    ensureGuestUser();
    const users = loadUsers();
    expect(users.some((u) => u.username === "guest" && u.uid === 1000)).toBe(true);
  });

  it("sets the current user to guest when nothing is persisted", () => {
    ensureGuestUser();
    const current = loadCurrentUser();
    expect(current?.username).toBe("guest");
    expect(current?.uid).toBe(1000);
    expect(current?.groups).toEqual(["guest"]);
    expect(current?.home).toBe("/home/guest");
  });

  it("is idempotent — does not duplicate guest on repeated calls", () => {
    ensureGuestUser();
    ensureGuestUser();
    const users = loadUsers();
    const guestCount = users.filter((u) => u.username === "guest").length;
    expect(guestCount).toBe(1);
  });

  it("does not overwrite a persisted current user", () => {
    const alice: import("@/lib/types").UserIdentity = {
      username: "alice",
      uid: 1001,
      groups: ["alice"],
      home: "/home/alice",
      ps1: "alice@askew.sh:~$",
    };
    saveCurrentUser(alice);
    ensureGuestUser();
    const current = loadCurrentUser();
    expect(current?.username).toBe("alice");
  });

  it("new adduser after ensureGuestUser starts uid at 1001", () => {
    ensureGuestUser();
    run("adduser", ["alice"]);
    const alice = loadUsers().find((u) => u.username === "alice")!;
    expect(alice.uid).toBe(1001);
  });
});

// --- persistence ---

describe("persistence", () => {
  it("saveCurrentUser / loadCurrentUser round-trip", () => {
    const identity: UserIdentity = {
      username: "alice",
      uid: 1001,
      groups: ["alice"],
      home: "/home/alice",
      ps1: "alice@askew.sh:~$",
    };
    saveCurrentUser(identity);
    const loaded = loadCurrentUser();
    expect(loaded).toEqual(identity);
  });

  it("users persist across simulated reloads (fresh loadUsers call)", () => {
    run("adduser", ["alice"]);
    // loadUsers reads directly from localStorage — simulates a fresh page load
    const users = loadUsers();
    expect(users.some((u) => u.username === "alice")).toBe(true);
  });
});
