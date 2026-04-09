import type { Command } from "@/lib/types";
import { registry } from "@/lib/shell/registry";

// --- Helpers ---

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function formatTime(d: Date): string {
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function formatUptime(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m} min`;
}

// --- uptime ---

const uptimeCommand: Command = {
  name: "uptime",
  aliases: [],
  description: "show how long the system has been running",
  usage: "uptime",
  execute() {
    const ms = isBrowser() ? performance.now() : 0;
    const now = new Date();
    const online = isBrowser()
      ? `,  network: ${navigator.onLine ? "online" : "offline"}`
      : "";
    return {
      lines: [
        {
          content: ` ${formatTime(now)} up ${formatUptime(ms)},  1 user${online},  load average: 0.42, 0.38, 0.31`,
        },
      ],
      exitCode: 0,
    };
  },
};

// --- Register ---

registry.register(uptimeCommand);
