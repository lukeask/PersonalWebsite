// Shim: fun commands have moved to src/lib/commands/fun/
// This file delegates to the new module structure and re-exports public symbols.
import "./fun/index";
export { isForkBomb, makeForkBombOutput } from "./fun/fork-bomb";
