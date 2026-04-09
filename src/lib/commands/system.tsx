// Shim: system commands have moved to src/lib/commands/system/
// This file delegates to the new module structure and re-exports public symbols.
import "./system/index";
export { getProcessList } from "./system/_processes";
export type { ProcessEntry } from "./system/_processes";
export { localStorageBytes, sessionStorageBytes } from "./system/df";
export { dirSize } from "./system/du";
export { generateProcCpuInfo } from "./system/cpuinfo";
