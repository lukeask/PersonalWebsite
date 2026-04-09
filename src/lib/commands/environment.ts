import type { Command, CommandOutput } from "@/lib/types";
import { registry } from "@/lib/shell/registry";
import { errOut } from "@/lib/util/output";

function safeLocalStorageGet(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    // silently fail (e.g. SSR)
  }
}

function safeLocalStorageRemove(key: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    // silently fail
  }
}

const ENV_LS_KEY = "askew:env";
const ALIAS_LS_KEY = "askew:aliases";

function loadPersistedEnv(): Record<string, string> {
  try {
    const raw = safeLocalStorageGet(ENV_LS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function savePersistedEnv(env: Record<string, string>): void {
  safeLocalStorageSet(ENV_LS_KEY, JSON.stringify(env));
}

function loadPersistedAliases(): Record<string, string> {
  try {
    const raw = safeLocalStorageGet(ALIAS_LS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function savePersistedAliases(aliases: Record<string, string>): void {
  safeLocalStorageSet(ALIAS_LS_KEY, JSON.stringify(aliases));
}

// --- Escape sequence processing for echo -e ---

function processEscapes(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
}

// --- echo ---

const echoCommand: Command = {
  name: "echo",
  aliases: [],
  description: "Print arguments to standard output",
  usage: "echo [-ne] [string ...]",
  execute(args, flags, _stdin, _ctx) {
    let text = args.join(" ");
    if (flags.e) text = processEscapes(text);

    if (flags.n) {
      return { lines: [{ content: text }], exitCode: 0 };
    }

    // Split on literal newlines (from -e processing)
    const segments = text.split("\n");
    return {
      lines: segments.map((s) => ({ content: s })),
      exitCode: 0,
    };
  },
};

// --- export ---

const exportCommand: Command = {
  name: "export",
  aliases: [],
  description: "Set environment variables",
  usage: "export [NAME=VALUE ...]",
  execute(args, _flags, _stdin, ctx) {
    if (args.length === 0) {
      const lines = Object.entries(ctx.env)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => ({ content: `${k}=${v}` }));
      return { lines, exitCode: 0 };
    }

    const persisted = loadPersistedEnv();
    for (const arg of args) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) {
        // export FOO — just mark as exported (no-op if already set)
        continue;
      }
      const key = arg.slice(0, eqIdx);
      const val = arg.slice(eqIdx + 1);
      ctx.setEnv(key, val);
      persisted[key] = val;
    }
    savePersistedEnv(persisted);
    return { lines: [], exitCode: 0 };
  },
};

// --- env / printenv ---

const envCommand: Command = {
  name: "env",
  aliases: ["printenv"],
  description: "Print environment variables",
  usage: "env [NAME]",
  execute(args, _flags, _stdin, ctx) {
    if (args.length > 0) {
      const val = ctx.env[args[0]];
      if (val === undefined) return { lines: [], exitCode: 1 };
      return { lines: [{ content: val }], exitCode: 0 };
    }
    const lines = Object.entries(ctx.env)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ content: `${k}=${v}` }));
    return { lines, exitCode: 0 };
  },
};

// --- alias ---

const aliasCommand: Command = {
  name: "alias",
  aliases: [],
  description: "Create or list command aliases",
  usage: "alias [name[='command']]",
  execute(args, _flags, _stdin, ctx) {
    if (args.length === 0) {
      if (Object.keys(ctx.aliases).length === 0) {
        return { lines: [{ content: "No aliases defined.", style: "dim" }], exitCode: 0 };
      }
      const lines = Object.entries(ctx.aliases)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, expansion]) => ({ content: `alias ${name}='${expansion}'` }));
      return { lines, exitCode: 0 };
    }

    const persisted = loadPersistedAliases();
    for (const arg of args) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx === -1) {
        // alias foo — show that alias
        const expansion = ctx.aliases[arg];
        if (expansion === undefined) {
          return errOut(`alias: ${arg}: not found`);
        }
        return { lines: [{ content: `alias ${arg}='${expansion}'` }], exitCode: 0 };
      }
      const name = arg.slice(0, eqIdx);
      const expansion = arg.slice(eqIdx + 1).replace(/^'(.*)'$/, "$1").replace(/^"(.*)"$/, "$1");
      ctx.addAlias(name, expansion);
      persisted[name] = expansion;
    }
    savePersistedAliases(persisted);
    return { lines: [], exitCode: 0 };
  },
};

// --- unalias ---

const unaliasCommand: Command = {
  name: "unalias",
  aliases: [],
  description: "Remove command aliases",
  usage: "unalias name [...]",
  execute(args, _flags, _stdin, ctx) {
    if (args.length === 0) {
      return errOut("unalias: usage: unalias name [name ...]");
    }
    const persisted = loadPersistedAliases();
    for (const name of args) {
      ctx.removeAlias?.(name);
      delete persisted[name];
    }
    savePersistedAliases(persisted);
    return { lines: [], exitCode: 0 };
  },
};

