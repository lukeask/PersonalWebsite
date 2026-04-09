import { createElement } from "react";
import type { ReactNode } from "react";

import type { Command, CommandOutput, TerminalOutputLine } from "@/lib/types";

import { asGitFS } from "./_helpers";

// --- git status ---

export const gitStatusCommand: Command = {
  name: "git-status",
  aliases: [],
  description: "show working tree status (internal — dispatched by git)",
  usage: "git status",
  execute(_args, _flags, _stdin, ctx): CommandOutput {
    const gfs = asGitFS(ctx.fs);

    const header: TerminalOutputLine[] = [
      { content: "On branch main" },
      { content: "" },
    ];

    if (!gfs) {
      return {
        lines: [
          ...header,
          { content: "nothing to commit, working tree clean", style: "dim" },
        ],
        exitCode: 0,
      };
    }

    const modifiedPaths = gfs.getModifiedPaths();
    const tombstonedPaths = gfs.getTombstonedPaths();

    const modifiedFiles: string[] = [];
    const newFiles: string[] = [];

    for (const path of modifiedPaths) {
      if (gfs.readBase(path) !== null) {
        modifiedFiles.push(path);
      } else {
        newFiles.push(path);
      }
    }

    const deletedFiles = tombstonedPaths.filter(
      (p) => gfs.readBase(p) !== null,
    );

    if (
      modifiedFiles.length === 0 &&
      newFiles.length === 0 &&
      deletedFiles.length === 0
    ) {
      return {
        lines: [
          ...header,
          { content: "nothing to commit, working tree clean", style: "dim" },
        ],
        exitCode: 0,
      };
    }

    const lines: TerminalOutputLine[] = [
      ...header,
      { content: "Changes not staged for commit:", style: "bold" },
      {
        content: '  (use "git restore <file>..." to discard changes)',
        style: "dim",
      },
      { content: "" },
    ];

    for (const path of modifiedFiles) {
      lines.push({
        content: createElement(
          "span",
          { className: "text-terminal-error" },
          `\tmodified:   ${path}`,
        ) as ReactNode,
      });
    }
    for (const path of deletedFiles) {
      lines.push({
        content: createElement(
          "span",
          { className: "text-terminal-error" },
          `\tdeleted:    ${path}`,
        ) as ReactNode,
      });
    }

    if (newFiles.length > 0) {
      lines.push({ content: "" });
      lines.push({ content: "Untracked files:", style: "bold" });
      lines.push({
        content: '  (use "git add <file>..." to include in what will be committed)',
        style: "dim",
      });
      lines.push({ content: "" });
      for (const path of newFiles) {
        lines.push({
          content: createElement(
            "span",
            { className: "text-terminal-error" },
            `\t${path}`,
          ) as ReactNode,
        });
      }
    }

    return { lines, exitCode: 0 };
  },
};
