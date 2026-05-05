import type { FileSystem, FileStat } from "@/lib/types";
import type { OverlayStorage } from "@/lib/storage/indexed";
import { globToRegex } from "@/lib/util/glob";
import { resolvePath, joinPath } from "@/lib/util/paths";

interface CacheEntry {
  content: string;
  created: number;
  modified: number;
  deleted: boolean;
}

export class OverlayFileSystem implements FileSystem {
  private cache: Map<string, CacheEntry> = new Map();
  private storage: OverlayStorage | null = null;

  async init(storage: OverlayStorage): Promise<void> {
    this.storage = storage;
    const records = await storage.getAll();
    for (const rec of records) {
      this.cache.set(rec.path, {
        content: rec.content,
        created: rec.created,
        modified: rec.modified,
        deleted: rec.deleted,
      });
    }
  }

  /** True if the path has an explicit tombstone entry. */
  isTombstoned(path: string): boolean {
    const entry = this.cache.get(resolvePath(path, "/", "/"));
    return entry?.deleted === true;
  }

  /** True if the path has a live (non-deleted) file entry in the cache. */
  hasFile(path: string): boolean {
    const entry = this.cache.get(resolvePath(path, "/", "/"));
    return entry !== undefined && !entry.deleted;
  }

  read(path: string): string {
    const p = resolvePath(path, "/", "/");
    const entry = this.cache.get(p);
    if (!entry || entry.deleted) throw new Error(`No such file or directory: ${path}`);
    if (this.isDirectory(p)) throw new Error(`Is a directory: ${path}`);
    return entry.content;
  }

  write(path: string, content: string): void {
    const p = resolvePath(path, "/", "/");
    const now = Date.now();
    const existing = this.cache.get(p);
    const entry: CacheEntry = {
      content,
      created: existing?.created ?? now,
      modified: now,
      deleted: false,
    };
    this.cache.set(p, entry);
    this.storage?.putFile(p, content, entry.created);
  }

  delete(path: string): void {
    const p = resolvePath(path, "/", "/");
    const now = Date.now();
    const existing = this.cache.get(p);
    const tombstone: CacheEntry = {
      content: existing?.content ?? "",
      created: existing?.created ?? now,
      modified: now,
      deleted: true,
    };
    this.cache.set(p, tombstone);
    this.storage?.deleteFile(p);
  }

  exists(path: string): boolean {
    const p = resolvePath(path, "/", "/");
    const entry = this.cache.get(p);
    if (entry !== undefined) return !entry.deleted;
    return this.isDirectory(p);
  }

  isDirectory(path: string): boolean {
    const p = resolvePath(path, "/", "/");
    if (p === "/") return true;
    const prefix = p + "/";
    for (const [key, entry] of this.cache) {
      if (!entry.deleted && key.startsWith(prefix)) return true;
    }
    return false;
  }

  stat(path: string): FileStat {
    const p = resolvePath(path, "/", "/");
    const entry = this.cache.get(p);
    if (entry && !entry.deleted) {
      return {
        size: entry.content.length * 2,
        created: entry.created,
        modified: entry.modified,
        type: "file",
        permissions: "-rw-r--r--",
      };
    }
    if (this.isDirectory(p)) {
      return {
        size: 4096,
        created: 0,
        modified: 0,
        type: "directory",
        permissions: "drwxr-xr-x",
      };
    }
    throw new Error(`No such file or directory: ${path}`);
  }

  list(path: string): string[] {
    const p = resolvePath(path, "/", "/");
    if (!this.exists(p)) throw new Error(`No such file or directory: ${path}`);
    if (!this.isDirectory(p)) throw new Error(`Not a directory: ${path}`);

    const prefix = p === "/" ? "/" : p + "/";
    const names = new Set<string>();

    for (const [key, entry] of this.cache) {
      if (!entry.deleted && key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        const segment = rest.split("/")[0];
        if (segment) names.add(segment);
      }
    }
    return Array.from(names).sort();
  }

  glob(pattern: string, basePath: string = "/"): string[] {
    const resolvedBase = resolvePath(basePath, "/", "/");
    const allPaths = this.collectPaths(resolvedBase);
    const regex = globToRegex(pattern, resolvedBase);
    return allPaths.filter((p) => regex.test(p)).sort();
  }

  private collectPaths(basePath: string): string[] {
    const prefix = basePath === "/" ? "/" : basePath + "/";
    const result: string[] = [];
    const seenDirs = new Set<string>();

    for (const [key, entry] of this.cache) {
      if (!entry.deleted && key.startsWith(prefix)) {
        result.push(key);
        // Add implied intermediate directories
        const rest = key.slice(prefix.length);
        const parts = rest.split("/");
        let current = basePath;
        for (let i = 0; i < parts.length - 1; i++) {
          current = joinPath(current, parts[i]);
          if (!seenDirs.has(current)) {
            seenDirs.add(current);
            result.push(current);
          }
        }
      }
    }
    return result;
  }

  /** Returns all live (non-deleted) file paths in the overlay. */
  getModifiedPaths(): string[] {
    const result: string[] = [];
    for (const [key, entry] of this.cache) {
      if (!entry.deleted) result.push(key);
    }
    return result.sort();
  }

  /** Returns all tombstoned (deleted) file paths in the overlay. */
  getTombstonedPaths(): string[] {
    const result: string[] = [];
    for (const [key, entry] of this.cache) {
      if (entry.deleted) result.push(key);
    }
    return result.sort();
  }

  /** Clears the in-memory cache (call reset() on MergedFileSystem instead). */
  clearCache(): void {
    this.cache.clear();
  }

  async reset(): Promise<void> {
    this.cache.clear();
    await this.storage?.clearAll();
  }
}
