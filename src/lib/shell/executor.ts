import type { CommandContext, CommandOutput } from "@/lib/types";
import { parse } from "./parser";
import type { ParsedCommand, ChainEntry } from "./parser";
import { registry } from "./registry";
import { trackCommand } from "@/lib/telemetry/client";
import { isForkBomb, makeForkBombOutput } from "@/lib/commands/fun/fork-bomb";
import { updateProgressFile } from "@/lib/ctf/game";

// --- Helpers ---

function errorOutput(message: string): CommandOutput {
  return {
    lines: [{ content: message, style: "error" }],
    exitCode: 1,
  };
}

function stdinFromOutput(output: CommandOutput): string {
  return output.lines
    .map((l) => (typeof l.content === "string" ? l.content : ""))
    .join("\n");
}

// --- Single Command Execution ---

export async function executeCommand(
  parsed: ParsedCommand,
  ctx: CommandContext,
  stdin: string | null = null,
  isSudo = false,
): Promise<CommandOutput> {
  if (!parsed.name) {
    return { lines: [], exitCode: 0 };
  }

  if (parsed.name === "sudo") {
    const [, ...rest] = [parsed.name, ...parsed.args];
    if (rest.length === 0) {
      return errorOutput("sudo: no command specified");
    }
    const subParsed: ParsedCommand = {
      name: rest[0],
      args: rest.slice(1),
      flags: parsed.flags,
    };
    return executeCommand(subParsed, ctx, stdin, true);
  }

  const cmd = registry.get(parsed.name);

  if (!cmd) {
    return errorOutput(
      `command not found: ${parsed.name}. Type 'help' for available commands.`,
    );
  }

  if (isSudo) {
    return {
      lines: [
        {
          content: `${ctx.user.username} is not in the sudoers file. This incident will be reported.`,
          style: "error",
        },
        {
          content: "Perhaps there's another way to gain access...",
          style: "dim",
        },
      ],
      exitCode: 1,
    };
  }

  try {
    return await cmd.execute(parsed.args, parsed.flags, stdin, ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorOutput(`${parsed.name}: ${message}`);
  }
}

// --- Pipeline Execution ---

export async function executePipeline(
  stages: ParsedCommand[],
  ctx: CommandContext,
): Promise<CommandOutput> {
  if (stages.length === 0) {
    return { lines: [], exitCode: 0 };
  }

  let output = await executeCommand(stages[0], ctx, null);

  for (let i = 1; i < stages.length; i++) {
    const stdin = stdinFromOutput(output);
    output = await executeCommand(stages[i], ctx, stdin);
  }

  return output;
}

// --- Chain Execution ---

export async function executeChain(
  chains: ChainEntry[],
  ctx: CommandContext,
): Promise<CommandOutput> {
  let output: CommandOutput = { lines: [], exitCode: 0 };

  for (const entry of chains) {
    output = await executePipeline(entry.pipeline, ctx);

    if (entry.operator === "&&" && output.exitCode !== 0) {
      break;
    }
    // ";" always continues — no special handling needed
  }

  return output;
}

// --- Top-level Entry Point ---

export async function execute(
  rawInput: string,
  ctx: CommandContext,
): Promise<CommandOutput> {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { lines: [], exitCode: 0 };
  }

  // Fork bomb pre-parse check (must run before parse() so the shell syntax
  // doesn't cause a parse error instead of the fun animation)
  if (isForkBomb(trimmed)) {
    ctx.history.push({ command: trimmed, timestamp: Date.now() });
    return makeForkBombOutput();
  }

  // Record in history before executing
  ctx.history.push({ command: trimmed, timestamp: Date.now() });

  let chains: ChainEntry[];
  try {
    chains = parse(trimmed, ctx.env, ctx.history);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorOutput(`parse error: ${message}`);
  }

  const result = await executeChain(chains, ctx);

  // Track after execution (fire-and-forget; does not affect output)
  trackCommand(trimmed, ctx.env);

  // Regenerate progress.md after every command so it reflects the latest state
  updateProgressFile(ctx.fs);

  return result;
}
