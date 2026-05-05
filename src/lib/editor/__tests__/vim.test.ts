import { describe, it, expect, vi } from "vitest";
import type {
  FileSystem,
  UserIdentity,
  CommandContext,
} from "@/lib/types";
import {
  isBinaryContent,
  createVimCommand,
} from "@/lib/editor/vim";
import { resolvePath } from "@/lib/util/paths";

// ---------------------------------------------------------------------------
// Stub helpers (matches pattern in other test files)
// ---------------------------------------------------------------------------

function makeFs(
  files: Record<string, string>,
  dirs = new Set<string>(),
): FileSystem {
  const store = { ...files };
  return {
    read: (path: string) => {
      if (dirs.has(path)) throw new Error("Is a directory");
      const c = store[path];
      if (c === undefined)
        throw new Error(`No such file or directory: ${path}`);
      return c;
    },
    write: (path: string, content: string) => {
      store[path] = content;
    },
    delete: (path: string) => {
      delete store[path];
    },
    exists: (path: string) => dirs.has(path) || path in store,
    stat: () => ({
      size: 0,
      created: 0,
      modified: 0,
      type: "file" as const,
      permissions: "-rw-r--r--",
    }),
    list: () => [],
    glob: () => [],
    isDirectory: (path: string) => dirs.has(path),
  };
}

const stubUser: UserIdentity = {
  username: "guest",
  uid: 1000,
  groups: ["guest"],
  home: "/home/guest",
  ps1: "$ ",
};

function makeCtx(fs: FileSystem, cwd = "/home/guest"): CommandContext {
  return {
    fs,
    cwd,
    env: { HOME: "/home/guest", USER: "guest" },
    user: stubUser,
    aliases: {},
    history: [],
    setCwd: () => {},
    setEnv: () => {},
    setUser: () => {},
    addAlias: () => {},
  };
}

// ---------------------------------------------------------------------------
// resolvePath
// ---------------------------------------------------------------------------

describe("resolvePath", () => {
  it("resolves absolute paths as-is", () => {
    expect(resolvePath("/etc/hosts", "/home/guest", "/home/guest")).toBe(
      "/etc/hosts",
    );
  });

  it("resolves relative paths against cwd", () => {
    expect(resolvePath("file.txt", "/home/guest", "/home/guest")).toBe(
      "/home/guest/file.txt",
    );
  });

  it("handles root cwd", () => {
    expect(resolvePath("file.txt", "/", "/home/guest")).toBe("/file.txt");
  });

  it("collapses duplicate slashes", () => {
    expect(resolvePath("file.txt", "/home/guest/", "/home/guest")).toBe(
      "/home/guest/file.txt",
    );
  });
});

// ---------------------------------------------------------------------------
// isBinaryContent
// ---------------------------------------------------------------------------

describe("isBinaryContent", () => {
  it("returns false for normal text", () => {
    expect(isBinaryContent("hello world\nfoo bar")).toBe(false);
  });

  it("returns true for content with null bytes", () => {
    expect(isBinaryContent("hello\x00world")).toBe(true);
  });

  it("returns true for content with control characters", () => {
    expect(isBinaryContent("data\x03here")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isBinaryContent("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createVimCommand
// ---------------------------------------------------------------------------

describe("createVimCommand", () => {
  it("returns a Command with name 'vim'", () => {
    const cmd = createVimCommand({ onOpen: () => {} });
    expect(cmd.name).toBe("vim");
    expect(cmd.aliases).toContain("vi");
  });

  it("shows usage error when no args provided", () => {
    const cmd = createVimCommand({ onOpen: () => {} });
    const ctx = makeCtx(makeFs({}));
    const out = cmd.execute([], {}, null, ctx);
    expect(out.exitCode).toBe(1);
    expect(out.lines[0].style).toBe("error");
  });

  it("calls onOpen with the filename", () => {
    const onOpen = vi.fn();
    const cmd = createVimCommand({ onOpen });
    const ctx = makeCtx(makeFs({}));
    const out = cmd.execute(["test.txt"], {}, null, ctx);
    expect(out.exitCode).toBe(0);
    expect(onOpen).toHaveBeenCalledWith("test.txt", {
      cwd: "/home/guest",
      home: "/home/guest",
    });
  });

  it("intercepts .bashrc and does not call onOpen", () => {
    const onOpen = vi.fn();
    const cmd = createVimCommand({ onOpen });
    const ctx = makeCtx(makeFs({}));
    const out = cmd.execute([".bashrc"], {}, null, ctx);
    expect(out.exitCode).toBe(0);
    expect(onOpen).not.toHaveBeenCalled();
    expect(out.lines[0].content).toMatch(/PS1 editor/i);
  });

  it("intercepts .bashrc in a path", () => {
    const onOpen = vi.fn();
    const cmd = createVimCommand({ onOpen });
    const ctx = makeCtx(makeFs({}));
    const out = cmd.execute(["/home/guest/.bashrc"], {}, null, ctx);
    expect(out.exitCode).toBe(0);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("calls onOpenPs1 when .bashrc is opened and onOpenPs1 is provided", () => {
    const onOpen = vi.fn();
    const onOpenPs1 = vi.fn();
    const cmd = createVimCommand({ onOpen, onOpenPs1 });
    const ctx = makeCtx(makeFs({}));
    cmd.execute([".bashrc"], {}, null, ctx);
    expect(onOpenPs1).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not throw when onOpenPs1 is omitted and .bashrc is opened", () => {
    const onOpen = vi.fn();
    const cmd = createVimCommand({ onOpen });
    const ctx = makeCtx(makeFs({}));
    expect(() => cmd.execute([".bashrc"], {}, null, ctx)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Filesystem integration (save / reopen cycle)
// ---------------------------------------------------------------------------

describe("vim filesystem integration", () => {
  it("write persists content that can be read back", () => {
    const fs = makeFs({});
    const path = "/home/guest/test.txt";

    expect(fs.exists(path)).toBe(false);

    fs.write(path, "hello world");
    expect(fs.exists(path)).toBe(true);
    expect(fs.read(path)).toBe("hello world");

    fs.write(path, "updated content");
    expect(fs.read(path)).toBe("updated content");
  });

  it("open non-existent file, write, then read back", () => {
    const fs = makeFs({});
    const path = "/home/guest/newfile.md";

    expect(fs.exists(path)).toBe(false);

    fs.write(path, "# New File\nContent here");
    expect(fs.exists(path)).toBe(true);
    expect(fs.read(path)).toBe("# New File\nContent here");
  });

  it("open existing file, modify, save, reopen shows changes", () => {
    const fs = makeFs({
      "/home/guest/doc.txt": "original content",
    });

    const content = fs.read("/home/guest/doc.txt");
    expect(content).toBe("original content");

    const edited = content.replace("original", "modified");
    fs.write("/home/guest/doc.txt", edited);

    const reopened = fs.read("/home/guest/doc.txt");
    expect(reopened).toBe("modified content");
  });
});
