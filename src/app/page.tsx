"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Terminal, type TerminalHandle } from "@/components/Terminal";
import { VimEditor } from "@/lib/editor/vim";
import { PS1Editor } from "@/components/PS1Editor";
import { MailComposer } from "@/lib/commands/mail";
import { registry } from "@/lib/shell/registry";
import { BaseFileSystem } from "@/lib/filesystem/base";
import { OverlayFileSystem } from "@/lib/filesystem/overlay";
import { MergedFileSystem } from "@/lib/filesystem/merged";
import { initTelemetry } from "@/lib/telemetry/client";
import { ensureGuestUser, loadCurrentUser } from "@/lib/commands/users";
import { startBackupCron, updateProgressFile } from "@/lib/ctf/game";
import { createVimCommand } from "@/lib/editor/vim";
import { createMailCommand } from "@/lib/commands/mail";
import type { UserIdentity, TerminalOutputLine } from "@/lib/types";
import { OverlayStorage } from "@/lib/storage/indexed";
import filesystemData from "../../public/filesystem.json";

// ─── Side-effect imports: register all commands with the registry ─────────────
import "@/lib/commands/navigation";
import "@/lib/commands/file-read";
import "@/lib/commands/file-mutate";
import "@/lib/commands/search";
import "@/lib/commands/text-processing";
import "@/lib/commands/environment";
import "@/lib/commands/system";
import "@/lib/commands/users";
import "@/lib/commands/network";
import "@/lib/commands/git";
import "@/lib/commands/fun";
import { popMotdLines } from "@/lib/commands/neofetch";
import "@/lib/commands/ctf";
import "@/lib/commands/reset";

// ─── Types ────────────────────────────────────────────────────────────────────

type VimState = { file: string; cwd: string; home: string } | null;
type OverlayKind = "vim" | "ps1" | "mail" | null;
type VisitorTheme = "dark" | "light";

const THEME_STORAGE_KEYS = ["askew:theme", "visitor-theme", "theme"] as const;

function normalizeTheme(raw: string | null | undefined): VisitorTheme | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value.includes("light")) return "light";
  if (value.includes("dark")) return "dark";
  if (value === "0" || value === "false") return "dark";
  if (value === "1" || value === "true") return "light";
  return null;
}

function readThemeFromStorage(storage: Storage): VisitorTheme | null {
  for (const key of THEME_STORAGE_KEYS) {
    const found = normalizeTheme(storage.getItem(key));
    if (found) return found;
  }
  return null;
}

function resolveVisitorTheme(): VisitorTheme {
  if (typeof window === "undefined") return "dark";

  const htmlTheme = normalizeTheme(
    document.documentElement.getAttribute("data-theme"),
  );
  if (htmlTheme) return htmlTheme;

  const rootClassList = document.documentElement.classList;
  if (rootClassList.contains("light")) return "light";
  if (rootClassList.contains("dark")) return "dark";

  const localTheme = readThemeFromStorage(localStorage);
  if (localTheme) return localTheme;

  const sessionTheme = readThemeFromStorage(sessionStorage);
  if (sessionTheme) return sessionTheme;

  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  ) {
    return "light";
  }

  return "dark";
}

const DEFAULT_USER: UserIdentity = {
  username: "guest",
  uid: 1000,
  groups: ["guest"],
  home: "/home/guest",
  ps1: "\\u@\\h:\\w$ ",
};

// ─── Filesystem setup ─────────────────────────────────────────────────────────

type RawFileEntry = {
  content: string;
  stat: {
    size: number;
    created: number;
    modified: number;
    type: "file" | "directory";
    permissions: string;
  };
};