// --- whoami ---

const whoamiCommand: Command = {
  name: "whoami",
  aliases: [],
  description: "Print current username",
  usage: "whoami",
  execute(_args, _flags, _stdin, ctx) {
    return { lines: [{ content: ctx.user.username }], exitCode: 0 };
  },
};

// --- id ---

const idCommand: Command = {
  name: "id",
  aliases: [],
  description: "Print user identity",
  usage: "id",
  execute(_args, _flags, _stdin, ctx) {
    const { uid, username, groups } = ctx.user;
    const groupStr = groups.map((g, i) => `${i}(${g})`).join(",");
    return {
      lines: [{ content: `uid=${uid}(${username}) gid=0(${groups[0] ?? username}) groups=${groupStr}` }],
      exitCode: 0,
    };
  },
};

// --- clear ---

const clearCommand: Command = {
  name: "clear",
  aliases: [],
  description: "Clear the terminal screen",
  usage: "clear",
  execute(_args, _flags, _stdin, _ctx) {
    return { lines: [], exitCode: 0, clearScreen: true };
  },
};

// --- history ---

const historyCommand: Command = {
  name: "history",
  aliases: [],
  description: "Show command history",
  usage: "history [n]",
  execute(args, _flags, _stdin, ctx) {
    const limit = args[0] ? parseInt(args[0], 10) : NaN;
    const entries = isNaN(limit) ? ctx.history : ctx.history.slice(-limit);
    const offset = ctx.history.length - entries.length;

    if (entries.length === 0) {
      return { lines: [], exitCode: 0 };
    }

    const lines = entries.map((entry, i) => ({
      content: `  ${String(offset + i + 1).padStart(4)}  ${entry.command}`,
      clickAction: { command: entry.command },
    }));

    return { lines, exitCode: 0 };
  },
};

// --- which ---

const whichCommand: Command = {
  name: "which",
  aliases: [],
  description: "Locate a command",
  usage: "which command [...]",
  execute(args, _flags, _stdin, _ctx) {
    if (args.length === 0) {
      return errOut("which: missing argument");
    }
    const lines = [];
    let exitCode = 0;
    for (const name of args) {
      const cmd = registry.get(name);
      if (cmd) {
        lines.push({ content: `/usr/bin/${cmd.name}` });
      } else {
        lines.push({ content: `which: no ${name} in PATH`, style: "error" as const });
        exitCode = 1;
      }
    }
    return { lines, exitCode };
  },
};

// --- type ---

const typeCommand: Command = {
  name: "type",
  aliases: [],
  description: "Describe how a name would be interpreted",
  usage: "type name [...]",
  execute(args, _flags, _stdin, ctx) {
    if (args.length === 0) {
      return errOut("type: missing argument");
    }
    const lines = [];
    let exitCode = 0;
    for (const name of args) {
      if (ctx.aliases[name]) {
        lines.push({ content: `${name} is aliased to '${ctx.aliases[name]}'` });
      } else {
        const cmd = registry.get(name);
        if (cmd) {
          lines.push({ content: `${name} is a shell builtin` });
        } else {
          lines.push({ content: `${name}: not found`, style: "error" as const });
          exitCode = 1;
        }
      }
    }
    return { lines, exitCode };
  },
};

// --- help ---

const helpCommand: Command = {
  name: "help",
  aliases: ["man"],
  description: "List available commands",
  usage: "help [command]",
  execute(args, _flags, _stdin, _ctx) {
    if (args.length > 0) {
      const cmd = registry.get(args[0]);
      if (!cmd) return errOut(`help: no help entry for '${args[0]}'`);
      return {
        lines: [
          { content: cmd.name, style: "bold" },
          { content: `  ${cmd.description}` },
          { content: `  Usage: ${cmd.usage}`, style: "dim" },
        ],
        exitCode: 0,
      };
    }

    const cmds = registry.list().sort((a, b) => a.name.localeCompare(b.name));
    const lines = [
      { content: "Available commands:", style: "bold" as const },
      ...cmds.map((cmd) => ({
        content: `  ${cmd.name.padEnd(16)} ${cmd.description}`,
        clickAction: { command: `help ${cmd.name}` },
      })),
      { content: "" },
      { content: "Type 'help <command>' for usage details.", style: "dim" as const },
    ];
    return { lines, exitCode: 0 };
  },
};

// --- Register ---

registry.register(echoCommand);
registry.register(exportCommand);
registry.register(envCommand);
registry.register(aliasCommand);
registry.register(unaliasCommand);
registry.register(whoamiCommand);
registry.register(idCommand);
registry.register(clearCommand);
registry.register(historyCommand);
registry.register(whichCommand);
registry.register(typeCommand);
registry.register(helpCommand);
