import { describe, it, expect } from "vitest";
import {
  tokenize,
  parsePipeline,
  parseCommand,
  parseChain,
  expandHistory,
  expandGlob,
  parse,
} from "../parser";
import type { FileSystem, HistoryEntry } from "@/lib/types";

const env: Record<string, string> = {
  HOME: "/home/guest",
  USER: "guest",
  PATH: "/usr/bin",
  COUNT: "42",
};

// --- tokenize ---

describe("tokenize", () => {
  it("splits simple words", () => {
    const tokens = tokenize("ls -la /home", env);
    expect(tokens).toEqual([
      { type: "word", value: "ls" },
      { type: "word", value: "-la" },
      { type: "word", value: "/home" },
    ]);
  });

  it("handles extra whitespace", () => {
    const tokens = tokenize("  echo   hello  ", env);
    const words = tokens.map((t) => t.value);
    expect(words).toEqual(["echo", "hello"]);
  });

  it("handles empty input", () => {
    expect(tokenize("", env)).toEqual([]);
    expect(tokenize("   ", env)).toEqual([]);
  });

  it("recognizes pipe operator", () => {
    const tokens = tokenize("ls | grep foo", env);
    expect(tokens).toEqual([
      { type: "word", value: "ls" },
      { type: "pipe", value: "|" },
      { type: "word", value: "grep" },
      { type: "word", value: "foo" },
    ]);
  });

  it("recognizes && operator", () => {
    const tokens = tokenize("cd /home && ls", env);
    expect(tokens[2]).toEqual({ type: "and", value: "&&" });
  });

  it("recognizes ; operator", () => {
    const tokens = tokenize("echo a; echo b", env);
    expect(tokens[2]).toEqual({ type: "semi", value: ";" });
  });
});

// --- Quoted strings ---

describe("tokenize - quoted strings", () => {
  it("handles single-quoted strings (no expansion)", () => {
    const tokens = tokenize("echo 'hello $USER'", env);
    expect(tokens[1].value).toBe("hello $USER");
  });

  it("handles double-quoted strings (with expansion)", () => {
    const tokens = tokenize('echo "hello $USER"', env);
    expect(tokens[1].value).toBe("hello guest");
  });

  it("handles empty quoted strings", () => {
    const tokens = tokenize('echo ""', env);
    expect(tokens[1]).toEqual({ type: "word", value: "" });
  });

  it("handles escaped quotes inside double quotes", () => {
    const tokens = tokenize('echo "say \\"hi\\""', env);
    expect(tokens[1].value).toBe('say "hi"');
  });

  it("handles mixed quotes in a single token", () => {
    const tokens = tokenize("echo 'hello '\"world\"", env);
    expect(tokens[1].value).toBe("hello world");
  });

  it("preserves operators inside quotes", () => {
    const tokens = tokenize('echo "a && b | c"', env);
    expect(tokens.length).toBe(2);
    expect(tokens[1].value).toBe("a && b | c");
  });
});

// --- Env var expansion ---

describe("tokenize - env var expansion", () => {
  it("expands $VAR", () => {
    const tokens = tokenize("echo $USER", env);
    expect(tokens[1].value).toBe("guest");
  });

  it("expands ${VAR}", () => {
    const tokens = tokenize("echo ${HOME}/docs", env);
    expect(tokens[1].value).toBe("/home/guest/docs");
  });

  it("expands inside double quotes", () => {
    const tokens = tokenize('echo "path=$PATH"', env);
    expect(tokens[1].value).toBe("path=/usr/bin");
  });

  it("does NOT expand inside single quotes", () => {
    const tokens = tokenize("echo '$HOME'", env);
    expect(tokens[1].value).toBe("$HOME");
  });

  it("drops undefined vars (no token produced)", () => {
    const tokens = tokenize("echo $UNDEFINED", env);
    expect(tokens.length).toBe(1);
    expect(tokens[0].value).toBe("echo");
  });

  it("handles $ at end of input", () => {
    const tokens = tokenize("echo $", env);
    expect(tokens[1].value).toBe("$");
  });
});

// --- Arithmetic ---

