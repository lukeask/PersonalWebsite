import { describe, it, expect } from "vitest";
import {
  historyUp,
  historyDown,
  getTabCompletion,
  initReverseSearch,
  updateSearchQuery,
  deleteSearchChar,
  nextSearchMatch,
  deleteToStart,
  deleteToEnd,
  deleteWordBefore,
  type HistoryCycleState,
} from "../keybindings";
import type { HistoryEntry, CommandRegistry, FileSystem } from "@/lib/types";
import { CommandRegistryImpl } from "../registry";

function makeHistory(commands: string[]): HistoryEntry[] {
  return commands.map((command, i) => ({ command, timestamp: i }));
}

function makeMockFs(
  tree: Record<string, "file" | "dir">,
): FileSystem {
  const entries = Object.keys(tree);
  return {
    read: () => "",
    write: () => {},
    delete: () => {},
    exists: (p) => entries.some((e) => e === p || e.startsWith(p + "/")),
    stat: () => ({
      size: 0,
      created: 0,
      modified: 0,
      type: "file",
      permissions: "rw-r--r--",
    }),
    list: (dir) => {
      const prefix = dir === "/" ? "/" : dir + "/";
      return entries
        .filter((e) => e.startsWith(prefix) && !e.slice(prefix.length).includes("/"))
        .map((e) => e.slice(prefix.length));
    },
    glob: () => [],
    isDirectory: (p) => tree[p] === "dir",
  };
}

// --- History Cycling ---

describe("historyUp", () => {
  const history = makeHistory(["ls", "cd /tmp", "echo hello"]);

  it("returns null when history is empty", () => {
    const state: HistoryCycleState = { index: -1, savedInput: "" };
    expect(historyUp(state, "current", [])).toBeNull();
  });

  it("returns last history entry from initial state", () => {
    const state: HistoryCycleState = { index: -1, savedInput: "" };
    const result = historyUp(state, "current", history)!;
    expect(result.input).toBe("echo hello");
    expect(result.state.index).toBe(2);
  });

  it("saves current input when starting to cycle", () => {
    const state: HistoryCycleState = { index: -1, savedInput: "" };
    const result = historyUp(state, "my typed text", history)!;
    expect(result.state.savedInput).toBe("my typed text");
  });

  it("goes further back on subsequent calls", () => {
    const state: HistoryCycleState = { index: 2, savedInput: "x" };
    const r1 = historyUp(state, "", history)!;
    expect(r1.input).toBe("cd /tmp");
    expect(r1.state.index).toBe(1);

    const r2 = historyUp(r1.state, "", history)!;
    expect(r2.input).toBe("ls");
    expect(r2.state.index).toBe(0);
  });

  it("clamps at oldest entry", () => {
    const state: HistoryCycleState = { index: 0, savedInput: "x" };
    const result = historyUp(state, "", history)!;
    expect(result.input).toBe("ls");
    expect(result.state.index).toBe(0);
  });
});

describe("historyDown", () => {
  const history = makeHistory(["ls", "cd /tmp", "echo hello"]);

  it("returns null when not cycling", () => {
    const state: HistoryCycleState = { index: -1, savedInput: "" };
    expect(historyDown(state, history)).toBeNull();
  });

  it("moves forward in history", () => {
    const state: HistoryCycleState = { index: 0, savedInput: "x" };
    const result = historyDown(state, history)!;
    expect(result.input).toBe("cd /tmp");
    expect(result.state.index).toBe(1);
  });

  it("restores saved input at end of history", () => {
    const state: HistoryCycleState = { index: 2, savedInput: "my text" };
    const result = historyDown(state, history)!;
    expect(result.input).toBe("my text");
    expect(result.state.index).toBe(-1);
  });
});

// --- Tab Completion ---

