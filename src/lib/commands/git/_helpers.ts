// --- Duck-typed interface for overlay-aware FS operations ---
// MergedFileSystem satisfies this at runtime; plain FileSystem stubs do not.

export interface GitAwareFS {
  getModifiedPaths(): string[];
  getTombstonedPaths(): string[];
  readBase(path: string): string | null;
  reset(): Promise<void>;
}

export function asGitFS(fs: unknown): GitAwareFS | null {
  const f = fs as Record<string, unknown>;
  if (
    typeof f.getModifiedPaths === "function" &&
    typeof f.getTombstonedPaths === "function" &&
    typeof f.readBase === "function" &&
    typeof f.reset === "function"
  ) {
    return f as unknown as GitAwareFS;
  }
  return null;
}