function createFilesystem(): MergedFileSystem {
  const rawFiles = filesystemData.files as Record<string, RawFileEntry>;
  const entries = Object.entries(rawFiles).map(([path, data]) => ({
    path,
    content: data.content ?? "",
    stat: data.stat,
  }));
  const base = new BaseFileSystem(entries);
  const overlay = new OverlayFileSystem();
  return new MergedFileSystem(base, overlay);
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function Home() {
  const terminalRef = useRef<TerminalHandle>(null);
  const [overlayKind, setOverlayKind] = useState<OverlayKind>(null);
  const [vimState, setVimState] = useState<VimState>(null);
  const [user, setUser] = useState<UserIdentity>(DEFAULT_USER);
  const [cwd] = useState(DEFAULT_USER.home);
  const [prelude, setPrelude] = useState<TerminalOutputLine[]>([]);
  const [visitorTheme, setVisitorTheme] = useState<VisitorTheme>("dark");
  const neofetchRunRef = useRef(false);

  const fs = useMemo(() => createFilesystem(), []);

  // ── Initialise on mount ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let userTimer: ReturnType<typeof setTimeout> | undefined;
    let preludeTimer: ReturnType<typeof setTimeout> | undefined;
    let stopCron: (() => void) | undefined;

    void (async () => {
      await fs.initOverlay(new OverlayStorage());
      if (cancelled) return;

      initTelemetry();
      ensureGuestUser();
      userTimer = setTimeout(() => {
        const savedUser = loadCurrentUser();
        if (savedUser) setUser(savedUser);
      }, 0);
      preludeTimer = setTimeout(() => {
        setPrelude(popMotdLines());
      }, 0);

      stopCron = startBackupCron(fs);
      updateProgressFile(fs);
    })();

    return () => {
      cancelled = true;
      if (userTimer !== undefined) clearTimeout(userTimer);
      if (preludeTimer !== undefined) clearTimeout(preludeTimer);
      stopCron?.();
    };
  }, [fs]);

  // ── Register factory commands (need React callbacks) ──────────────────────
  useEffect(() => {
    registry.register(
      createVimCommand({
        onOpen: (file, location) => {
          setVimState({ file, cwd: location.cwd, home: location.home });
          setOverlayKind("vim");
        },
        onOpenPs1: () => setOverlayKind("ps1"),
      }),
    );
    registry.register(
      createMailCommand({
        onOpen: () => setOverlayKind("mail"),
      }),
    );
  }, []);

  // ── Auto-run neofetch on first load ──────────────────────────────────────
  useEffect(() => {
    if (neofetchRunRef.current) return;
    neofetchRunRef.current = true;
    const id = setTimeout(() => {
      terminalRef.current?.simulateCommand("neofetch", false);
    }, 50);
    return () => {
      neofetchRunRef.current = false;
      clearTimeout(id);
    };
  }, []);

  // ── Match shell chrome to visitor theme (default dark) ────────────────────
  useEffect(() => {
    const syncTheme = () => setVisitorTheme(resolveVisitorTheme());
    syncTheme();

    const onStorage = (e: StorageEvent) => {
      if (!e.key || THEME_STORAGE_KEYS.includes(e.key as (typeof THEME_STORAGE_KEYS)[number])) {
        syncTheme();
      }
    };

    const mediaQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: light)")
        : null;
    const onMediaChange = () => syncTheme();

    window.addEventListener("storage", onStorage);
    mediaQuery?.addEventListener?.("change", onMediaChange);

    return () => {
      window.removeEventListener("storage", onStorage);
      mediaQuery?.removeEventListener?.("change", onMediaChange);
    };
  }, []);

  // ── Overlay renders ───────────────────────────────────────────────────────
  const vimOverlay =
    overlayKind === "vim" && vimState ? (
      <VimEditor
        filePath={vimState.file}
        fs={fs}
        cwd={vimState.cwd}
        home={vimState.home}
        onQuit={() => {
          setVimState(null);
          setOverlayKind(null);
        }}
      />
    ) : overlayKind === "ps1" ? (
      <PS1Editor
        username={user.username}
        hostname="askew.sh"
        cwd={cwd}
        onApply={(ps1) => {
          setUser((u) => ({ ...u, ps1 }));
          setOverlayKind(null);
        }}
        onCancel={() => setOverlayKind(null)}
      />
    ) : overlayKind === "mail" ? (
      <MailComposer onQuit={() => setOverlayKind(null)} />
    ) : undefined;

  return (
    <div className="askew-app" data-theme={visitorTheme}>
      <div className="askew-wallpaper" />
      <div className="askew-wallpaper-vignette" />

      <div className="askew-shell">
        <Terminal
          ref={terminalRef}
          registry={registry}
          fs={fs}
          initialUser={user}
          initialCwd={DEFAULT_USER.home}
          vimOverlay={vimOverlay}
          prelude={prelude}
        />
      </div>
    </div>
  );
}
