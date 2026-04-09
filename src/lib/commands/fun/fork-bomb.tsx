// Turbopack resolves .tsx before .ts — this file re-exports from fork-bomb.ts
// so that imports of "@/lib/commands/fun/fork-bomb" work under both TypeScript
// (which prefers .ts) and Turbopack (which prefers .tsx).
export { isForkBomb, makeForkBombOutput } from "./fork-bomb.ts";
