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
import type { FileSystem, UserIdentity, TerminalOutputLine } from "@/lib/types";
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

// ─── Types ────────────────────────────────────────────────────────────────────

type VimState = { file: string } | null;
type OverlayKind = "vim" | "ps1" | "mail" | null;

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

function createFilesystem(): FileSystem {
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
  const [cwd, setCwd] = useState(DEFAULT_USER.home);
  const [prelude, setPrelude] = useState<TerminalOutputLine[]>([]);
  const neofetchRunRef = useRef(false);

  const fs = useMemo(() => createFilesystem(), []);

  // ── Initialise on mount ───────────────────────────────────────────────────
  useEffect(() => {
    initTelemetry();
    ensureGuestUser();
    const savedUser = loadCurrentUser();
    if (savedUser) setUser(savedUser);
    setPrelude(popMotdLines());

    // Start the backup cron simulation (runs every 2 minutes)
    const stopCron = startBackupCron(fs);

    // Write the initial progress file (reflects any previously saved state)
    updateProgressFile(fs);

    return () => stopCron();
  }, [fs]);

  // ── Register factory commands (need React callbacks) ──────────────────────
  useEffect(() => {
    registry.register(
      createVimCommand({
        onOpen: (file) => {
          setVimState({ file });
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Overlay renders ───────────────────────────────────────────────────────
  const vimOverlay =
    overlayKind === "vim" && vimState ? (
      <VimEditor
        filePath={vimState.file}
        fs={fs}
        cwd={cwd}
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
    <div className="h-screen w-screen bg-terminal-bg overflow-hidden">
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
  );
}
