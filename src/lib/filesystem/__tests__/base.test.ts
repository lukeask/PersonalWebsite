import { describe, it, expect, beforeEach } from "vitest";
import { BaseFileSystem } from "../base";
import type { FileEntry } from "@/lib/types";

function makeEntry(
  path: string,
  content: string = "",
  overrides: Partial<FileEntry["stat"]> = {},
): FileEntry {
  return {
    path,
    content,
    stat: {
      size: content.length,
      created: 1000000,
      modified: 2000000,
      type: "file",
      permissions: "-r--r--r--",
      ...overrides,
    },
  };
}

const testFiles: FileEntry[] = [
  makeEntry("/home/guest/readme.md", "# Hello World"),
  makeEntry("/home/guest/.hidden", "secret"),
  makeEntry("/home/guest/projects/foo/index.ts", "export default 42;"),
  makeEntry("/home/guest/projects/foo/lib.ts", "export const x = 1;"),
  makeEntry("/home/guest/projects/bar/main.ts", "console.log('bar');"),
  makeEntry("/etc/hostname", "askew.sh"),
  makeEntry("/var/log/syslog", "log line 1"),
];

describe("BaseFileSystem", () => {
  let fs: BaseFileSystem;

  beforeEach(() => {
    fs = new BaseFileSystem(testFiles);
  });

  describe("resolvePath", () => {
    it("resolves absolute paths as-is", () => {
      expect(fs.resolvePath("/home/guest")).toBe("/home/guest");
    });

    it("resolves relative paths against cwd", () => {
      expect(fs.resolvePath("readme.md", "/home/guest")).toBe(
        "/home/guest/readme.md",
      );
    });

    it("resolves . to cwd", () => {
      expect(fs.resolvePath(".", "/home/guest")).toBe("/home/guest");
    });

    it("resolves .. to parent", () => {
      expect(fs.resolvePath("..", "/home/guest")).toBe("/home");
    });

    it("resolves complex relative paths", () => {
      expect(fs.resolvePath("../guest/./projects/../readme.md", "/home/guest")).toBe(
        "/home/guest/readme.md",
      );
    });

    it("resolves ~ to /home/guest", () => {
      expect(fs.resolvePath("~")).toBe("/home/guest");
    });

    it("resolves ~/path to /home/guest/path", () => {
      expect(fs.resolvePath("~/projects")).toBe("/home/guest/projects");
    });

    it("resolves empty string to cwd", () => {
      expect(fs.resolvePath("", "/var/log")).toBe("/var/log");
    });

    it("resolves / as root", () => {
      expect(fs.resolvePath("/")).toBe("/");
    });

    it("handles .. at root (stays at root)", () => {
      expect(fs.resolvePath("/..")).toBe("/");
    });

    it("normalizes trailing slashes", () => {
      expect(fs.resolvePath("/home/guest/")).toBe("/home/guest");
    });
  });

  describe("read", () => {
    it("returns file content", () => {
      expect(fs.read("/home/guest/readme.md")).toBe("# Hello World");
    });

    it("throws for nonexistent file", () => {
      expect(() => fs.read("/no/such/file")).toThrow("No such file or directory");
    });

    it("throws when reading a directory", () => {
      expect(() => fs.read("/home/guest")).toThrow("Is a directory");
    });

    it("reads hidden files", () => {
      expect(fs.read("/home/guest/.hidden")).toBe("secret");
    });
  });

  describe("exists", () => {
    it("returns true for existing file", () => {
      expect(fs.exists("/home/guest/readme.md")).toBe(true);
    });

    it("returns true for existing directory", () => {
      expect(fs.exists("/home/guest")).toBe(true);
    });

    it("returns true for root", () => {
      expect(fs.exists("/")).toBe(true);
    });

    it("returns false for nonexistent path", () => {
      expect(fs.exists("/no/such/path")).toBe(false);
    });

    it("returns true for hidden files", () => {
      expect(fs.exists("/home/guest/.hidden")).toBe(true);
    });
  });

  describe("isDirectory", () => {
    it("returns true for directory", () => {
      expect(fs.isDirectory("/home/guest")).toBe(true);
    });

    it("returns true for root", () => {
      expect(fs.isDirectory("/")).toBe(true);
    });

    it("returns false for file", () => {
      expect(fs.isDirectory("/home/guest/readme.md")).toBe(false);
    });

    it("returns false for nonexistent path", () => {
      expect(fs.isDirectory("/no/such/path")).toBe(false);
    });
  });

  describe("stat", () => {
    it("returns FileStat for a file with UTF-16 size", () => {
      const stat = fs.stat("/home/guest/readme.md");
      expect(stat.type).toBe("file");
      expect(stat.size).toBe("# Hello World".length * 2);
      expect(stat.created).toBe(1000000);
      expect(stat.modified).toBe(2000000);
      expect(stat.permissions).toBe("-r--r--r--");
    });

    it("returns FileStat for a directory", () => {
      const stat = fs.stat("/home/guest");
      expect(stat.type).toBe("directory");
      expect(stat.size).toBe(4096);
    });

    it("returns FileStat for root", () => {
      const stat = fs.stat("/");
      expect(stat.type).toBe("directory");
    });

    it("throws for nonexistent path", () => {
      expect(() => fs.stat("/no/such/file")).toThrow("No such file or directory");
    });
  });

  describe("list", () => {
    it("lists directory entries sorted", () => {
      const entries = fs.list("/home/guest");
      expect(entries).toEqual([".hidden", "projects", "readme.md"]);
    });

    it("lists root directory", () => {
      const entries = fs.list("/");
      expect(entries).toEqual(["etc", "home", "var"]);
    });

    it("lists nested directories", () => {
      const entries = fs.list("/home/guest/projects");
      expect(entries).toEqual(["bar", "foo"]);
    });

    it("throws for nonexistent directory", () => {
      expect(() => fs.list("/no/such/dir")).toThrow("No such file or directory");
    });

    it("throws for file path", () => {
      expect(() => fs.list("/home/guest/readme.md")).toThrow("Not a directory");
    });

    it("includes hidden files", () => {
      const entries = fs.list("/home/guest");
      expect(entries).toContain(".hidden");
    });
  });

  describe("glob", () => {
    it("matches * for single segment", () => {
      const matches = fs.glob("/home/guest/*.md");
      expect(matches).toEqual(["/home/guest/readme.md"]);
    });

    it("matches ** for any depth", () => {
      const matches = fs.glob("/home/guest/**/*.ts");
      expect(matches).toContain("/home/guest/projects/foo/index.ts");
      expect(matches).toContain("/home/guest/projects/foo/lib.ts");
      expect(matches).toContain("/home/guest/projects/bar/main.ts");
    });

    it("matches ? for single character", () => {
      const matches = fs.glob("/home/guest/projects/???/main.ts");
      expect(matches).toEqual(["/home/guest/projects/bar/main.ts"]);
    });

    it("returns empty for no matches", () => {
      expect(fs.glob("/home/guest/*.xyz")).toEqual([]);
    });

    it("uses basePath for relative patterns", () => {
      const matches = fs.glob("*.md", "/home/guest");
      expect(matches).toEqual(["/home/guest/readme.md"]);
    });

    it("matches hidden files", () => {
      const matches = fs.glob("/home/guest/.*");
      expect(matches).toEqual(["/home/guest/.hidden"]);
    });

    it("returns sorted results", () => {
      const matches = fs.glob("/home/guest/projects/foo/*");
      expect(matches).toEqual([
        "/home/guest/projects/foo/index.ts",
        "/home/guest/projects/foo/lib.ts",
      ]);
    });
  });

  describe("write and delete (read-only)", () => {
    it("write throws read-only error", () => {
      expect(() => fs.write("/test", "data")).toThrow(
        "Base filesystem is read-only",
      );
    });

    it("delete throws read-only error", () => {
      expect(() => fs.delete("/test")).toThrow("Base filesystem is read-only");
    });
  });
});
