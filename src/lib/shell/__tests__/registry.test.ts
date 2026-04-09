import { describe, it, expect, beforeEach } from "vitest";
import { CommandRegistryImpl } from "../registry";
import type { Command } from "@/lib/types";

function makeCommand(
  name: string,
  aliases: string[] = [],
): Command {
  return {
    name,
    aliases,
    description: `${name} command`,
    usage: name,
    execute: () => ({ lines: [], exitCode: 0 }),
  };
}

describe("CommandRegistryImpl", () => {
  let reg: CommandRegistryImpl;

  beforeEach(() => {
    reg = new CommandRegistryImpl();
  });

  describe("register", () => {
    it("registers a command", () => {
      reg.register(makeCommand("ls"));
      expect(reg.get("ls")).toBeDefined();
      expect(reg.get("ls")!.name).toBe("ls");
    });

    it("registers aliases", () => {
      reg.register(makeCommand("list", ["ls", "dir"]));
      expect(reg.get("ls")).toBeDefined();
      expect(reg.get("dir")).toBeDefined();
      expect(reg.get("ls")!.name).toBe("list");
    });
  });

  describe("get", () => {
    it("returns undefined for unknown commands", () => {
      expect(reg.get("nonexistent")).toBeUndefined();
    });

    it("finds by name", () => {
      reg.register(makeCommand("echo"));
      expect(reg.get("echo")!.name).toBe("echo");
    });

    it("finds by alias", () => {
      reg.register(makeCommand("cat", ["type"]));
      expect(reg.get("type")!.name).toBe("cat");
    });
  });

  describe("list", () => {
    it("returns all registered commands", () => {
      reg.register(makeCommand("ls"));
      reg.register(makeCommand("cd"));
      reg.register(makeCommand("echo"));
      const commands = reg.list();
      expect(commands.length).toBe(3);
      expect(commands.map((c) => c.name).sort()).toEqual(["cd", "echo", "ls"]);
    });

    it("does not duplicate aliased commands", () => {
      reg.register(makeCommand("list", ["ls", "dir"]));
      expect(reg.list().length).toBe(1);
    });

    it("returns empty for fresh registry", () => {
      expect(reg.list()).toEqual([]);
    });
  });

  describe("getCompletions", () => {
    it("returns matching command names", () => {
      reg.register(makeCommand("ls"));
      reg.register(makeCommand("less"));
      reg.register(makeCommand("echo"));
      expect(reg.getCompletions("l")).toEqual(["less", "ls"]);
    });

    it("includes matching aliases", () => {
      reg.register(makeCommand("list", ["ls"]));
      expect(reg.getCompletions("l")).toEqual(["list", "ls"]);
    });

    it("returns sorted results", () => {
      reg.register(makeCommand("cat"));
      reg.register(makeCommand("cd"));
      reg.register(makeCommand("chmod"));
      expect(reg.getCompletions("c")).toEqual(["cat", "cd", "chmod"]);
    });

    it("returns empty for no matches", () => {
      reg.register(makeCommand("ls"));
      expect(reg.getCompletions("z")).toEqual([]);
    });

    it("returns all on empty string", () => {
      reg.register(makeCommand("b"));
      reg.register(makeCommand("a"));
      expect(reg.getCompletions("")).toEqual(["a", "b"]);
    });
  });
});
