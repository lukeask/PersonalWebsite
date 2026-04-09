"use client";

import { useState, useEffect } from "react";

import { getProcessList } from "@/lib/commands/system/_processes";

// --- Constants ---

const OS_NAME = "AskewOS";

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

function makeBar(fraction: number, width: number): string {
  const filled = Math.round(Math.min(1, Math.max(0, fraction)) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

// --- TopDisplay ---

export function TopDisplay({ username }: { username: string }) {
  const [tick, setTick] = useState(0);
  const [exited, setExited] = useState(false);

  // Refresh every 2s
  useEffect(() => {
    if (exited) return;
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, [exited]);

  // Capture-phase keydown: intercept q before it reaches the terminal input
  useEffect(() => {
    if (exited) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "q" || e.key === "Q") {
        e.preventDefault();
        e.stopPropagation();
        setExited(true);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [exited]);

  if (exited) {
    return <span className="text-terminal-dim">[top exited]</span>;
  }

  const cores = isBrowser() ? (navigator.hardwareConcurrency ?? 2) : 2;
  const memGiB: number = isBrowser()
    ? ((navigator as { deviceMemory?: number }).deviceMemory ?? 4)
    : 4;
  const memMiB = memGiB * 1024;

  const now = new Date();
  const uptimeMs = isBrowser() ? performance.now() : 0;

  // Sin-based jitter: deterministic per tick, smooth oscillation
  const jitter = (base: number, amplitude: number, phase: number) =>
    Math.max(0, base + amplitude * Math.sin(tick * 1.7 + phase));

  const processes = getProcessList(username);
  const animatedCpu = processes.map((p) =>
    jitter(p.cpu, Math.min(p.cpu * 0.25 + 0.1, 0.8), p.pid * 0.37),
  );

  const totalCpuPct = animatedCpu.reduce((a, b) => a + b, 0);
  const idlePct = Math.max(0, 100 - totalCpuPct / cores);
  const usedMemMiB = processes.reduce(
    (sum, p) => sum + (p.mem / 100) * memMiB,
    0,
  );
  const freeMiB = Math.max(0, memMiB - usedMemMiB);

  const load1 = ((totalCpuPct / cores / 100) * 4).toFixed(2);
  const load5 = ((totalCpuPct / cores / 100) * 3.5).toFixed(2);
  const load15 = ((totalCpuPct / cores / 100) * 3.0).toFixed(2);

  return (
    <div className="font-mono">
      {/* Summary header */}
      <div className="text-terminal-bold">
        {`${OS_NAME} - top - ${formatTime(now)}  up ${formatUptime(uptimeMs)},  1 user,  load average: ${load1}, ${load5}, ${load15}`}
      </div>
      <div>{`Tasks: ${processes.length} total,   1 running, ${processes.length - 1} sleeping,   0 stopped`}</div>
      <div>{`%Cpu(s): ${(totalCpuPct / cores).toFixed(1)} us,   0.3 sy,   0.0 ni,  ${idlePct.toFixed(1)} id,   0.0 wa`}</div>
      <div>{`MiB Mem:  ${memMiB.toFixed(1)} total,  ${freeMiB.toFixed(1)} free,  ${usedMemMiB.toFixed(1)} used`}</div>

      {/* Per-core CPU bars */}
      <div className="mt-1">
        {Array.from({ length: cores }, (_, i) => {
          const load = jitter(
            totalCpuPct / cores,
            (totalCpuPct / cores) * 0.15,
            i * 1.3,
          );
          const bar = makeBar(load / 100, 20);
          const label = `Cpu${i}`.padEnd(cores >= 10 ? 6 : 5);
          return (
            <div key={i} className="text-terminal-dim whitespace-pre">
              {`${label}: [${bar}] ${load.toFixed(1).padStart(5)}%`}
            </div>
          );
        })}
      </div>

      {/* Process table */}
      <div className="mt-1">
        <div className="text-terminal-highlight whitespace-pre">
          {"  PID USER       STAT   %CPU  %MEM       VSZ    RSS  COMMAND"}
        </div>
        {processes.map((p, i) => {
          const cpu = animatedCpu[i];
          const isActive = p.stat.startsWith("R");
          return (
            <div
              key={p.pid}
              className={`whitespace-pre ${isActive ? "text-terminal-bold" : "text-terminal-fg"}`}
            >
              {[
                String(p.pid).padStart(5),
                p.user.padEnd(10),
                p.stat.padEnd(6),
                cpu.toFixed(1).padStart(6),
                p.mem.toFixed(1).padStart(5),
                String(p.vsz).padStart(10),
                String(p.rss).padStart(6),
                " " + p.command,
              ].join(" ")}
            </div>
          );
        })}
      </div>

      <div className="text-terminal-dim mt-1">[q] quit</div>
    </div>
  );
}
