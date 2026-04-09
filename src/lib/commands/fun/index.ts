import "./cowsay";
import "./figlet";
import "./make";
import "./dd";
import "./rm-intercept";
import "./fork-bomb";
import "./shell-builtins";
import "./python";
import "./neofetch-stub";

// Re-export fork-bomb helpers for executor.ts
export { isForkBomb, makeForkBombOutput } from "./fork-bomb";
