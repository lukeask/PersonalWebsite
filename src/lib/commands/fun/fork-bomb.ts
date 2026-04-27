import React from "react";

import type { CommandOutput } from "@/lib/types";
import { markEggFound } from "@/lib/ctf/game";
import { ForkBombDisplay } from "./fork-bomb-display";

// ─── Fork bomb detector ───────────────────────────────────────────────────────
// Export this so executor.ts can call it on raw input BEFORE parsing.
// See notes.md — executor.ts must add a pre-parse check for this.

export function isForkBomb(rawInput: string): boolean {
  return /:\s*\(\s*\)\s*\{/.test(rawInput);
}

// ─── Fork bomb output ─────────────────────────────────────────────────────────

export function makeForkBombOutput(): CommandOutput {
  markEggFound("fork-bomb");
  return {
    lines: [{ content: React.createElement(ForkBombDisplay) }],
    exitCode: 0,
  };
}
