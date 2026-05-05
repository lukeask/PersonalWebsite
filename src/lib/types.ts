import type { ReactNode } from "react";

// --- Filesystem ---

export interface FileStat {
  size: number;
  created: number;
  modified: number;
  type: "file" | "directory";
  permissions: string;
}

export interface FileEntry {
  path: string;
  content: string;
  stat: FileStat;
}

export interface FileSystem {
  read(path: string): string;
  write(path: string, content: string): void;
  delete(path: string): void;
  exists(path: string): boolean;
  stat(path: string): FileStat;
  list(path: string): string[];
  glob(pattern: string, basePath?: string): string[];
  isDirectory(path: string): boolean;
}

// --- Terminal Output ---

export interface ClickAction {
  command: string;
}

export interface TerminalOutputLine {
  content: string | ReactNode;
  style?: "error" | "bold" | "dim" | "highlight" | "link";
  clickAction?: ClickAction;
}

export interface CommandOutput {
  lines: TerminalOutputLine[];
  exitCode: number;
  clearScreen?: boolean;
}

// --- User & History ---

export interface UserIdentity {
  username: string;
  uid: number;
  groups: string[];
  home: string;
  ps1: string;
}

export interface HistoryEntry {
  command: string;
  timestamp: number;
}

// --- Shell ---

export interface CommandContext {
  fs: FileSystem;
  cwd: string;
  env: Record<string, string>;
  user: UserIdentity;
  aliases: Record<string, string>;
  history: HistoryEntry[];
  setCwd(path: string): void;
  setEnv(key: string, val: string): void;
  setUser(user: UserIdentity): void;
  addAlias(name: string, expansion: string): void;
  removeAlias?(name: string): void;
}

export interface Command {
  name: string;
  aliases: string[];
  description: string;
  usage: string;
  execute(
    args: string[],
    flags: Record<string, string | boolean>,
    stdin: string | null,
    ctx: CommandContext,
  ): CommandOutput | Promise<CommandOutput>;
}

export interface CommandRegistry {
  register(cmd: Command): void;
  get(name: string): Command | undefined;
  list(): Command[];
  getCompletions(partial: string): string[];
}

// --- Terminal State ---

export interface TerminalEntry {
  command: string;
  output: CommandOutput;
  cwd: string;
  timestamp: number;
}

export interface ShellState {
  history: TerminalEntry[];
  cwd: string;
  env: Record<string, string>;
  user: UserIdentity;
  aliases: Record<string, string>;
  commandHistory: HistoryEntry[];
}

// --- Build Manifest ---

export interface BaseFilesystemManifest {
  version: string;
  buildTime: number;
  files: Record<string, string>;
}
