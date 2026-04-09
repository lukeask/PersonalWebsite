import { describe, it, expect, beforeEach } from "vitest";
import { BaseFileSystem } from "../base";
import { OverlayFileSystem } from "../overlay";
import { MergedFileSystem } from "../merged";
import type { FileEntry, BaseFilesystemManifest } from "@/lib/types";

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

const baseFiles: FileEntry[] = [
  makeEntry("/home/guest/readme.md", "# Hello"),
  makeEntry("/home/guest/notes.md", "base notes"),
  makeEntry("/home/guest/projects/foo.ts", "export {}"),
  makeEntry("/etc/config", "base config"),
];

function makeSystem() {
  const base = new BaseFileSystem(baseFiles);
  const overlay = new OverlayFileSystem();
  const merged = new MergedFileSystem(base, overlay);
  return { base, overlay, merged };
}

describe("MergedFileSystem — overlay precedence", () => {
  it("reads base files when overlay is empty", () => {
    const { merged } = makeSystem();
    expect(merged.read("/home/guest/readme.md")).toBe("# Hello");
  });

  it("overlay content shadows base content", () => {
    const { overlay, merged } = makeSystem();
    overlay.write("/home/guest/readme.md", "# Overridden");
    expect(merged.read("/home/guest/readme.md")).toBe("# Overridden");
  });

  it("overlay can add new files not in base", () => {
    const { overlay, merged } = makeSystem();
    overlay.write("/home/guest/new.md", "new file");
    expect(merged.read("/home/guest/new.md")).toBe("new file");
  });

  it("stat returns overlay entry for shadowed file", () => {
    const { overlay, merged } = makeSystem();
    overlay.write("/home/guest/readme.md", "# Overridden");
    const s = merged.stat("/home/guest/readme.md");
    expect(s.permissions).toBe("-rw-r--r--");
  });

  it("stat returns base entry for unmodified file", () => {
    const { merged } = makeSystem();
    const s = merged.stat("/etc/config");
    expect(s.permissions).toBe("-r--r--r--");
  });
});

describe("MergedFileSystem — tombstone behavior", () => {
  it("deleted base file is not visible", () => {
    const { overlay, merged } = makeSystem();
    overlay.delete("/home/guest/readme.md");
    expect(merged.exists("/home/guest/readme.md")).toBe(false);
  });

  it("read on tombstoned file throws ENOENT", () => {
    const { overlay, merged } = makeSystem();
    overlay.delete("/home/guest/notes.md");
    expect(() => merged.read("/home/guest/notes.md")).toThrow(
      "No such file or directory",
    );
  });

  it("stat on tombstoned file throws ENOENT", () => {
    const { overlay, merged } = makeSystem();
    overlay.delete("/etc/config");
    expect(() => merged.stat("/etc/config")).toThrow("No such file or directory");
  });

  it("deleted overlay-only file is also not visible", () => {
    const { overlay, merged } = makeSystem();
    overlay.write("/home/guest/temp.md", "temp");
    overlay.delete("/home/guest/temp.md");
    expect(merged.exists("/home/guest/temp.md")).toBe(false);
  });

  it("delete throws ENOENT for nonexistent path", () => {
    const { merged } = makeSystem();
    expect(() => merged.delete("/no/such/file")).toThrow(
      "No such file or directory",
    );
  });

  it("writing over a tombstoned path restores visibility", () => {
    const { overlay, merged } = makeSystem();
    overlay.delete("/home/guest/readme.md");
    overlay.write("/home/guest/readme.md", "restored");
    expect(merged.exists("/home/guest/readme.md")).toBe(true);
    expect(merged.read("/home/guest/readme.md")).toBe("restored");
  });
});