describe("tokenize - arithmetic expansion", () => {
  it("evaluates basic addition", () => {
    const tokens = tokenize("echo $((3 + 5))", env);
    expect(tokens[1].value).toBe("8");
  });

  it("evaluates multiplication and precedence", () => {
    const tokens = tokenize("echo $((2 + 3 * 4))", env);
    expect(tokens[1].value).toBe("14");
  });

  it("evaluates modulo", () => {
    const tokens = tokenize("echo $((10 % 3))", env);
    expect(tokens[1].value).toBe("1");
  });

  it("evaluates integer division", () => {
    const tokens = tokenize("echo $((7 / 2))", env);
    expect(tokens[1].value).toBe("3");
  });

  it("evaluates parenthesized expressions", () => {
    const tokens = tokenize("echo $(((2 + 3) * 4))", env);
    expect(tokens[1].value).toBe("20");
  });

  it("expands variables inside arithmetic", () => {
    const tokens = tokenize("echo $(($COUNT + 8))", env);
    expect(tokens[1].value).toBe("50");
  });
});

// --- Tilde expansion ---

describe("tokenize - tilde expansion", () => {
  it("expands ~ alone", () => {
    const tokens = tokenize("cd ~", env);
    expect(tokens[1].value).toBe("/home/guest");
  });

  it("expands ~/path", () => {
    const tokens = tokenize("cd ~/Documents", env);
    expect(tokens[1].value).toBe("/home/guest/Documents");
  });

  it("does not expand ~ in the middle of a word", () => {
    const tokens = tokenize("echo foo~bar", env);
    expect(tokens[1].value).toBe("foo~bar");
  });
});

// --- Backslash escaping ---

describe("tokenize - backslash escaping", () => {
  it("escapes spaces", () => {
    const tokens = tokenize("cat hello\\ world", env);
    expect(tokens[1].value).toBe("hello world");
  });

  it("escapes special chars", () => {
    const tokens = tokenize("echo \\$HOME", env);
    expect(tokens[1].value).toBe("$HOME");
  });
});

// --- parsePipeline ---

describe("parsePipeline", () => {
  it("returns one stage for simple command", () => {
    const tokens = tokenize("ls -la", env);
    const stages = parsePipeline(tokens);
    expect(stages.length).toBe(1);
    expect(stages[0].map((t) => t.value)).toEqual(["ls", "-la"]);
  });

  it("splits on pipes", () => {
    const tokens = tokenize("ls | grep foo | wc -l", env);
    const stages = parsePipeline(tokens);
    expect(stages.length).toBe(3);
    expect(stages[0].map((t) => t.value)).toEqual(["ls"]);
    expect(stages[1].map((t) => t.value)).toEqual(["grep", "foo"]);
    expect(stages[2].map((t) => t.value)).toEqual(["wc", "-l"]);
  });
});

// --- parseCommand ---

describe("parseCommand", () => {
  it("parses simple command", () => {
    const tokens = tokenize("echo hello world", env);
    const cmd = parseCommand(tokens);
    expect(cmd.name).toBe("echo");
    expect(cmd.args).toEqual(["hello", "world"]);
    expect(cmd.flags).toEqual({});
  });

  it("parses short boolean flags (-la)", () => {
    const tokens = tokenize("ls -la", env);
    const cmd = parseCommand(tokens);
    expect(cmd.name).toBe("ls");
    expect(cmd.flags).toEqual({ l: true, a: true });
  });

  it("parses short flag with value (-n 5)", () => {
    const tokens = tokenize("head -n 5 file.txt", env);
    const cmd = parseCommand(tokens);
    expect(cmd.name).toBe("head");
    expect(cmd.flags).toEqual({ n: "5" });
    expect(cmd.args).toEqual(["file.txt"]);
  });

  it("parses long boolean flags", () => {
    const tokens = tokenize("ls --all --human-readable", env);
    const cmd = parseCommand(tokens);
    expect(cmd.flags).toEqual({ all: true, "human-readable": true });
  });

  it("parses long flags with = value", () => {
    const tokens = tokenize("grep --color=always pattern", env);
    const cmd = parseCommand(tokens);
    expect(cmd.flags).toEqual({ color: "always" });
    expect(cmd.args).toEqual(["pattern"]);
  });

  it("stops flag parsing after --", () => {
    const tokens = tokenize("grep -- -pattern file", env);
    const cmd = parseCommand(tokens);
    expect(cmd.args).toEqual(["-pattern", "file"]);
    expect(cmd.flags).toEqual({});
  });
});

// --- parseChain ---

