import type { Command } from "@/lib/types";
import { registry } from "@/lib/shell/registry";

// TODO T-404: import { markEggFound } from "@/lib/ctf/hints";

// --- neofetch / screenfetch ---
// TODO T-502: replace stub with <NeofetchComponent /> once T-502 ships.

const neofetchCommand: Command = {
  name: "neofetch",
  aliases: ["screenfetch"],
  description: "system information display",
  usage: "neofetch",
  execute() {
    // TODO T-404: markEggFound("neofetch");
    // TODO T-502: return ok([{ content: <NeofetchComponent user={ctx.user} /> }]);
    return { lines: [{ content: "neofetch: coming soon. (T-502 pending)", style: "dim" }], exitCode: 0 };
  },
};

// --- Register ---

registry.register(neofetchCommand);
