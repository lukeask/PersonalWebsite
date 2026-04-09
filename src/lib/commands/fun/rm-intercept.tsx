"use client";

import { useState, useEffect, useRef } from "react";

import type { Command } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { markEggFound } from "@/lib/ctf/game";

// --- rm -rf / animation ---

const FAKE_PATHS = [
  "/bin/bash",
  "/usr/lib/libc.so.6",
  "/etc/passwd",
  "/home/guest/.bashrc",
  "/var/log/syslog",
  "/usr/bin/python3",
  "/lib/x86_64-linux-gnu/libm.so.6",
  "/etc/hosts",
  "/usr/share/locale/en_US",
  "/var/cache/apt/archives",
  "/boot/grub/grub.cfg",
  "/usr/lib/gcc/x86_64-linux-gnu/11",
  "/home/guest/.ssh/id_rsa",
  "/etc/fstab",
  "/usr/lib/systemd/systemd",
];

function RmRfDisplay() {
  const [msgs, setMsgs] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const idx = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      if (idx.current >= FAKE_PATHS.length) {
        clearInterval(id);
        setDone(true);
        return;
      }
      const p = FAKE_PATHS[idx.current++];
      setMsgs((prev) => [...prev, `removing ${p}...`]);
    }, 80);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="font-mono">
      {msgs.map((m, i) => (
        <div key={i} className="text-terminal-dim">
          {m}
        </div>
      ))}
      {done && (
        <>
          <div className="text-terminal-fg">
            rm: cannot remove &apos;/&apos;: Operation not permitted
          </div>
          <div className="text-terminal-bold">
            ...just kidding. Your files are safe. (You&apos;re in a browser.)
          </div>
        </>
      )}
    </div>
  );
}

// --- rm -rf / detector ---

function isRmRfRoot(
  args: string[],
  flags: Record<string, string | boolean>,
): boolean {
  const hasRecursive = flags.r || flags.R || flags.rf || flags.fr;
  const hasForce = flags.f || flags.rf || flags.fr;
  if (!hasRecursive || !hasForce) return false;
  return args.some((a) => a === "/" || a === "/*" || a === "/.");
}

// --- rm override (intercepts rm -rf /) ---
// IMPORTANT: fun/ must be imported AFTER file-mutate.ts so the original
// rm is captured here before we overwrite it. See notes.md.

const _originalRm = registry.get("rm");

const rmOverrideCommand: Command = {
  name: "rm",
  aliases: [],
  description: _originalRm?.description ?? "remove files or directories",
  usage: _originalRm?.usage ?? "rm [-rf] <path...>",
  execute(args, flags, stdin, ctx) {
    if (isRmRfRoot(args, flags)) {
      markEggFound("rm-rf");
      return { lines: [{ content: <RmRfDisplay /> }], exitCode: 0 };
    }
    if (_originalRm) return _originalRm.execute(args, flags, stdin, ctx);
    return { lines: [{ content: "rm: not available", style: "error" }], exitCode: 1 };
  },
};

// --- Register ---

registry.register(rmOverrideCommand);   // overrides file-mutate.ts rm — import order matters
