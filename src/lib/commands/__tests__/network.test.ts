import { describe, it, expect } from "vitest";
import type { FileSystem, CommandContext, UserIdentity } from "@/lib/types";

import "@/lib/commands/network";
import { registry } from "@/lib/shell/registry";

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
  groups: ["guest"],
  home: "/home/guest",
  ps1: "$ ",
};

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    fs: stubFs,
    cwd: "/home/guest",
    env: { HOME: "/home/guest", USER: "guest" },
    user: stubUser,
    aliases: {},
    history: [],
    setCwd: () => {},
    setEnv: () => {},
    setUser: () => {},
    addAlias: () => {},
    removeAlias: () => {},
    ...overrides,
  };
}

function run(
  name: string,
  args: string[],
  flags: Record<string, string | boolean> = {},
  stdin: string | null = null,
) {
  const cmd = registry.get(name);
  if (!cmd) throw new Error(`Command not found: ${name}`);
  return cmd.execute(args, flags, stdin, makeCtx());
}

function textLines(out: ReturnType<typeof run>): string[] {
  return out.lines.map((l) => l.content as string);
}

// --- ping ---

describe("ping", () => {
  it("pings askew.sh with 4 simulated replies", () => {
    const out = run("ping", ["askew.sh"]);
    const lines = textLines(out);
    const replyLines = lines.filter((l) => l.includes("icmp_seq="));
    expect(replyLines).toHaveLength(4);
    expect(out.exitCode).toBe(0);
  });

  it("includes a statistics summary", () => {
    const out = run("ping", ["askew.sh"]);
    const lines = textLines(out);
    expect(lines.some((l) => l.includes("ping statistics"))).toBe(true);
    expect(lines.some((l) => l.includes("0% packet loss"))).toBe(true);
  });

  it("pings localhost successfully", () => {
    const out = run("ping", ["localhost"]);
    expect(out.exitCode).toBe(0);
    expect(textLines(out).some((l) => l.includes("icmp_seq="))).toBe(true);
  });

  it("returns error for unknown host", () => {
    const out = run("ping", ["google.com"]);
    expect(out.exitCode).not.toBe(0);
    expect(textLines(out)[0]).toMatch(/google\.com/);
  });

  it("returns error when no host given", () => {
    const out = run("ping", []);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });
});

// --- curl ---

describe("curl", () => {
  it("returns meta joke for askew.sh", () => {
    const out = run("curl", ["askew.sh"]);
    expect(out.exitCode).toBe(0);
    const lines = textLines(out);
    expect(lines.some((l) => l.toLowerCase().includes("already here"))).toBe(true);
  });

  it("returns meta joke for localhost", () => {
    const out = run("curl", ["localhost"]);
    expect(out.exitCode).toBe(0);
  });

  it("returns error-ish response for external URLs", () => {
    const out = run("curl", ["https://example.com"]);
    expect(out.exitCode).not.toBe(0);
    const lines = textLines(out);
    expect(lines.some((l) => l.includes("example.com"))).toBe(true);
  });

  it("returns error when no URL given", () => {
    const out = run("curl", []);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });
});

// --- wget ---

describe("wget", () => {
  it("simulates a download for askew.sh", () => {
    const out = run("wget", ["askew.sh"]);
    expect(out.exitCode).toBe(0);
    const lines = textLines(out);
    expect(lines.some((l) => l.includes("200 OK"))).toBe(true);
  });

  it("returns error for external URLs", () => {
    const out = run("wget", ["https://example.com"]);
    expect(out.exitCode).not.toBe(0);
    const lines = textLines(out);
    expect(lines.some((l) => l.includes("unable to resolve"))).toBe(true);
  });

  it("returns error when no URL given", () => {
    const out = run("wget", []);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });
});

// --- ssh ---

describe("ssh", () => {
  it("returns 'You're already here.' for localhost", () => {
    const out = run("ssh", ["localhost"]);
    expect(out.exitCode).toBe(0);
    expect(textLines(out)[0]).toMatch(/already here/i);
  });

  it("returns 'You're already here.' for askew.sh", () => {
    const out = run("ssh", ["askew.sh"]);
    expect(out.exitCode).toBe(0);
    expect(textLines(out)[0]).toMatch(/already here/i);
  });

  it("returns 'You're already here.' for user@localhost", () => {
    const out = run("ssh", ["user@localhost"]);
    expect(out.exitCode).toBe(0);
    expect(textLines(out)[0]).toMatch(/already here/i);
  });

  it("returns connection refused for external hosts", () => {
    const out = run("ssh", ["github.com"]);
    expect(out.exitCode).not.toBe(0);
    const lines = textLines(out);
    expect(lines.some((l) => l.includes("Connection refused"))).toBe(true);
  });

  it("returns error when no host given", () => {
    const out = run("ssh", []);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });
});