describe("parseChain", () => {
  it("parses single command", () => {
    const chain = parseChain("ls -la", env);
    expect(chain.length).toBe(1);
    expect(chain[0].pipeline[0].name).toBe("ls");
    expect(chain[0].operator).toBeNull();
  });

  it("parses && chain", () => {
    const chain = parseChain("cd /home && ls", env);
    expect(chain.length).toBe(2);
    expect(chain[0].pipeline[0].name).toBe("cd");
    expect(chain[0].operator).toBe("&&");
    expect(chain[1].pipeline[0].name).toBe("ls");
    expect(chain[1].operator).toBeNull();
  });

  it("parses ; chain", () => {
    const chain = parseChain("echo a; echo b", env);
    expect(chain.length).toBe(2);
    expect(chain[0].operator).toBe(";");
    expect(chain[1].operator).toBeNull();
  });

  it("parses mixed && and ;", () => {
    const chain = parseChain("a && b; c", env);
    expect(chain.length).toBe(3);
    expect(chain[0].operator).toBe("&&");
    expect(chain[1].operator).toBe(";");
    expect(chain[2].operator).toBeNull();
  });

  it("parses pipeline inside chain entry", () => {
    const chain = parseChain("ls | grep foo && echo done", env);
    expect(chain[0].pipeline.length).toBe(2);
    expect(chain[0].pipeline[0].name).toBe("ls");
    expect(chain[0].pipeline[1].name).toBe("grep");
    expect(chain[1].pipeline[0].name).toBe("echo");
  });
});

// --- expandHistory ---

describe("expandHistory", () => {
  const history: HistoryEntry[] = [
    { command: "ls -la", timestamp: 1 },
    { command: "cd /home", timestamp: 2 },
    { command: "echo hello", timestamp: 3 },
  ];

  it("replaces !! with last command", () => {
    expect(expandHistory("!!", history)).toBe("echo hello");
  });

  it("replaces !n with nth entry (1-based)", () => {
    expect(expandHistory("!1", history)).toBe("ls -la");
    expect(expandHistory("!2", history)).toBe("cd /home");
  });

  it("replaces !-n with nth from end", () => {
    expect(expandHistory("!-1", history)).toBe("echo hello");
    expect(expandHistory("!-2", history)).toBe("cd /home");
    expect(expandHistory("!-3", history)).toBe("ls -la");
  });

  it("handles sudo !!", () => {
    expect(expandHistory("sudo !!", history)).toBe("sudo echo hello");
  });

  it("returns input unchanged when no ! present", () => {
    expect(expandHistory("echo hello", history)).toBe("echo hello");
  });

  it("returns input unchanged with empty history", () => {
    expect(expandHistory("!!", [])).toBe("!!");
  });
});

// --- expandGlob ---

describe("expandGlob", () => {
  const mockFs: FileSystem = {
    read: () => "",
    write: () => {},
    delete: () => {},
    exists: () => true,
    stat: () => ({
      size: 0,
      created: 0,
      modified: 0,
      type: "file",
      permissions: "-r--r--r--",
    }),
    list: () => [],
    isDirectory: () => false,
    glob: (pattern: string, basePath?: string) => {
      const base = basePath ?? "/";
      if (pattern === "*.md" && base === "/home/guest") {
        return ["/home/guest/readme.md", "/home/guest/notes.md"];
      }
      if (pattern === "*.txt" && base === "/home/guest") {
        return [];
      }
      return [];
    },
  };

  it("expands matching glob patterns", () => {
    const result = expandGlob("*.md", mockFs, "/home/guest");
    expect(result).toEqual(["readme.md", "notes.md"]);
  });

  it("returns original pattern when no matches", () => {
    const result = expandGlob("*.txt", mockFs, "/home/guest");
    expect(result).toEqual(["*.txt"]);
  });

  it("returns pattern as-is if no glob chars", () => {
    const result = expandGlob("file.txt", mockFs, "/home/guest");
    expect(result).toEqual(["file.txt"]);
  });
});

// --- parse (integration) ---

describe("parse", () => {
  const history: HistoryEntry[] = [
    { command: "ls -la", timestamp: 1 },
  ];

  it("runs history expansion and returns parsed chain", () => {
    const result = parse("!! | grep foo", env, history);
    expect(result.length).toBe(1);
    expect(result[0].pipeline.length).toBe(2);
    expect(result[0].pipeline[0].name).toBe("ls");
    expect(result[0].pipeline[0].flags).toEqual({ l: true, a: true });
    expect(result[0].pipeline[1].name).toBe("grep");
  });
});