describe("getTabCompletion", () => {
  function makeRegistry(...names: string[]): CommandRegistry {
    const reg = new CommandRegistryImpl();
    for (const name of names) {
      reg.register({
        name,
        aliases: [],
        description: "",
        usage: "",
        execute: () => ({ lines: [], exitCode: 0 }),
      });
    }
    return reg;
  }

  const emptyFs = makeMockFs({});

  describe("command completion (first token)", () => {
    it("completes single matching command", () => {
      const reg = makeRegistry("ls", "echo", "cat");
      const result = getTabCompletion("ec", 2, reg, emptyFs, "/");
      expect(result.type).toBe("single");
      expect(result.value).toBe("echo ");
    });

    it("returns multiple matches", () => {
      const reg = makeRegistry("ls", "less", "lsof");
      const result = getTabCompletion("l", 1, reg, emptyFs, "/");
      expect(result.type).toBe("multiple");
      expect(result.matches).toEqual(["less", "ls", "lsof"]);
    });

    it("returns none when no match", () => {
      const reg = makeRegistry("ls", "echo");
      const result = getTabCompletion("z", 1, reg, emptyFs, "/");
      expect(result.type).toBe("none");
    });

    it("completes with common prefix when multiple matches share one", () => {
      const reg = makeRegistry("list", "listen");
      const result = getTabCompletion("li", 2, reg, emptyFs, "/");
      expect(result.type).toBe("single");
      expect(result.value).toBe("list");
      expect(result.cursorPos).toBe(4);
    });
  });

  describe("path completion (subsequent tokens)", () => {
    it("completes file paths", () => {
      const fs = makeMockFs({
        "/home": "dir",
        "/home/readme.txt": "file",
      });
      const reg = makeRegistry("cat");
      const result = getTabCompletion("cat /home/r", 11, reg, fs, "/");
      expect(result.type).toBe("single");
      expect(result.value).toBe("cat /home/readme.txt ");
    });

    it("completes directory paths with trailing slash", () => {
      const fs = makeMockFs({
        "/home": "dir",
        "/home/guest": "dir",
      });
      const reg = makeRegistry("cd");
      const result = getTabCompletion("cd /home/g", 10, reg, fs, "/");
      expect(result.type).toBe("single");
      expect(result.value).toBe("cd /home/guest/");
    });

    it("returns none for non-matching paths", () => {
      const fs = makeMockFs({ "/home": "dir" });
      const reg = makeRegistry("cd");
      const result = getTabCompletion("cd /xyz", 7, reg, fs, "/");
      expect(result.type).toBe("none");
    });
  });
});

// --- Reverse Search ---

describe("reverse search", () => {
  const history = makeHistory([
    "ls -la",
    "cd /tmp",
    "echo hello",
    "ls /var",
    "grep foo bar",
  ]);

  it("initializes with empty state", () => {
    const state = initReverseSearch();
    expect(state.active).toBe(true);
    expect(state.query).toBe("");
    expect(state.matchedCommand).toBeNull();
  });

  it("finds first match on character input", () => {
    let state = initReverseSearch();
    state = updateSearchQuery(state, "l", history);
    expect(state.matchedCommand).toBe("ls /var");
    expect(state.query).toBe("l");
  });

  it("narrows search as query grows", () => {
    let state = initReverseSearch();
    state = updateSearchQuery(state, "e", history);
    expect(state.matchedCommand).toBe("grep foo bar");
    state = updateSearchQuery(state, "c", history);
    expect(state.matchedCommand).toBe("echo hello");
  });

  it("ctrl+R finds next (older) match", () => {
    let state = initReverseSearch();
    state = updateSearchQuery(state, "ls", history);
    expect(state.matchedCommand).toBe("ls /var");

    state = nextSearchMatch(state, history);
    expect(state.matchedCommand).toBe("ls -la");
  });

  it("backspace widens search", () => {
    let state = initReverseSearch();
    state = updateSearchQuery(state, "e", history);
    state = updateSearchQuery(state, "c", history);
    expect(state.query).toBe("ec");
    expect(state.matchedCommand).toBe("echo hello");

    state = deleteSearchChar(state, history);
    expect(state.query).toBe("e");
    expect(state.matchedCommand).toBe("grep foo bar");
  });

  it("returns null match when no results", () => {
    let state = initReverseSearch();
    state = updateSearchQuery(state, "zzz", history);
    expect(state.matchedCommand).toBeNull();
  });

  it("backspace on empty query is a no-op", () => {
    const state = initReverseSearch();
    const result = deleteSearchChar(state, history);
    expect(result.query).toBe("");
  });
});

// --- Input Manipulation ---

describe("deleteToStart", () => {
  it("deletes from cursor to start", () => {
    const result = deleteToStart("hello world", 5);
    expect(result.value).toBe(" world");
    expect(result.cursorPos).toBe(0);
  });

  it("does nothing at start of line", () => {
    const result = deleteToStart("hello", 0);
    expect(result.value).toBe("hello");
    expect(result.cursorPos).toBe(0);
  });
});

describe("deleteToEnd", () => {
  it("deletes from cursor to end", () => {
    const result = deleteToEnd("hello world", 5);
    expect(result.value).toBe("hello");
    expect(result.cursorPos).toBe(5);
  });

  it("does nothing at end of line", () => {
    const result = deleteToEnd("hello", 5);
    expect(result.value).toBe("hello");
    expect(result.cursorPos).toBe(5);
  });
});

describe("deleteWordBefore", () => {
  it("deletes word before cursor", () => {
    const result = deleteWordBefore("hello world", 11);
    expect(result.value).toBe("hello ");
    expect(result.cursorPos).toBe(6);
  });

  it("handles multiple spaces before word", () => {
    const result = deleteWordBefore("foo   bar", 9);
    expect(result.value).toBe("foo   ");
    expect(result.cursorPos).toBe(6);
  });

  it("deletes first word from mid-word cursor", () => {
    const result = deleteWordBefore("hello", 3);
    expect(result.value).toBe("lo");
    expect(result.cursorPos).toBe(0);
  });

  it("does nothing at start of line", () => {
    const result = deleteWordBefore("hello", 0);
    expect(result.value).toBe("hello");
    expect(result.cursorPos).toBe(0);
  });
});
