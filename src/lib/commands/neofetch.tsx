"use client";

import type { Command, TerminalOutputLine } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { Neofetch } from "@/components/Neofetch";

// ─── MOTD (first-visit message) ──────────────────────────────────────────────

const MOTD_STORAGE_KEY = "askew:motd-seen";

/**
 * Returns MOTD lines to display before the neofetch prompt.
 * The privacy notice always appears. The "Try 'help'" hint is shown only on
 * the first visit (tracked via localStorage).
 * Safe to call during SSR — returns [] when window is unavailable.
 * Exported so page.tsx can show these lines *before* the neofetch prompt.
 */
export function popMotdLines(): TerminalOutputLine[] {
  if (typeof window === "undefined") return [];

  // Check if the user has already opted out of telemetry
  let dntActive = false;
  try {
    const envRaw = localStorage.getItem("askew:env");
    if (envRaw) {
      const env = JSON.parse(envRaw) as Record<string, string>;
      dntActive = env.DO_NOT_TRACK === "1";
    }
  } catch {
    // ignore
  }

  const privacyLine: TerminalOutputLine = {
    content: dntActive ? (
      <span className="text-terminal-dim">
        {"System logs are inactive. See /var/log/privacy.md for details."}
      </span>
    ) : (
      <span className="text-terminal-dim">
        {"System logs are active. See /var/log/privacy.md for details. Run "}
        <span
          className="text-terminal-link underline cursor-pointer hover:bg-terminal-selection/30"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("terminal:simulate-command", {
                detail: { command: "export DO_NOT_TRACK=1" },
              }),
            )
          }
        >
          export DO_NOT_TRACK=1
        </span>
        {" to opt out."}
      </span>
    ),
  };

  let isFirstVisit = false;
  try {
    if (localStorage.getItem(MOTD_STORAGE_KEY) !== "1") {
      localStorage.setItem(MOTD_STORAGE_KEY, "1");
      isFirstVisit = true;
    }
  } catch {
    // localStorage unavailable — treat as first visit so the hint is shown
    isFirstVisit = true;
  }

  if (isFirstVisit) {
    return [
      { content: "Try 'help' to see available commands.", style: "dim" },
      privacyLine,
      { content: "" },
    ];
  }

  return [privacyLine, { content: "" }];
}

// ─── Neofetch wrapper ────────────────────────────────────────────────────────
// The Neofetch component needs to trigger commands in the Terminal when nav
// items are clicked. Since the component is rendered as ReactNode content
// inside TerminalOutputRenderer (which doesn't forward onClickAction into
// child components), we use a custom DOM event that Terminal listens for.

function NeofetchWrapper() {
  const handleNavigate = (command: string) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("terminal:simulate-command", {
          detail: { command },
        }),
      );
    }
  };

  return <Neofetch onNavigate={handleNavigate} />;
}

// ─── Command ─────────────────────────────────────────────────────────────────

const neofetchCommand: Command = {
  name: "neofetch",
  aliases: ["screenfetch"],
  description: "Display system information with ASCII art",
  usage: "neofetch",
  execute(_args, _flags, _stdin, _ctx) {
    const lines: TerminalOutputLine[] = [{ content: <NeofetchWrapper /> }];

    return { lines, exitCode: 0 };
  },
};

registry.register(neofetchCommand);

export { neofetchCommand };
