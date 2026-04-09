import type { Command, TerminalOutputLine } from "@/lib/types";
import { registry } from "@/lib/shell/registry";

import { getProcessList, type ProcessEntry } from "./_processes";

// --- ps ---

const psCommand: Command = {
  name: "ps",
  aliases: [],
  description: "report process status",
  usage: "ps [aux]",
  execute(args, _flags, _stdin, ctx) {
    const processes = getProcessList(ctx.user.username);

    // Add ps itself as the last visible process
    const all: ProcessEntry[] = [
      ...processes,
      {
        pid: 999,
        user: ctx.user.username,
        cpu: 0.0,
        mem: 0.0,
        vsz: 6144,
        rss: 1024,
        stat: "R+",
        start: "now",
        command: args.length > 0 ? `ps ${args.join(" ")}` : "ps",
      },
    ];

    const header =
      "USER            PID   %CPU  %MEM       VSZ    RSS  STAT  START  COMMAND";

    const lines: TerminalOutputLine[] = [
      { content: header, style: "bold" },
      ...all.map((p) => ({
        content: [
          p.user.padEnd(15),
          String(p.pid).padStart(5),
          p.cpu.toFixed(1).padStart(6),
          p.mem.toFixed(1).padStart(5),
          String(p.vsz).padStart(10),
          String(p.rss).padStart(6),
          p.stat.padEnd(5),
          p.start.padStart(5),
          " " + p.command,
        ].join(" "),
      })),
    ];

    return { lines, exitCode: 0 };
  },
};

// --- Register ---

registry.register(psCommand);
