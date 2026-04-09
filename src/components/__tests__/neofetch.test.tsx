import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CommandContext, UserIdentity } from "@/lib/types";
import { BaseFileSystem } from "@/lib/filesystem/base";
import { registry } from "@/lib/shell/registry";
import "@/lib/commands/neofetch";

const stubUser: UserIdentity = {
  username: "guest",
  uid: 1000,
  groups: ["guest"],
  home: "/home/guest",
  ps1: "$ ",
};

function makeCtx(): CommandContext {
  const fs = new BaseFileSystem([]);
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

describe("neofetch command", () => {
  beforeEach(() => {
    // Clear MOTD seen flag before each test
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem("askew:motd-seen");
      } catch {
        // no localStorage in test env
      }
    }
  });

  it("is registered in the command registry", () => {
    const cmd = registry.get("neofetch");
    expect(cmd).toBeDefined();
    expect(cmd!.name).toBe("neofetch");
  });

  it("screenfetch is an alias", () => {
    const cmd = registry.get("screenfetch");
    expect(cmd).toBeDefined();
    expect(cmd!.name).toBe("neofetch");
  });

  it("executes without crashing", async () => {
    const cmd = registry.get("neofetch")!;
    const ctx = makeCtx();
    const result = await cmd.execute([], {}, null, ctx);
    expect(result.exitCode).toBe(0);
    expect(result.lines.length).toBeGreaterThanOrEqual(1);
  });

  it("output contains a React element (the Neofetch component)", async () => {
    const cmd = registry.get("neofetch")!;
    const ctx = makeCtx();
    const result = await cmd.execute([], {}, null, ctx);
    // The last non-empty line should be a React element (not a plain string)
    const componentLine = result.lines.find(
      (l) => typeof l.content !== "string" && l.content !== "",
    );
    expect(componentLine).toBeDefined();
  });

  it("has correct metadata", () => {
    const cmd = registry.get("neofetch")!;
    expect(cmd.description).toBeTruthy();
    expect(cmd.usage).toBeTruthy();
    expect(cmd.aliases).toContain("screenfetch");
  });
});

describe("Neofetch component exports", () => {
  it("Neofetch component can be imported", async () => {
    const mod = await import("@/components/Neofetch");
    expect(mod.Neofetch).toBeDefined();
    expect(typeof mod.Neofetch).toBe("function");
  });
});
