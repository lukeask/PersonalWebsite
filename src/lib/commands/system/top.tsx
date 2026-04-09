"use client";

import type { Command } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { TopDisplay } from "@/components/TopDisplay";

// --- top / htop ---

const topCommand: Command = {
  name: "top",
  aliases: ["htop"],
  description: "display live system process information (q to exit)",
  usage: "top",
  execute(_args, _flags, _stdin, ctx) {
    return {
      lines: [{ content: <TopDisplay username={ctx.user.username} /> }],
      exitCode: 0,
    };
  },
};

// --- Register ---

registry.register(topCommand);
