import type { FileSystem, FileEntry, FileStat } from "@/lib/types";
import { globToRegex } from "@/lib/util/glob";
import { joinPath } from "@/lib/util/paths";

type TreeNode =
  | { type: "file"; entry: FileEntry }
  | { type: "directory"; children: Record<string, TreeNode> };

export class BaseFileSystem implements FileSystem {
  private root: TreeNode;

  constructor(files: FileEntry[]) {
    this.root = { type: "directory", children: {} };
    for (const entry of files) {
      this.insertEntry(entry);
    }
  }

  private insertEntry(entry: FileEntry): void {
    const parts = entry.path.replace(/^\//, "").split("/");
    let node = this.root;

    for (let i = 0; i < parts.length - 1; i++) {
      if (node.type !== "directory") return;
      const segment = parts[i];
      if (!node.children[segment]) {
        node.children[segment] = {
          type: "directory",
          children: {},
        };
      }
      node = node.children[segment];
    }

    if (node.type !== "directory") return;
    const filename = parts[parts.length - 1];
    if (entry.stat.type === "directory") {
      if (!node.children[filename]) {
        node.children[filename] = { type: "directory", children: {} };
      }
    } else {
      node.children[filename] = { type: "file", entry };
    }
  }

  resolvePath(path: string, cwd: string = "/"): string {
    if (path === "") return cwd;

    let expanded = path;
    if (expanded === "~" || expanded.startsWith("~/")) {
      expanded = "/home/guest" + expanded.slice(1);
    }

    const absolute = expanded.startsWith("/")
      ? expanded
      : cwd.replace(/\/$/, "") + "/" + expanded;

    const parts = absolute.split("/");
    const resolved: string[] = [];

    for (const part of parts) {
      if (part === "" || part === ".") continue;
      if (part === "..") {
        resolved.pop();
      } else {
        resolved.push(part);
      }
    }

    return "/" + resolved.join("/");
  }

  private getNode(resolvedPath: string): TreeNode | null {
    if (resolvedPath === "/") return this.root;

    const parts = resolvedPath.replace(/^\//, "").split("/");
    let node: TreeNode = this.root;

    for (const part of parts) {
      if (node.type !== "directory" || !node.children[part]) return null;
      node = node.children[part];
    }

    return node;
  }

  read(path: string): string {
    const resolved = this.resolvePath(path);
    const node = this.getNode(resolved);
    if (!node) throw new Error(`No such file or directory: ${path}`);
    if (node.type === "directory") throw new Error(`Is a directory: ${path}`);
    return node.entry.content;
  }

  exists(path: string): boolean {
    const resolved = this.resolvePath(path);
    return this.getNode(resolved) !== null;
  }

  isDirectory(path: string): boolean {
    const resolved = this.resolvePath(path);
    const node = this.getNode(resolved);
    return node !== null && node.type === "directory";
  }

  stat(path: string): FileStat {
    const resolved = this.resolvePath(path);
    const node = this.getNode(resolved);
    if (!node) throw new Error(`No such file or directory: ${path}`);
    if (node.type === "file") {
      return {
        ...node.entry.stat,
        size: node.entry.content.length * 2,
      };
    }
    return {
      size: 4096,
      created: 0,
      modified: 0,
      type: "directory",
      permissions: "dr-xr-xr-x",
    };
  }

  list(path: string): string[] {
    const resolved = this.resolvePath(path);
    const node = this.getNode(resolved);
    if (!node) throw new Error(`No such file or directory: ${path}`);
    if (node.type !== "directory") throw new Error(`Not a directory: ${path}`);
    return Object.keys(node.children).sort();
  }

  glob(pattern: string, basePath: string = "/"): string[] {
    const resolvedBase = this.resolvePath(basePath);
    const allPaths = this.collectPaths(resolvedBase, resolvedBase);
    const regex = globToRegex(pattern, resolvedBase);
    return allPaths.filter((p) => regex.test(p)).sort();
  }

  private collectPaths(nodePath: string, basePath: string): string[] {
    const node = this.getNode(nodePath);
    if (!node || node.type !== "directory") return [];

    const result: string[] = [];
    for (const [name, child] of Object.entries(node.children)) {
      const childPath = joinPath(nodePath, name);
      result.push(childPath);
      if (child.type === "directory") {
        result.push(...this.collectPaths(childPath, basePath));
      }
    }
    return result;
  }

  write(_path: string, _content: string): void {
    throw new Error("Base filesystem is read-only");
  }

  delete(_path: string): void {
    throw new Error("Base filesystem is read-only");
  }
}
