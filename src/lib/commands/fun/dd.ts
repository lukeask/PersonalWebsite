import type { Command } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { errOut } from "@/lib/util/output";

// TODO T-404: import { markEggFound } from "@/lib/ctf/hints";

// --- dd ---

const ddCommand: Command = {
  name: "dd",
  aliases: [],
  description: "convert and copy a file",
  usage: "dd if=<source> of=<dest>",
  execute(args) {
    // TODO T-404: markEggFound("dd");
    const of_ = args.find((a) => a.startsWith("of="))?.slice(3) ?? "";
    if (of_.startsWith("/dev/sd") || of_.startsWith("/dev/nvme") || of_.startsWith("/dev/hd")) {
      return {
        lines: [
          { content: `dd: permission denied: you can't overwrite the browser`, style: "error" },
        ],
        exitCode: 1,
      };
    }
    return errOut("dd: no input/output specified. Usage: dd if=<source> of=<dest>");
  },
};

// --- Register ---

registry.register(ddCommand);
