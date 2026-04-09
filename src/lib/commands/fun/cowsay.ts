import type { Command, TerminalOutputLine } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { markEggFound } from "@/lib/ctf/game";
import { errOut } from "@/lib/util/output";

// --- Helpers ---

function txt(content: string): TerminalOutputLine {
  return { content };
}

const COW_BODY = [
  "        \\   ^__^",
  "         \\  (oo)\\_______",
  "            (__)\\       )\\/\\",
  "                ||----w |",
  "                ||     ||",
];

function buildCowsay(message: string): TerminalOutputLine[] {
  const MAX_W = 40;
  const words = message.split(" ");
  const wrapped: string[] = [];
  let cur = "";
  for (const word of words) {
    if (cur && cur.length + 1 + word.length > MAX_W) {
      wrapped.push(cur);
      cur = word;
    } else {
      cur = cur ? `${cur} ${word}` : word;
    }
  }
  if (cur) wrapped.push(cur);

  const w = Math.max(...wrapped.map((l) => l.length));
  const border = " " + "_".repeat(w + 2);
  const borderB = " " + "-".repeat(w + 2);

  const bubble: string[] = [border];
  if (wrapped.length === 1) {
    bubble.push(`< ${wrapped[0].padEnd(w)} >`);
  } else {
    wrapped.forEach((l, i) => {
      const p = l.padEnd(w);
      if (i === 0) bubble.push(`/ ${p} \\`);
      else if (i === wrapped.length - 1) bubble.push(`\\ ${p} /`);
      else bubble.push(`| ${p} |`);
    });
  }
  bubble.push(borderB);

  return [...bubble, ...COW_BODY].map(txt);
}

// --- cowsay ---

const cowsayCommand: Command = {
  name: "cowsay",
  aliases: [],
  description: "ASCII cow with speech bubble",
  usage: "cowsay <message>",
  execute(args, _flags, stdin) {
    markEggFound("cowsay");
    const message = args.length > 0 ? args.join(" ") : (stdin ?? "");
    if (!message.trim()) return errOut("cowsay: usage: cowsay <message>");
    return { lines: buildCowsay(message), exitCode: 0 };
  },
};

// --- Register ---

registry.register(cowsayCommand);
