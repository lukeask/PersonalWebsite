import type { Command } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { errOut } from "@/lib/util/output";

import { gitLogCommand } from "./log";
import { gitBlameCommand } from "./blame";
import { gitDiffCommand } from "./diff";
import { gitStatusCommand } from "./status";
import { gitResetCommand } from "./reset";

// --- Fun stubs for write subcommands ---

const WRITE_SUBCOMMAND_REPLIES: Record<string, string> = {
  init: "Reinitialized existing Git repository in /site/.git/\n(Have you seen the commit history? Run: git log)",
  add: "Changes staged. You can't actually push to this repo, but it's the thought that counts.",
  commit: "On branch main\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean\n\n(psst: try git log)",
};

// --- Main git dispatcher ---

const gitCommand: Command = {
  name: "git",
  aliases: [],
  description: "the stupid content tracker",
  usage: "git <subcommand> [args]",

  async execute(args, flags, stdin, ctx) {
    const sub = args[0];

    if (!sub) {
      return {
        lines: [
          { content: "usage: git <command> [<args>]", style: "bold" },
          { content: "" },
          { content: "These are the supported git commands:" },
          { content: "   log       Show commit history" },
          { content: "   status    Show working tree status" },
          { content: "   diff      Show changes" },
          { content: "   blame     Show who wrote each line" },
          { content: "   pull      Reset overlay to base state" },
          { content: "   init      (you wish)" },
          { content: "   add       (noted, ignored)" },
          { content: "   commit    (not how this works)" },
        ],
        exitCode: 0,
      };
    }

    switch (sub) {
      case "status":
        return gitStatusCommand.execute(args.slice(1), flags, stdin, ctx);

      case "log":
        return gitLogCommand.execute(args.slice(1), flags, stdin, ctx);

      case "blame":
        return gitBlameCommand.execute(args.slice(1), flags, stdin, ctx);

      case "diff":
        return gitDiffCommand.execute(args.slice(1), flags, stdin, ctx);

      case "pull":
        return gitResetCommand.execute(args.slice(1), flags, stdin, ctx);

      case "init":
      case "add":
      case "commit": {
        const reply = WRITE_SUBCOMMAND_REPLIES[sub];
        return {
          lines: reply.split("\n").map((line) => ({ content: line })),
          exitCode: 0,
        };
      }

      default:
        return errOut(
          `git: '${sub}' is not a git command. See 'git help'.`,
        );
    }
  },
};

// --- Register ---

registry.register(gitCommand);
