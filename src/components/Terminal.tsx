"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  type ReactNode,
} from "react";
import type {
  TerminalEntry,
  TerminalOutputLine,
  ShellState,
  UserIdentity,
  CommandOutput,
  CommandRegistry,
  FileSystem,
  HistoryEntry,
  CommandContext,
} from "@/lib/types";
import { execute as shellExecute } from "@/lib/shell/executor";
import {
  getTabCompletion,
  initReverseSearch,
  updateSearchQuery,
  deleteSearchChar,
  nextSearchMatch,
  deleteToStart,
  deleteToEnd,
  deleteWordBefore,
  historyUp,
  historyDown,
  type ReverseSearchState,
  type HistoryCycleState,
} from "@/lib/shell/keybindings";
import { Prompt } from "./Prompt";
import { TerminalOutputRenderer } from "./TerminalOutput";

export interface TerminalHandle {
  simulateCommand: (cmd: string, animate?: boolean) => void;
}

interface TerminalProps {
  onExecute?: (
    command: string,
    state: ShellState,
  ) => CommandOutput | Promise<CommandOutput>;
  registry?: CommandRegistry;
  fs?: FileSystem;
  vimOverlay?: ReactNode;
  initialCwd?: string;
  initialUser?: UserIdentity;
  prelude?: TerminalOutputLine[];
}