// --- nslookup / dig ---

describe("nslookup", () => {
  it("resolves askew.sh to 127.0.0.1", () => {
    const out = run("nslookup", ["askew.sh"]);
    expect(out.exitCode).toBe(0);
    const lines = textLines(out);
    expect(lines.some((l) => l.includes("127.0.0.1"))).toBe(true);
    expect(lines.some((l) => l.includes("askew.sh"))).toBe(true);
  });

  it("dig is an alias for nslookup", () => {
    const out = run("dig", ["askew.sh"]);
    expect(out.exitCode).toBe(0);
    expect(textLines(out).some((l) => l.includes("127.0.0.1"))).toBe(true);
  });

  it("defaults to askew.sh when no host given", () => {
    const out = run("nslookup", []);
    expect(out.exitCode).toBe(0);
    const lines = textLines(out);
    expect(lines.some((l) => l.includes("askew.sh"))).toBe(true);
  });

  it("returns a response for arbitrary hosts", () => {
    const out = run("nslookup", ["example.com"]);
    expect(out.exitCode).toBe(0);
    const lines = textLines(out);
    expect(lines.some((l) => l.includes("example.com"))).toBe(true);
  });
});

// --- apt / apt-get ---

describe("apt", () => {
  it("apt update returns success message", () => {
    const out = run("apt", ["update"]);
    expect(out.exitCode).toBe(0);
    const lines = textLines(out);
    expect(lines.some((l) => l.includes("All packages are up to date"))).toBe(true);
  });

  it("apt install returns a fun error", () => {
    const out = run("apt", ["install", "vim"]);
    expect(out.exitCode).not.toBe(0);
    const lines = textLines(out);
    expect(lines.some((l) => l.startsWith("E:"))).toBe(true);
  });

  it("apt-get is an alias for apt", () => {
    const out = run("apt-get", ["update"]);
    expect(out.exitCode).toBe(0);
  });

  it("apt upgrade returns up-to-date message", () => {
    const out = run("apt", ["upgrade"]);
    expect(out.exitCode).toBe(0);
    const lines = textLines(out);
    expect(lines.some((l) => l.includes("0 upgraded"))).toBe(true);
  });

  it("apt install rotates error messages", () => {
    const messages = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const out = run("apt", ["install", "foo"]);
      const lines = textLines(out);
      const errorLine = lines.find((l) => l.startsWith("E:") && !l.includes("Unable to locate package"));
      if (errorLine) messages.add(errorLine);
    }
    expect(messages.size).toBeGreaterThan(1);
  });
});

// --- ifconfig ---

describe("ifconfig", () => {
  it("shows loopback interface with 127.0.0.1", () => {
    const out = run("ifconfig", []);
    expect(out.exitCode).toBe(0);
    const lines = textLines(out);
    expect(lines.some((l) => l.includes("127.0.0.1"))).toBe(true);
    expect(lines.some((l) => l.includes("lo"))).toBe(true);
  });

  it("includes a browser0 interface", () => {
    const out = run("ifconfig", []);
    const lines = textLines(out);
    expect(lines.some((l) => l.includes("browser0"))).toBe(true);
  });
});

// --- ip ---

describe("ip", () => {
  it("ip addr shows 127.0.0.1", () => {
    const out = run("ip", ["addr"]);
    expect(out.exitCode).toBe(0);
    const lines = textLines(out);
    expect(lines.some((l) => l.includes("127.0.0.1"))).toBe(true);
  });

  it("ip a works as shorthand", () => {
    const out = run("ip", ["a"]);
    expect(out.exitCode).toBe(0);
  });

  it("ip with no args shows addresses", () => {
    const out = run("ip", []);
    expect(out.exitCode).toBe(0);
  });

  it("ip with unknown subcommand returns error", () => {
    const out = run("ip", ["route"]);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });
});
