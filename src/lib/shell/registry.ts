import type { Command, CommandRegistry } from "@/lib/types";

export class CommandRegistryImpl implements CommandRegistry {
  private commands = new Map<string, Command>();
  private aliasMap = new Map<string, string>();

  register(cmd: Command): void {
    if (this.commands.has(cmd.name)) {
      console.warn(
        `[registry] '${cmd.name}' was already registered; overwriting.`,
      );
    }
    this.commands.set(cmd.name, cmd);
    for (const alias of cmd.aliases) {
      if (this.aliasMap.has(alias)) {
        const prev = this.aliasMap.get(alias);
        console.warn(
          `[registry] alias '${alias}' was already registered (→ '${prev}'); overwriting (→ '${cmd.name}').`,
        );
      }
      this.aliasMap.set(alias, cmd.name);
    }
  }

  get(name: string): Command | undefined {
    const direct = this.commands.get(name);
    if (direct) return direct;
    const canonical = this.aliasMap.get(name);
    return canonical ? this.commands.get(canonical) : undefined;
  }

  list(): Command[] {
    return Array.from(this.commands.values());
  }

  getCompletions(partial: string): string[] {
    const matches = new Set<string>();
    for (const name of this.commands.keys()) {
      if (name.startsWith(partial)) matches.add(name);
    }
    for (const alias of this.aliasMap.keys()) {
      if (alias.startsWith(partial)) matches.add(alias);
    }
    return Array.from(matches).sort();
  }
}

export const registry = new CommandRegistryImpl();
