<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:command-style-guide -->
# Command Module Style Guide

Every agent or contributor writing a new shell command or touching an existing one **must** follow this guide. Tickets that implement commands should cite this guide explicitly.

---

## File layout

One command per file. Closely related, trivially small commands (e.g. `cd` and `pwd`) may share a file if the combined file stays well under 200 lines. When in doubt, split.

File path: `src/lib/commands/<domain>/<command-name>.ts` (`.tsx` only if the command renders JSX output).

If a domain has multiple commands, collect them under a directory with an `index.ts` that imports and registers all of them — the index does nothing else. No logic in the index.

```
src/lib/commands/
  navigation/
    ls.ts
    cd.ts
    tree.ts
    index.ts        ← imports all, calls registry.register(), nothing else
  git/
    log.ts
    blame.ts
    diff.ts
    index.ts
```

If there is only one command in a domain (or it has no natural grouping), a flat file `src/lib/commands/<command-name>.ts` is fine.

---

## Import order

Imports must appear in this exact order, separated by blank lines between groups:

```typescript
// 1. React — only if this file renders JSX
import { createElement } from "react";
import type { ReactNode } from "react";

// 2. Type-only imports from @/lib/types — always `import type`
import type { Command, CommandOutput, CommandContext, TerminalOutputLine } from "@/lib/types";

// 3. Registry — only if this file self-registers
import { registry } from "@/lib/shell/registry";

// 4. Shared utilities
import { resolvePath, joinPath } from "@/lib/util/paths";
import { errOut } from "@/lib/util/output";

// 5. Other internal imports (storage, telemetry, etc.)
import { loadSomething } from "@/lib/storage/indexed";
```

Rules:
- **Always `import type`** for anything that is only a type — no value is emitted at runtime.
- **No default imports** from internal modules. Use named imports only.
- **No barrel re-exports** that obscure what you're actually importing. Import directly from the defining file.
- React is only imported if the command's `execute` returns JSX in a `TerminalOutputLine`. If output is plain strings, `.ts` and no React import.

---

## Module structure

Every command module follows this section layout, using `// ---` separator comments:

```typescript
// [imports]

// --- Helpers ---
// Private pure functions used by commands in this file only.
// errOut is NOT redefined here — import it from @/lib/util/output.

// --- <Command Name> ---
const xyzCommand: Command = { ... };

// --- Register ---
registry.register(xyzCommand);
```

No code outside these sections. No module-level side effects other than the `registry.register()` calls at the bottom.

---

## Command object

```typescript
const xyzCommand: Command = {
  name: "xyz",
  aliases: [],                        // empty array, not omitted
  description: "Short phrase, no period, no capital",
  usage: "xyz [-f] [--flag] <arg> [optional]",
  execute(args, flags, _stdin, ctx) {
    // ...
    return { lines: [...], exitCode: 0 };
  },
};
```

- **Name prefix**: variable name is always `<commandName>Command` (camelCase + "Command"). e.g. `lsCommand`, `gitLogCommand`.
- **`description`**: fragment, no period, lowercase first word. Shows in `help`.
- **`usage`**: follows POSIX flag convention. Required args in `<angle>`, optional in `[brackets]`, flags with `-` or `--`.
- **Unused `execute` params**: prefix with `_`. e.g. `_stdin`, `_flags`, `_args`, `_ctx`.
- **No `async` unless the command genuinely awaits something**. Most commands are synchronous; `async` adds overhead and signals IO to the reader.

---

## The `execute` function

```typescript
execute(args, flags, _stdin, ctx): CommandOutput {
  // 1. Validate args/flags first, return errOut early on bad input
  if (args.length === 0) return errOut("xyz: missing operand");

  // 2. Resolve paths using the shared utility — always pass ctx.user.home
  const target = resolvePath(args[0], ctx.cwd, ctx.user.home);

  // 3. Do the work

  // 4. Return output
  return { lines: [{ content: "..." }], exitCode: 0 };
}
```

- **Validate early, return early.** No deeply nested conditionals.
- **Always pass `ctx.user.home`** to `resolvePath` — never hardcode `/home/guest`.
- **exitCode**: `0` = success, `1` = general error. Mirror POSIX conventions.
- **Error messages**: follow the pattern `"commandname: what went wrong"`. The command name prefix is load-bearing — it tells the user which command failed in a pipeline.
- **`clearScreen: true`** only for commands that genuinely replace the terminal output (e.g. `clear`).

---

## Error output

Do not define `errOut` locally. Import it:

```typescript
import { errOut } from "@/lib/util/output";
```

`errOut(msg: string): CommandOutput` — returns `{ lines: [{ content: msg, style: "error" }], exitCode: 1 }`.

That is the only error helper you need. Do not invent `err()`, `errorOut()`, `errorOutput()`, or any variant.

---

## Path utilities

Do not implement path resolution locally. Import from `@/lib/util/paths`:

```typescript
import { resolvePath, joinPath } from "@/lib/util/paths";

// Resolve a user-supplied path (tilde, .., relative) to an absolute path:
const abs = resolvePath(args[0], ctx.cwd, ctx.user.home);

// Join a directory and a bare name into a path:
const child = joinPath(dir, entry);   // e.g. joinPath("/home/guest", "foo") → "/home/guest/foo"
```

---

## Factory commands (commands that need callbacks)

Some commands cannot self-register because they need a callback wired in from the page layer (e.g. `mail`, `vim`). These follow the factory pattern:

```typescript
// Does NOT import registry. Does NOT call registry.register().
export function createXyzCommand(opts: { onSomething: () => void }): Command {
  return {
    name: "xyz",
    // ...
    execute(args, flags, _stdin, _ctx) {
      opts.onSomething();
      return { lines: [], exitCode: 0 };
    },
  };
}
```

The page wiring code is responsible for calling `registry.register(createXyzCommand({ ... }))`.

---

## What NOT to do

- **Do not hardcode `/home/guest`** anywhere. Use `ctx.user.home`.
- **Do not define `errOut` or any error helper locally.** Import from `@/lib/util/output`.
- **Do not implement `resolvePath` or path joining locally.** Import from `@/lib/util/paths`.
- **Do not implement `globToRegex` locally.** Import from `@/lib/util/glob`.
- **Do not use `as unknown as T` double casts.** If a type assertion is needed, use a runtime type guard function.
- **Do not add `async` to `execute` if no `await` is used inside it.**
- **Do not export command objects** (`lsCommand` etc.) — they are private to the module. Only register them. The exception is factory functions (`createXyzCommand`) which must be exported for the page layer to call.
- **Do not put React components in command files** unless the component is trivially small and only used by that command. Substantial components belong in `src/components/` or a dedicated file.
<!-- END:command-style-guide -->
