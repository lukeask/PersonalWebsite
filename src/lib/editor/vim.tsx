"use client";

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type RefObject,
} from "react";
import { EditorView, lineNumbers, drawSelection } from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { vim, Vim, getCM } from "@replit/codemirror-vim";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import type { FileSystem } from "@/lib/types";
import { resolvePath } from "@/lib/util/paths";

function getLanguageExtension(filename: string): Extension | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
      return javascript({ jsx: true });
    case "ts":
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "py":
      return python();
    case "json":
      return json();
    case "md":
    case "markdown":
      return markdown();
    default:
      return null;
  }
}

const MAX_FILE_SIZE = 100_000;
const BINARY_PROBE_SIZE = 1_000;
const BINARY_RE = /[\x00-\x08\x0E-\x1F]/;

export function isBinaryContent(content: string): boolean {
  return BINARY_RE.test(content.slice(0, BINARY_PROBE_SIZE));
}

// ---------------------------------------------------------------------------
// Theme — matches the terminal colour palette (Tokyo Night–ish)
// ---------------------------------------------------------------------------

const terminalTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--terminal-bg)",
      color: "var(--terminal-fg)",
      height: "100%",
      fontSize: "inherit",
    },
    ".cm-content": {
      caretColor: "var(--terminal-cursor)",
      fontFamily: "inherit",
      padding: "4px 0",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--terminal-cursor)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "var(--terminal-selection) !important",
    },
    ".cm-gutters": {
      backgroundColor: "var(--terminal-bg)",
      color: "var(--terminal-dim)",
      border: "none",
      minWidth: "3em",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--terminal-fg)",
    },
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
    ".cm-fat-cursor": {
      backgroundColor: "var(--terminal-cursor) !important",
      color: "var(--terminal-bg) !important",
    },
    "&:not(.cm-focused) .cm-fat-cursor": {
      backgroundColor: "transparent !important",
      outline: "solid 1px var(--terminal-cursor)",
      color: "var(--terminal-fg) !important",
    },
    ".cm-panels-bottom": {
      borderTop: "none",
    },
    ".cm-vim-panel": {
      backgroundColor: "var(--terminal-bg)",
      color: "var(--terminal-fg)",
      fontFamily: "inherit",
      fontSize: "inherit",
      padding: "0 4px",
    },
    ".cm-vim-panel input": {
      color: "var(--terminal-fg)",
      backgroundColor: "transparent",
      fontFamily: "inherit",
      fontSize: "inherit",
    },
  },
  { dark: true },
);

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VimEditorProps {
  filePath: string;
  fs: FileSystem;
  cwd: string;
  onQuit: (message?: string) => void;
}

// ---------------------------------------------------------------------------
// Stable-ref helpers to avoid stale closures in Vim.defineEx callbacks
// ---------------------------------------------------------------------------

function useStableRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VimEditor({ filePath, fs, cwd, onQuit }: VimEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const [mode, setMode] = useState("NORMAL");
  const [modified, setModified] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [lineCount, setLineCount] = useState(0);
  const [currentFile, setCurrentFile] = useState(filePath);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");

  const resolvedPath = resolvePath(currentFile, cwd);

  // Stable refs for defineEx callbacks
  const modifiedRef = useStableRef(modified);
  const currentFileRef = useStableRef(currentFile);
  const resolvedPathRef = useStableRef(resolvedPath);
  const onQuitRef = useStableRef(onQuit);
  const fsRef = useStableRef(fs);
  const cwdRef = useStableRef(cwd);
  const viewRefStable = useStableRef(viewRef.current);

  // Keep viewRefStable in sync
  useEffect(() => {
    (viewRefStable as { current: EditorView | null }).current =
      viewRef.current;
  });

  // ------------------------------------------------------------------
  // Save helper (used by both component and ex-commands)
  // ------------------------------------------------------------------

  const doSave = useCallback((): boolean => {
    const view = viewRef.current;
    if (!view) return false;
    const content = view.state.doc.toString();
    try {
      fs.write(resolvedPath, content);
      setModified(false);
      const lc = view.state.doc.lines;
      setStatusMessage(
        `"${currentFile}" ${lc}L, ${content.length}C written`,
      );
      return true;
    } catch (e) {
      setStatusMessage(
        `E514: write error: ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    }
  }, [fs, resolvedPath, currentFile]);

  // ------------------------------------------------------------------
  // Define ex commands (runs once, uses refs for up-to-date values)
  // ------------------------------------------------------------------

  useEffect(() => {
    Vim.defineEx("write", "w", () => {
      const view = viewRef.current;
      if (!view) return;
      const content = view.state.doc.toString();
      const path = resolvedPathRef.current;
      try {
        fsRef.current.write(path, content);
        setModified(false);
        const lc = view.state.doc.lines;
        setStatusMessage(
          `"${currentFileRef.current}" ${lc}L, ${content.length}C written`,
        );
      } catch (e) {
        setStatusMessage(
          `E514: write error: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    });

    Vim.defineEx("quit", "q", (_cm, params) => {
      const bang = params.argString?.trim() === "!";
      if (!bang && modifiedRef.current) {
        setStatusMessage(
          "E37: No write since last change (add ! to override)",
        );
        return;
      }
      onQuitRef.current();
    });

    Vim.defineEx("wq", "wq", () => {
      const view = viewRef.current;
      if (!view) return;
      const content = view.state.doc.toString();
      const path = resolvedPathRef.current;
      try {
        fsRef.current.write(path, content);
        setModified(false);
        onQuitRef.current();
      } catch (e) {
        setStatusMessage(
          `E514: write error: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    });

    Vim.defineEx("x", "x", () => {
      if (modifiedRef.current) {
        const view = viewRef.current;
        if (!view) return;
        const content = view.state.doc.toString();
        const path = resolvedPathRef.current;
        try {
          fsRef.current.write(path, content);
          setModified(false);
        } catch (e) {
          setStatusMessage(
            `E514: write error: ${e instanceof Error ? e.message : String(e)}`,
          );
          return;
        }
      }
      onQuitRef.current();
    });

    Vim.defineEx("edit", "e", (_cm, params) => {
      const args = params.args;
      if (!args || args.length === 0) {
        setStatusMessage("E: No file name");
        return;
      }
      if (modifiedRef.current) {
        setStatusMessage(
          "E37: No write since last change (add ! to override)",
        );
        return;
      }
      setCurrentFile(args[0]);
    });

    Vim.defineEx("set", "se", (_cm, params) => {
      const arg = params.args?.[0];
      if (!arg) return;
      if (arg === "number" || arg === "nu") {
        setShowLineNumbers(true);
      } else if (arg === "nonumber" || arg === "nonu") {
        setShowLineNumbers(false);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- refs are stable

  // ------------------------------------------------------------------
  // Create / recreate editor when file or line-number pref changes
  // ------------------------------------------------------------------

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    let content = "";
    let isNewFile = false;
    const resolved = resolvePath(currentFile, cwd);

    try {
      if (fs.exists(resolved)) {
        if (fs.isDirectory(resolved)) {
          setStatusMessage(`"${currentFile}" is a directory`);
          return;
        }
        content = fs.read(resolved);
      } else {
        isNewFile = true;
      }
    } catch {
      isNewFile = true;
    }

    if (content && isBinaryContent(content)) {
      setStatusMessage(`"${currentFile}" appears to be a binary file`);
      content = "";
    }

    let truncated = false;
    if (content.length > MAX_FILE_SIZE) {
      content = content.slice(0, MAX_FILE_SIZE);
      truncated = true;
    }

    const langExt = getLanguageExtension(currentFile);

    const extensions: Extension[] = [
      vim(),
      terminalTheme,
      drawSelection(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      ...(showLineNumbers ? [lineNumbers()] : []),
      ...(langExt ? [langExt] : []),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          setModified(true);
          setLineCount(update.state.doc.lines);
        }
        if (update.selectionSet || update.docChanged) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          setCursorPos({ line: line.number, col: pos - line.from + 1 });
        }
      }),
    ];

    const state = EditorState.create({ doc: content, extensions });
    const view = new EditorView({ state, parent });
    viewRef.current = view;
    (viewRefStable as { current: EditorView | null }).current = view;

    setModified(false);
    setLineCount(view.state.doc.lines);
    setMode("NORMAL");

    if (truncated) {
      setStatusMessage(`"${currentFile}" truncated (file too large)`);
    } else if (isNewFile) {
      setStatusMessage(`"${currentFile}" [New File]`);
    } else {
      setStatusMessage(
        `"${currentFile}" ${view.state.doc.lines}L, ${content.length}C`,
      );
    }

    const cm = getCM(view);
    if (cm) {
      cm.on(
        "vim-mode-change",
        (e: { mode: string; subMode?: string }) => {
          let modeStr = e.mode.toUpperCase();
          if (e.subMode === "linewise") modeStr = "VISUAL LINE";
          else if (e.subMode === "blockwise") modeStr = "VISUAL BLOCK";
          setMode(modeStr);
        },
      );
    }

    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [currentFile, cwd, fs, showLineNumbers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full w-full">
      {/* Editor area */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />

      {/* Status line */}
      <div className="flex items-center justify-between px-2 h-6 shrink-0 text-terminal-fg bg-terminal-bg border-t border-terminal-dim/30 text-xs select-none">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-terminal-bold font-bold whitespace-nowrap">
            -- {mode} --
          </span>
          {statusMessage ? (
            <span className="truncate text-terminal-fg">{statusMessage}</span>
          ) : (
            <span className="truncate">
              {currentFile}
              {modified && (
                <span className="text-terminal-highlight"> [Modified]</span>
              )}
              <span className="text-terminal-dim ml-2">
                {lineCount}L
              </span>
            </span>
          )}
        </div>
        <span className="text-terminal-dim whitespace-nowrap ml-4">
          {cursorPos.line}:{cursorPos.col}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Command handler factory — call from the parent to create a `vim` Command
// that integrates with the Terminal's vimOverlay prop.
//
// Usage in the parent / page component:
//
//   const [vimState, setVimState] = useState<{file:string}|null>(null);
//   const vimCommand = createVimCommand({
//     onOpen: (file) => setVimState({ file }),
//   });
//   registry.register(vimCommand);
//
//   <Terminal
//     vimOverlay={vimState ? (
//       <VimEditor
//         filePath={vimState.file}
//         fs={fs} cwd={cwd}
//         onQuit={() => { setVimState(null); }}
//       />
//     ) : undefined}
//     ...
//   />
// ---------------------------------------------------------------------------

interface CreateVimCommandOptions {
  onOpen: (file: string) => void;
  onOpenPs1?: () => void;
}

export function createVimCommand({ onOpen, onOpenPs1 }: CreateVimCommandOptions) {
  return {
    name: "vim",
    aliases: ["vi"],
    description: "Open file in vim editor",
    usage: "vim <file>",
    execute(
      args: string[],
      _flags: Record<string, string | boolean>,
      _stdin: string | null,
      _ctx: import("@/lib/types").CommandContext,
    ) {
      if (args.length === 0) {
        return {
          lines: [{ content: "Usage: vim <file>", style: "error" as const }],
          exitCode: 1,
        };
      }

      const file = args[0];

      // T-402 intercept: vim .bashrc launches the PS1 editor
      const basename = file.split("/").pop() ?? file;
      if (basename === ".bashrc") {
        onOpenPs1?.();
        return {
          lines: [
            {
              content: "Opening PS1 editor for .bashrc...",
              style: "dim" as const,
            },
          ],
          exitCode: 0,
        };
      }

      onOpen(file);
      return { lines: [], exitCode: 0 };
    },
  } satisfies import("@/lib/types").Command;
}