const DEFAULT_USER: UserIdentity = {
  username: "guest",
  uid: 1000,
  groups: ["guest"],
  home: "/home/guest",
  ps1: "\\u@\\h:\\w$ ",
};

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(
  function Terminal(
    {
      onExecute,
      registry,
      fs,
      vimOverlay,
      initialCwd,
      initialUser = DEFAULT_USER,
      prelude,
    },
    ref,
  ) {
    const [entries, setEntries] = useState<TerminalEntry[]>([]);
    const [input, setInput] = useState("");
    const [cwd, setCwd] = useState(initialCwd ?? initialUser.home);
    const [user, setUser] = useState<UserIdentity>(initialUser);
    const [env, setEnv] = useState<Record<string, string>>({
      HOME: initialUser.home,
      USER: initialUser.username,
      SHELL: "/bin/bash",
      TERM: "xterm-256color",
    });
    const [aliases, setAliases] = useState<Record<string, string>>({});
    const [commandHistory, setCommandHistory] = useState<HistoryEntry[]>([]);
    const [historyCycle, setHistoryCycle] = useState<HistoryCycleState>({
      index: -1,
      savedInput: "",
    });
    const [reverseSearch, setReverseSearch] =
      useState<ReverseSearchState | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const animationRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Ref mirrors so executeCommand always reads the latest state values
    // even when React hasn't flushed a state update yet (e.g. rapid simulateCommand calls).
    const cwdRef = useRef(cwd);
    const envRef = useRef(env);
    const userRef = useRef(user);
    const aliasesRef = useRef(aliases);
    const historyRef = useRef(commandHistory);

    // Keep refs in sync after every render
    useEffect(() => { cwdRef.current = cwd; }, [cwd]);
    useEffect(() => { envRef.current = env; }, [env]);
    useEffect(() => { userRef.current = user; }, [user]);
    useEffect(() => { aliasesRef.current = aliases; }, [aliases]);
    useEffect(() => { historyRef.current = commandHistory; }, [commandHistory]);

    useEffect(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, [entries, input]);

    useEffect(() => {
      return () => {
        if (animationRef.current) clearTimeout(animationRef.current);
      };
    }, []);

    const getShellState = useCallback(
      (): ShellState => ({
        history: entries,
        cwd,
        env,
        user,
        aliases,
        commandHistory,
      }),
      [entries, cwd, env, user, aliases, commandHistory],
    );

    const executeCommand = useCallback(
      async (cmd: string) => {
        const trimmed = cmd.trim();
        if (!trimmed) return;

        let output: CommandOutput;

        if (onExecute) {
          // Legacy / test override path
          try {
            output = await onExecute(trimmed, getShellState());
          } catch (err) {
            output = {
              lines: [
                {
                  content: String(err instanceof Error ? err.message : err),
                  style: "error",
                },
              ],
              exitCode: 1,
            };
          }
        } else if (fs) {
          // Primary execution path: build a CommandContext wired to this
          // terminal's own state setters so commands like cd, export, su,
          // alias actually take effect.
          // Read from refs so we always get the latest values even if React
          // hasn't flushed a prior state update yet (race condition fix).
          const ctx: CommandContext = {
            fs,
            cwd: cwdRef.current,
            env: envRef.current,
            user: userRef.current,
            aliases: aliasesRef.current,
            history: historyRef.current,
            setCwd: (newCwd) => {
              cwdRef.current = newCwd;
              setCwd(newCwd);
            },
            setEnv: (key, val) => {
              envRef.current = { ...envRef.current, [key]: val };
              setEnv((prev) => ({ ...prev, [key]: val }));
            },
            setUser: (newUser) => {
              userRef.current = newUser;
              setUser(newUser);
            },
            addAlias: (name, expansion) => {
              aliasesRef.current = { ...aliasesRef.current, [name]: expansion };
              setAliases((prev) => ({ ...prev, [name]: expansion }));
            },
            removeAlias: (name) => {
              const next = { ...aliasesRef.current };
              delete next[name];
              aliasesRef.current = next;
              setAliases((prev) => {
                const n = { ...prev };
                delete n[name];
                return n;
              });
            },
          };
          try {
            output = await shellExecute(trimmed, ctx);
          } catch (err) {
            output = {
              lines: [
                {
                  content: String(err instanceof Error ? err.message : err),
                  style: "error",
                },
              ],
              exitCode: 1,
            };
          }
        } else {
          const name = trimmed.split(/\s+/)[0];
          output = {
            lines: [{ content: `${name}: command not found`, style: "error" }],
            exitCode: 127,
          };
        }

        const entry: TerminalEntry = {
          command: trimmed,
          output,
          cwd: cwdRef.current,
          timestamp: Date.now(),
        };

        if (output.clearScreen) {
          setEntries([]);
        } else {
          setEntries((prev) => [...prev, entry]);
        }
        setCommandHistory((prev) => [
          ...prev,
          { command: trimmed, timestamp: Date.now() },
        ]);
        setHistoryCycle({ index: -1, savedInput: "" });
        setInput("");
      },
      // Refs are stable — only re-create when fs or onExecute/getShellState change.
      [fs, onExecute, getShellState],
    );

    const simulateCommand = useCallback(
      (cmd: string, animate = false) => {
        if (!animate) {
          setInput(cmd);
          setTimeout(() => executeCommand(cmd), 0);
          return;
        }

        let charIndex = 0;
        setInput("");

        const typeChar = () => {
          if (charIndex < cmd.length) {
            setInput(cmd.slice(0, charIndex + 1));
            charIndex++;
            animationRef.current = setTimeout(typeChar, 3 + Math.random() * 27);
          } else {
            animationRef.current = setTimeout(() => executeCommand(cmd), 150);
          }
        };
        typeChar();
      },
      [executeCommand],
    );

    useImperativeHandle(ref, () => ({ simulateCommand }), [simulateCommand]);

    // Listen for simulate-command events from embedded components (e.g. Neofetch nav)
    useEffect(() => {
      const handler = (e: Event) => {
        const detail = (e as CustomEvent<{ command: string }>).detail;
        if (detail?.command) {
          simulateCommand(detail.command, true);
        }
      };
      window.addEventListener("terminal:simulate-command", handler);
      return () => window.removeEventListener("terminal:simulate-command", handler);
    }, [simulateCommand]);

    const setCursorPos = (pos: number) => {
      requestAnimationFrame(() => {
        inputRef.current?.setSelectionRange(pos, pos);
      });
    };

    const handleReverseSearchKey = (
      e: React.KeyboardEvent<HTMLInputElement>,
    ) => {
      if (!reverseSearch) return;
      e.preventDefault();

      if (e.key === "Escape" || (e.key === "c" && e.ctrlKey)) {
        setReverseSearch(null);
        return;
      }

      if (e.key === "Enter") {
        const cmd = reverseSearch.matchedCommand ?? "";
        setReverseSearch(null);
        setInput(cmd);
        executeCommand(cmd);
        return;
      }

      if (e.key === "r" && e.ctrlKey) {
        setReverseSearch(nextSearchMatch(reverseSearch, commandHistory));
        return;
      }

      if (e.key === "Backspace") {
        setReverseSearch(deleteSearchChar(reverseSearch, commandHistory));
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setReverseSearch(
          updateSearchQuery(reverseSearch, e.key, commandHistory),
        );
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (reverseSearch) {
        handleReverseSearchKey(e);
        return;
      }

      const el = inputRef.current;
      const cursor = el?.selectionStart ?? input.length;

      if (e.key === "Enter") {
        e.preventDefault();
        executeCommand(input);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const result = historyUp(historyCycle, input, commandHistory);
        if (result) {
          setHistoryCycle(result.state);
          setInput(result.input);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const result = historyDown(historyCycle, commandHistory);
        if (result) {
          setHistoryCycle(result.state);
          setInput(result.input);
        }
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (!registry || !fs) return;
        const result = getTabCompletion(input, cursor, registry, fs, cwd);
        if (result.type === "single" && result.value != null) {
          setInput(result.value);
          setCursorPos(result.cursorPos!);
        } else if (result.type === "multiple" && result.matches) {
          setEntries((prev) => [
            ...prev,
            {
              command: input,
              output: {
                lines: [{ content: result.matches!.join("  ") }],
                exitCode: 0,
              },
              cwd,
              timestamp: Date.now(),
            },
          ]);
        }
      } else if (e.key === "c" && e.ctrlKey) {
        e.preventDefault();
        setEntries((prev) => [
          ...prev,
          {
            command: input + "^C",
            output: { lines: [], exitCode: 130 },
            cwd,
            timestamp: Date.now(),
          },
        ]);
        setInput("");
        setHistoryCycle({ index: -1, savedInput: "" });
      } else if (e.key === "l" && e.ctrlKey) {
        e.preventDefault();
        setEntries([]);
      } else if (e.key === "d" && e.ctrlKey) {
        e.preventDefault();
        if (input === "") {
          setEntries((prev) => [
            ...prev,
            {
              command: "",
              output: {
                lines: [
                  {
                    content:
                      "Type 'exit' to leave. Just kidding, there's nowhere to go.",
                    style: "dim",
                  },
                ],
                exitCode: 0,
              },
              cwd,
              timestamp: Date.now(),
            },
          ]);
        }
      } else if (e.key === "a" && e.ctrlKey) {
        e.preventDefault();
        setCursorPos(0);
      } else if (e.key === "e" && e.ctrlKey) {
        e.preventDefault();
        setCursorPos(input.length);
      } else if (e.key === "Home") {
        e.preventDefault();
        setCursorPos(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setCursorPos(input.length);
      } else if (e.key === "u" && e.ctrlKey) {
        e.preventDefault();
        const result = deleteToStart(input, cursor);
        setInput(result.value);
        setCursorPos(result.cursorPos);
      } else if (e.key === "k" && e.ctrlKey) {
        e.preventDefault();
        const result = deleteToEnd(input, cursor);
        setInput(result.value);
        setCursorPos(result.cursorPos);
      } else if (e.key === "w" && e.ctrlKey) {
        e.preventDefault();
        const result = deleteWordBefore(input, cursor);
        setInput(result.value);
        setCursorPos(result.cursorPos);
      } else if (e.key === "r" && e.ctrlKey) {
        e.preventDefault();
        setReverseSearch(initReverseSearch());
      }
    };

    const focusInput = () => inputRef.current?.focus();

    if (vimOverlay) {
      return (
        <div className="h-full w-full bg-terminal-bg text-terminal-fg font-mono">
          {vimOverlay}
        </div>
      );
    }

    return (
      <div
        ref={scrollRef}
        onClick={focusInput}
        className="askew-terminal h-full w-full overflow-y-auto bg-terminal-bg text-terminal-fg font-mono text-sm leading-relaxed p-5 cursor-text flex flex-col"
      >
        {prelude && prelude.length > 0 && (
          <TerminalOutputRenderer
            output={{ lines: prelude, exitCode: 0 }}
            onClickAction={(cmd) => simulateCommand(cmd, true)}
          />
        )}

        {entries.map((entry, i) => (
          <div key={i} className="mb-1">
            <div>
              <Prompt user={user} cwd={entry.cwd} />
              <span className="text-terminal-fg">{entry.command}</span>
            </div>
            <TerminalOutputRenderer
              output={entry.output}
              onClickAction={(cmd) => simulateCommand(cmd, true)}
            />
          </div>
        ))}

        <div className="flex items-center shrink-0">
          {reverseSearch ? (
            <span className="text-terminal-dim whitespace-pre">
              {`(reverse-i-search)'${reverseSearch.query}': `}
            </span>
          ) : (
            <Prompt user={user} cwd={cwd} />
          )}
          <input
            ref={inputRef}
            type="text"
            value={
              reverseSearch
                ? (reverseSearch.matchedCommand ?? "")
                : input
            }
            onChange={(e) => {
              if (!reverseSearch) setInput(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-terminal-fg outline-none border-none caret-terminal-cursor font-[inherit] text-[length:inherit] leading-[inherit]"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            maxLength={1000}
          />
        </div>
      </div>
    );
  },
);
