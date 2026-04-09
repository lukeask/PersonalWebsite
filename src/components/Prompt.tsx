"use client";

import type { ReactNode } from "react";
import type { UserIdentity } from "@/lib/types";

interface PromptProps {
  user: UserIdentity;
  cwd: string;
  hostname?: string;
}

const DEFAULT_PS1 = "\\u@\\h:\\w$ ";

const TOKEN_CLASSES: Record<string, string> = {
  u: "text-terminal-user font-bold",
  h: "text-terminal-host font-bold",
  w: "text-terminal-cwd font-bold",
  W: "text-terminal-cwd font-bold",
};

function parsePS1(
  ps1: string,
  username: string,
  hostname: string,
  cwd: string,
): ReactNode[] {
  const segments: ReactNode[] = [];
  let buffer = "";
  let key = 0;

  const flush = () => {
    if (buffer) {
      segments.push(
        <span key={key++} className="text-terminal-fg">
          {buffer}
        </span>,
      );
      buffer = "";
    }
  };

  let i = 0;
  while (i < ps1.length) {
    if (ps1[i] === "\\" && i + 1 < ps1.length) {
      const code = ps1[i + 1];
      const cls = TOKEN_CLASSES[code];

      if (cls) {
        flush();
        const values: Record<string, string> = {
          u: username,
          h: hostname,
          w: cwd,
          W: cwd.split("/").pop() || cwd,
        };
        segments.push(
          <span key={key++} className={cls}>
            {values[code]}
          </span>,
        );
        i += 2;
      } else if (code === "\\") {
        buffer += "\\";
        i += 2;
      } else {
        buffer += code;
        i += 2;
      }
    } else {
      buffer += ps1[i];
      i++;
    }
  }
  flush();

  return segments;
}

export function Prompt({ user, cwd, hostname = "askew.sh" }: PromptProps) {
  const displayCwd = cwd.startsWith(user.home)
    ? "~" + cwd.slice(user.home.length)
    : cwd;

  const ps1 = user.ps1 || DEFAULT_PS1;

  return (
    <span className="whitespace-pre">
      {parsePS1(ps1, user.username, hostname, displayCwd)}
    </span>
  );
}
