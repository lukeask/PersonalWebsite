import type { Command } from "@/lib/types";
import { registry } from "@/lib/shell/registry";

// --- Helpers ---

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)}M`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;
}

export function localStorageBytes(): number {
  if (!isBrowser()) return 0;
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? "";
      const val = localStorage.getItem(key) ?? "";
      total += (key.length + val.length) * 2; // UTF-16
    }
    return total;
  } catch {
    return 0;
  }
}

export function sessionStorageBytes(): number {
  if (!isBrowser()) return 0;
  try {
    let total = 0;
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i) ?? "";
      const val = sessionStorage.getItem(key) ?? "";
      total += (key.length + val.length) * 2; // UTF-16
    }
    return total;
  } catch {
    return 0;
  }
}

// --- df ---

const dfCommand: Command = {
  name: "df",
  aliases: [],
  description: "report disk space usage",
  usage: "df [-h]",
  async execute(_args, flags) {
    const human = !!flags.h;
    const fmt = (n: number) =>
      (human ? humanSize(n) : String(n)).padStart(9);
    const pct = (used: number, total: number) =>
      (total > 0 ? `${Math.round((used / total) * 100)}%` : "0%").padStart(4);

    // IndexedDB — real quota from browser storage API
    let idbUsed = 0;
    let idbQuota = 10 * 1024 * 1024; // 10 MiB fallback
    if (isBrowser() && navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        idbUsed = est.usage ?? 0;
        idbQuota = est.quota ?? idbQuota;
      } catch {
        /* use fallback */
      }
    }

    const lsUsed = localStorageBytes();
    const lsTotal = 5 * 1024 * 1024; // localStorage browser cap ~5 MiB
    const ssUsed = sessionStorageBytes();
    const ssTotal = 10 * 1024 * 1024;

    const row = (
      filesystem: string,
      total: number,
      used: number,
      mount: string,
    ) =>
      `${filesystem.padEnd(18)} ${fmt(total)} ${fmt(used)} ${fmt(Math.max(0, total - used))} ${pct(used, total)}  ${mount}`;

    return {
      lines: [
        {
          content: "Filesystem            Size      Used     Avail  Use%  Mounted on",
          style: "bold",
        },
        { content: row("overlay (idb)", idbQuota, idbUsed, "/") },
        { content: row("localStorage", lsTotal, lsUsed, "/local") },
        { content: row("sessionStorage", ssTotal, ssUsed, "/tmp") },
      ],
      exitCode: 0,
    };
  },
};

// --- Register ---

registry.register(dfCommand);
