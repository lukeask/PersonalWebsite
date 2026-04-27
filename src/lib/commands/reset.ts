import type { Command, CommandOutput } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { errOut } from "@/lib/util/output";
import { OverlayStorage } from "@/lib/storage/indexed";

// --- Helpers ---

function clearAskewStorage(): void {
  if (typeof localStorage !== "undefined") {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("askew:")) keysToRemove.push(k);
    }
    for (const k of keysToRemove) localStorage.removeItem(k);
  }

  if (typeof sessionStorage !== "undefined") {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith("askew:")) keysToRemove.push(k);
    }
    for (const k of keysToRemove) sessionStorage.removeItem(k);
  }
}

// --- Reset ---

const resetCommand: Command = {
  name: "reset",
  aliases: [],
  description: "wipe all user progress and settings, restoring first-visit state",
  usage: "reset [-y | --yes]",
  async execute(_args, flags, _stdin, _ctx): Promise<CommandOutput> {
    const confirmed = flags["y"] === true || flags["yes"] === true;

    if (!confirmed) {
      return {
        lines: [
          {
            content:
              "This will reset all progress, settings, and files. Are you sure? [y/N]",
          },
          { content: "" },
          {
            content: "Run 'reset -y' to confirm.",
            style: "dim",
          },
        ],
        exitCode: 0,
      };
    }

    try {
      // Wipe IndexedDB overlay filesystem
      const storage = new OverlayStorage();
      await storage.clearAll();

      // Wipe all askew:* keys from localStorage and sessionStorage
      clearAskewStorage();

      // Reload the page to restore first-visit state
      if (typeof window !== "undefined") {
        window.location.reload();
      }

      return { lines: [{ content: "Resetting..." }], exitCode: 0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errOut(`reset: ${msg}`);
    }
  },
};

// --- Register ---

registry.register(resetCommand);
