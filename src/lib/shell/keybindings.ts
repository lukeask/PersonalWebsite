import type { CommandRegistry, FileSystem, HistoryEntry } from "@/lib/types";
import { resolvePath, joinPath } from "@/lib/util/paths";

// --- Tab Completion ---

export interface CompletionResult {
  type: "single" | "multiple" | "none";
  value?: string;
  cursorPos?: number;
  matches?: string[];
}

function getPathCompletions(
  partial: string,
  fs: FileSystem,
  cwd: string,
): string[] {
  const isAbsolute = partial.startsWith("/");
  let dir: string;
  let prefix: string;

  const lastSlash = partial.lastIndexOf("/");
  if (lastSlash === -1) {
    dir = cwd;
    prefix = partial;
  } else {
    const dirPart = partial.slice(0, lastSlash) || "/";
    dir = isAbsolute ? dirPart : resolvePath(dirPart, cwd);
    prefix = partial.slice(lastSlash + 1);
  }

  try {
    if (!fs.exists(dir) || !fs.isDirectory(dir)) return [];
    const entries = fs.list(dir);
    const matches = entries
      .filter((e) => e.startsWith(prefix))
      .map((e) => {
        const fullPath = joinPath(dir, e);
        const isDir = fs.exists(fullPath) && fs.isDirectory(fullPath);
        const completedName = e + (isDir ? "/" : " ");
        if (lastSlash === -1) return completedName;
        const basePath = partial.slice(0, lastSlash + 1);
        return basePath + completedName;
      });
    return matches.sort();
  } catch {
    return [];
  }
}


export function getTabCompletion(
  input: string,
  cursorPos: number,
  registry: CommandRegistry,
  fs: FileSystem,
  cwd: string,
): CompletionResult {
  const beforeCursor = input.slice(0, cursorPos);
  const afterCursor = input.slice(cursorPos);
  const tokens = beforeCursor.split(/\s+/);
  const isFirstToken = tokens.length <= 1;
  const partial = tokens[tokens.length - 1] ?? "";

  let matches: string[];

  if (isFirstToken) {
    matches = registry.getCompletions(partial).map((m) => m + " ");
  } else {
    matches = getPathCompletions(partial, fs, cwd);
  }

  if (matches.length === 0) {
    return { type: "none" };
  }

  if (matches.length === 1) {
    const completed = matches[0];
    const beforePartial = beforeCursor.slice(
      0,
      beforeCursor.length - partial.length,
    );
    const newInput = beforePartial + completed + afterCursor;
    return {
      type: "single",
      value: newInput,
      cursorPos: beforePartial.length + completed.length,
    };
  }

  const commonPrefix = getCommonPrefix(matches);
  if (commonPrefix.length > partial.length) {
    const beforePartial = beforeCursor.slice(
      0,
      beforeCursor.length - partial.length,
    );
    const newInput = beforePartial + commonPrefix + afterCursor;
    return {
      type: "single",
      value: newInput,
      cursorPos: beforePartial.length + commonPrefix.length,
    };
  }

  const displayMatches = matches.map((m) => m.replace(/[/ ]$/, ""));
  return { type: "multiple", matches: displayMatches };
}

function getCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

// --- Reverse Incremental Search ---

export interface ReverseSearchState {
  active: boolean;
  query: string;
  matchIndex: number;
  matchedCommand: string | null;
}

export function initReverseSearch(): ReverseSearchState {
  return { active: true, query: "", matchIndex: -1, matchedCommand: null };
}

export function searchHistoryReverse(
  state: ReverseSearchState,
  history: HistoryEntry[],
): ReverseSearchState {
  if (!state.query) {
    return { ...state, matchIndex: -1, matchedCommand: null };
  }

  const startFrom =
    state.matchIndex === -1 ? history.length - 1 : state.matchIndex - 1;

  for (let i = startFrom; i >= 0; i--) {
    if (history[i].command.includes(state.query)) {
      return { ...state, matchIndex: i, matchedCommand: history[i].command };
    }
  }

  return { ...state, matchedCommand: state.matchedCommand };
}

export function updateSearchQuery(
  state: ReverseSearchState,
  char: string,
  history: HistoryEntry[],
): ReverseSearchState {
  const newState = { ...state, query: state.query + char, matchIndex: -1 };
  return searchHistoryReverse(newState, history);
}

export function deleteSearchChar(
  state: ReverseSearchState,
  history: HistoryEntry[],
): ReverseSearchState {
  if (state.query.length === 0) return state;
  const newState = {
    ...state,
    query: state.query.slice(0, -1),
    matchIndex: -1,
  };
  if (newState.query.length === 0) {
    return { ...newState, matchedCommand: null };
  }
  return searchHistoryReverse(newState, history);
}

export function nextSearchMatch(
  state: ReverseSearchState,
  history: HistoryEntry[],
): ReverseSearchState {
  return searchHistoryReverse(state, history);
}

// --- Input Line Manipulation ---

export interface InputState {
  value: string;
  cursorPos: number;
}

export function deleteToStart(
  input: string,
  cursorPos: number,
): InputState {
  return {
    value: input.slice(cursorPos),
    cursorPos: 0,
  };
}

export function deleteToEnd(
  input: string,
  cursorPos: number,
): InputState {
  return {
    value: input.slice(0, cursorPos),
    cursorPos,
  };
}

export function deleteWordBefore(
  input: string,
  cursorPos: number,
): InputState {
  const before = input.slice(0, cursorPos);
  const after = input.slice(cursorPos);

  let i = before.length - 1;
  while (i >= 0 && before[i] === " ") i--;
  while (i >= 0 && before[i] !== " ") i--;

  const newBefore = before.slice(0, i + 1);
  return {
    value: newBefore + after,
    cursorPos: newBefore.length,
  };
}

// --- History Cycling ---

export interface HistoryCycleState {
  index: number;
  savedInput: string;
}

export function historyUp(
  state: HistoryCycleState,
  currentInput: string,
  history: HistoryEntry[],
): { input: string; state: HistoryCycleState } | null {
  if (history.length === 0) return null;

  const savedInput =
    state.index === -1 ? currentInput : state.savedInput;

  const newIndex =
    state.index === -1
      ? history.length - 1
      : Math.max(0, state.index - 1);

  return {
    input: history[newIndex].command,
    state: { index: newIndex, savedInput },
  };
}

export function historyDown(
  state: HistoryCycleState,
  history: HistoryEntry[],
): { input: string; state: HistoryCycleState } | null {
  if (state.index === -1) return null;

  if (state.index >= history.length - 1) {
    return {
      input: state.savedInput,
      state: { index: -1, savedInput: "" },
    };
  }

  const newIndex = state.index + 1;
  return {
    input: history[newIndex].command,
    state: { ...state, index: newIndex },
  };
}
