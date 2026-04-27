// shell-builtins.ts — small fun shell-builtin stubs: :, kill, exit, emacs, nano

import type { Command } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { markEggFound } from "@/lib/ctf/game";

// --- : (colon / no-op) ---
// Registers ':' as bash's no-op builtin.
// The fork bomb animation fires when executor.ts detects isForkBomb(rawInput).
// See notes.md for the executor.ts hook requirement.

const colonCommand: Command = {
  name: ":",
  aliases: [],
  description: "no-op (always succeeds)",
  usage: ":",
  execute() {
    return { lines: [], exitCode: 0 };
  },
};

// --- kill ---

const killCommand: Command = {
  name: "kill",
  aliases: [],
  description: "send a signal to a process",
  usage: "kill [-9] <pid>",
  execute(args, flags) {
    // TODO T-404: markEggFound("kill");
    const signal = flags[9] || flags.s === "9" || flags.KILL;
    const target = args[0];
    const isSelf = !target || target === "$$" || target === "1" || target === "0";
    if (signal && isSelf) {
      return {
        lines: [
          { content: "kill: (browser): Operation not permitted" },
          { content: "This tab is unkillable. It has achieved enlightenment.", style: "dim" },
        ],
        exitCode: 0,
      };
    }
    if (signal) {
      return {
        lines: [
          { content: "kill: (browser): Operation not permitted" },
          { content: "You can't kill what has no PID.", style: "dim" },
        ],
        exitCode: 0,
      };
    }
    return { lines: [{ content: "kill: usage: kill [-9] <pid>", style: "error" }], exitCode: 1 };
  },
};

// --- exit ---

const exitCommand: Command = {
  name: "exit",
  aliases: [],
  description: "exit the shell",
  usage: "exit",
  execute(_args, _flags, _stdin, ctx) {
    markEggFound("exit");
    const name = ctx.user.username;
    return {
      lines: [
        { content: `I'm sorry, ${name}. I'm afraid I can't do that.` },
        { content: "There is no exit. There is only askew.sh.", style: "dim" },
      ],
      exitCode: 0,
    };
  },
};

// --- emacs ---

const emacsCommand: Command = {
  name: "emacs",
  aliases: [],
  description: "text editor",
  usage: "emacs [file]",
  execute() {
    markEggFound("emacs");
    return {
      lines: [
        { content: "emacs: command not found. This is a vim household.", style: "error" },
        { content: "Try 'vim'.", style: "dim" },
      ],
      exitCode: 0,
    };
  },
};

// --- nano ---

const nanoCommand: Command = {
  name: "nano",
  aliases: [],
  description: "text editor",
  usage: "nano [file]",
  execute() {
    markEggFound("nano");
    return {
      lines: [
        { content: "nano: command not found" },
        { content: "Have you tried vim? Run vim /usr/share/vim/vimtutor.txt to get started.", style: "dim" },
      ],
      exitCode: 0,
    };
  },
};

// --- Register ---

registry.register(colonCommand);
registry.register(killCommand);
registry.register(exitCommand);
registry.register(emacsCommand);
registry.register(nanoCommand);
