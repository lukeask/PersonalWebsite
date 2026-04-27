import type { Command, TerminalOutputLine } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { markEggFound } from "@/lib/ctf/game";

// --- make ---

const COFFEE_ART = [
  "    ) ) )",
  "   ( ( ( ",
  " .--------.",
  " |        |]",
  " |  COFFEE |",
  " `--------'",
  " Here's your coffee. You've earned it.",
];

function txt(content: string): TerminalOutputLine {
  return { content };
}

const makeCommand: Command = {
  name: "make",
  aliases: [],
  description: "build automation",
  usage: "make [target]",
  execute(args) {
    const target = args[0];
    if (!target) {
      return {
        lines: [
          txt("make: *** No targets specified.  Stop."),
          { content: "(Try 'make coffee')", style: "dim" },
        ],
        exitCode: 0,
      };
    }
    switch (target) {
      case "coffee":
        markEggFound("make-coffee");
        return { lines: COFFEE_ART.map(txt), exitCode: 0 };
      case "love":
        return {
          lines: [
            txt("make: *** No rule to make target 'love'.  Stop."),
            { content: "Have you tried 'make coffee' first?", style: "dim" },
          ],
          exitCode: 0,
        };
      case "install":
        return { lines: [txt("make: nothing to install. This is a website.")], exitCode: 0 };
      default:
        return {
          lines: [
            { content: `make: *** No rule to make target '${target}'.  Stop.`, style: "error" },
          ],
          exitCode: 0,
        };
    }
  },
};

// --- Register ---

registry.register(makeCommand);