describe("MergedFileSystem — list merging", () => {
  it("lists base-only directory", () => {
    const { merged } = makeSystem();
    expect(merged.list("/etc")).toContain("config");
  });

  it("lists includes overlay-added files", () => {
    const { overlay, merged } = makeSystem();
    overlay.write("/home/guest/newfile.md", "new");
    expect(merged.list("/home/guest")).toContain("newfile.md");
  });

  it("list excludes tombstoned base files", () => {
    const { overlay, merged } = makeSystem();
    overlay.delete("/home/guest/readme.md");
    expect(merged.list("/home/guest")).not.toContain("readme.md");
  });

  it("list includes both base and overlay files deduplicated", () => {
    const { overlay, merged } = makeSystem();
    overlay.write("/home/guest/readme.md", "# Overridden"); // same name
    overlay.write("/home/guest/extra.md", "extra");
    const entries = merged.list("/home/guest");
    const readmeCount = entries.filter((e) => e === "readme.md").length;
    expect(readmeCount).toBe(1);
    expect(entries).toContain("extra.md");
  });

  it("list result is sorted", () => {
    const { overlay, merged } = makeSystem();
    overlay.write("/home/guest/aaa.md", "a");
    const entries = merged.list("/home/guest");
    expect(entries).toEqual([...entries].sort());
  });

  it("list throws for nonexistent directory", () => {
    const { merged } = makeSystem();
    expect(() => merged.list("/no/such/dir")).toThrow("No such file or directory");
  });
});

describe("MergedFileSystem — reset", () => {
  it("reset clears all overlay data", async () => {
    const { overlay, merged } = makeSystem();
    overlay.write("/home/guest/readme.md", "# Overridden");
    overlay.write("/home/guest/new.md", "new");
    await merged.reset();
    // Base files restored
    expect(merged.read("/home/guest/readme.md")).toBe("# Hello");
    // Overlay-only files gone
    expect(merged.exists("/home/guest/new.md")).toBe(false);
  });

  it("reset removes tombstones, restoring deleted base files", async () => {
    const { overlay, merged } = makeSystem();
    overlay.delete("/etc/config");
    await merged.reset();
    expect(merged.exists("/etc/config")).toBe(true);
  });

  it("getModifiedPaths returns empty after reset", async () => {
    const { overlay, merged } = makeSystem();
    overlay.write("/home/guest/x.md", "x");
    await merged.reset();
    expect(merged.getModifiedPaths()).toEqual([]);
  });
});

describe("MergedFileSystem — getModifiedPaths", () => {
  it("returns empty when overlay is untouched", () => {
    const { merged } = makeSystem();
    expect(merged.getModifiedPaths()).toEqual([]);
  });

  it("returns paths written to overlay", () => {
    const { overlay, merged } = makeSystem();
    overlay.write("/home/guest/readme.md", "modified");
    overlay.write("/home/guest/new.md", "new");
    const paths = merged.getModifiedPaths();
    expect(paths).toContain("/home/guest/readme.md");
    expect(paths).toContain("/home/guest/new.md");
  });

  it("does not include tombstoned paths", () => {
    const { overlay, merged } = makeSystem();
    overlay.write("/home/guest/temp.md", "temp");
    overlay.delete("/home/guest/temp.md");
    expect(merged.getModifiedPaths()).not.toContain("/home/guest/temp.md");
  });
});

describe("MergedFileSystem — manifestDiff", () => {
  function makeManifest(
    files: Record<string, string>,
  ): BaseFilesystemManifest {
    return { version: "1", buildTime: 0, files };
  }

  it("detects added files", () => {
    const { merged } = makeSystem();
    const diff = merged.manifestDiff(
      makeManifest({ "/a": "hash1" }),
      makeManifest({ "/a": "hash1", "/b": "hash2" }),
    );
    expect(diff.added).toEqual(["/b"]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it("detects removed files", () => {
    const { merged } = makeSystem();
    const diff = merged.manifestDiff(
      makeManifest({ "/a": "hash1", "/b": "hash2" }),
      makeManifest({ "/a": "hash1" }),
    );
    expect(diff.removed).toEqual(["/b"]);
    expect(diff.added).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it("detects changed files", () => {
    const { merged } = makeSystem();
    const diff = merged.manifestDiff(
      makeManifest({ "/a": "hash1" }),
      makeManifest({ "/a": "hash2" }),
    );
    expect(diff.changed).toEqual(["/a"]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it("handles all three categories at once", () => {
    const { merged } = makeSystem();
    const diff = merged.manifestDiff(
      makeManifest({ "/a": "old", "/b": "same", "/c": "remove" }),
      makeManifest({ "/a": "new", "/b": "same", "/d": "added" }),
    );
    expect(diff.changed).toEqual(["/a"]);
    expect(diff.added).toEqual(["/d"]);
    expect(diff.removed).toEqual(["/c"]);
  });

  it("returns empty diff for identical manifests", () => {
    const { merged } = makeSystem();
    const manifest = makeManifest({ "/a": "hash1", "/b": "hash2" });
    const diff = merged.manifestDiff(manifest, manifest);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });
});
