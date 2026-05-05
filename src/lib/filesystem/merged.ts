import type { FileSystem, FileStat, BaseFilesystemManifest } from "@/lib/types";
import type { OverlayStorage } from "@/lib/storage/indexed";
import type { BaseFileSystem } from "./base";
import { OverlayFileSystem } from "./overlay";
import { globToRegex } from "@/lib/util/glob";
import { joinPath } from "@/lib/util/paths";

export class MergedFileSystem implements FileSystem {
  constructor(
    private base: BaseFileSystem,
    private overlay: OverlayFileSystem,
  ) {}

  async initOverlay(storage: OverlayStorage): Promise<void> {
    await this.overlay.init(storage);
  }

  read(path: string): string {
    if (this.overlay.isTombstoned(path)) {
      throw new Error(`No such file or directory: ${path}`);
    }
    if (this.overlay.hasFile(path)) {
      return this.overlay.read(path);
    }
    return this.base.read(path);
  }

  write(path: string, content: string): void {
    this.overlay.write(path, content);
  }

  delete(path: string): void {
    if (!this.exists(path)) throw new Error(`No such file or directory: ${path}`);
    this.overlay.delete(path);
  }

  exists(path: string): boolean {
    if (this.overlay.isTombstoned(path)) return false;
    if (this.overlay.exists(path)) return true;
    return this.base.exists(path);
  }

  isDirectory(path: string): boolean {
    if (this.overlay.isTombstoned(path)) return false;
    if (this.overlay.isDirectory(path)) return true;
    return this.base.isDirectory(path);
  }

  stat(path: string): FileStat {
    if (this.overlay.isTombstoned(path)) {
      throw new Error(`No such file or directory: ${path}`);
    }
    if (this.overlay.exists(path)) {
      return this.overlay.stat(path);
    }
    return this.base.stat(path);
  }

  list(path: string): string[] {
    if (!this.exists(path)) throw new Error(`No such file or directory: ${path}`);
    if (!this.isDirectory(path)) throw new Error(`Not a directory: ${path}`);

    const baseList = this.base.isDirectory(path) ? this.base.list(path) : [];
    const overlayList = this.overlay.isDirectory(path)
      ? this.overlay.list(path)
      : [];

    const merged = new Set([...baseList, ...overlayList]);

    const normalizedPath = path.replace(/\/$/, "") || "/";
    for (const name of merged) {
      const fullPath = joinPath(normalizedPath, name);
      if (this.overlay.isTombstoned(fullPath)) {
        merged.delete(name);
      }
    }

    return Array.from(merged).sort();
  }

  glob(pattern: string, basePath: string = "/"): string[] {
    const allPaths = this.collectAllPaths(basePath);
    const regex = globToRegex(pattern, basePath);
    return allPaths.filter((p) => regex.test(p)).sort();
  }

  private collectAllPaths(basePath: string): string[] {
    const seen = new Set<string>();
    const prefix = basePath === "/" ? "/" : basePath + "/";

    const addFromList = (dirPath: string) => {
      if (!this.isDirectory(dirPath)) return;
      let entries: string[];
      try {
        entries = this.list(dirPath);
      } catch {
        return;
      }
      for (const name of entries) {
        const fullPath = joinPath(dirPath, name);
        if (!seen.has(fullPath)) {
          seen.add(fullPath);
          if (this.isDirectory(fullPath)) {
            addFromList(fullPath);
          }
        }
      }
    };

    addFromList(basePath);

    return Array.from(seen).filter((p) => p.startsWith(prefix) || p === basePath);
  }

  /** Resets the overlay, restoring the filesystem to base-only state. */
  async reset(): Promise<void> {
    await this.overlay.reset();
  }

  /** Returns paths that exist in the overlay (modified or added). */
  getModifiedPaths(): string[] {
    return this.overlay.getModifiedPaths();
  }

  /** Returns paths that have been deleted via the overlay (tombstoned). */
  getTombstonedPaths(): string[] {
    return this.overlay.getTombstonedPaths();
  }

  /** Read a file from the base layer only, bypassing the overlay. Returns null if not in base. */
  readBase(path: string): string | null {
    try {
      return this.base.read(path);
    } catch {
      return null;
    }
  }

  /** Compares two manifests and returns the diff. */
  manifestDiff(
    oldManifest: BaseFilesystemManifest,
    newManifest: BaseFilesystemManifest,
  ): { added: string[]; removed: string[]; changed: string[] } {
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];

    for (const path of Object.keys(newManifest.files)) {
      if (!(path in oldManifest.files)) {
        added.push(path);
      } else if (oldManifest.files[path] !== newManifest.files[path]) {
        changed.push(path);
      }
    }

    for (const path of Object.keys(oldManifest.files)) {
      if (!(path in newManifest.files)) {
        removed.push(path);
      }
    }

    return { added, removed, changed };
  }
}
