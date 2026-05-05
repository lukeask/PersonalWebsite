import type { FileSystem, HistoryEntry } from "@/lib/types";

// --- Parser Types ---

export interface Token {
  type: "word" | "pipe" | "and" | "semi";
  value: string;
}

export interface ParsedCommand {
  name: string;
  args: string[];
  flags: Record<string, string | boolean>;
}

export interface ChainEntry {
  pipeline: ParsedCommand[];
  operator: "&&" | ";" | null;
}

const SHORT_VALUE_FLAGS: Record<string, Set<string>> = {
  head: new Set(["n"]),
  tail: new Set(["n"]),
  tree: new Set(["L"]),
  tar: new Set(["f"]),
  openssl: new Set(["k"]),
  kill: new Set(["s"]),
};

// --- Arithmetic Evaluator ---

function evaluateArithmetic(
  expr: string,
  env: Record<string, string>,
): number {
  const expanded = expr
    .replace(
      /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
      (_, name) => env[name] ?? "0",
    )
    .replace(
      /\$([a-zA-Z_][a-zA-Z0-9_]*)/g,
      (_, name) => env[name] ?? "0",
    );

  const tokens = expanded.match(/\d+|[+\-*/%()]/g);
  if (!tokens) return 0;

  let pos = 0;

  function parseExpr(): number {
    let left = parseTerm();
    while (
      pos < tokens!.length &&
      (tokens![pos] === "+" || tokens![pos] === "-")
    ) {
      const op = tokens![pos++];
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (
      pos < tokens!.length &&
      (tokens![pos] === "*" || tokens![pos] === "/" || tokens![pos] === "%")
    ) {
      const op = tokens![pos++];
      const right = parseFactor();
      if (op === "*") left *= right;
      else if (op === "/") left = Math.trunc(left / right);
      else left %= right;
    }
    return left;
  }

  function parseFactor(): number {
    if (tokens![pos] === "(") {
      pos++;
      const val = parseExpr();
      pos++;
      return val;
    }
    if (tokens![pos] === "-") {
      pos++;
      return -parseFactor();
    }
    return parseInt(tokens![pos++], 10);
  }

  return parseExpr();
}

// --- Dollar / Variable Expansion ---

function expandDollar(
  input: string,
  pos: number,
  env: Record<string, string>,
): { value: string; end: number } {
  if (input[pos + 1] === "(" && input[pos + 2] === "(") {
    let depth = 2;
    let end = pos + 3;
    while (end < input.length && depth > 0) {
      if (input[end] === "(") depth++;
      else if (input[end] === ")") depth--;
      end++;
    }
    const expr = input.slice(pos + 3, end - 2);
    try {
      return { value: String(evaluateArithmetic(expr, env)), end };
    } catch {
      return { value: "", end };
    }
  }

  if (input[pos + 1] === "{") {
    const closeBrace = input.indexOf("}", pos + 2);
    if (closeBrace === -1) return { value: "$", end: pos + 1 };
    const varName = input.slice(pos + 2, closeBrace);
    return { value: env[varName] ?? "", end: closeBrace + 1 };
  }

  let end = pos + 1;
  while (end < input.length && /[a-zA-Z0-9_]/.test(input[end])) {
    end++;
  }
  if (end === pos + 1) return { value: "$", end: pos + 1 };
  const varName = input.slice(pos + 1, end);
  return { value: env[varName] ?? "", end };
}

// --- Tokenizer ---

export function tokenize(
  input: string,
  env: Record<string, string>,
): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    if (input[i] === " " || input[i] === "\t") {
      i++;
      continue;
    }

    if (input[i] === "|") {
      tokens.push({ type: "pipe", value: "|" });
      i++;
      continue;
    }

    if (input[i] === "&" && input[i + 1] === "&") {
      tokens.push({ type: "and", value: "&&" });
      i += 2;
      continue;
    }

    if (input[i] === ";") {
      tokens.push({ type: "semi", value: ";" });
      i++;
      continue;
    }

    let word = "";
    let isStart = true;
    let hasQuotes = false;

    while (i < input.length) {
      const ch = input[i];

      if (ch === " " || ch === "\t") break;
      if (ch === "|" || ch === ";") break;
      if (ch === "&" && input[i + 1] === "&") break;

      if (ch === "\\" && i + 1 < input.length) {
        i++;
        word += input[i];
        i++;
        isStart = false;
        continue;
      }

      if (ch === "'") {
        hasQuotes = true;
        i++;
        while (i < input.length && input[i] !== "'") {
          word += input[i];
          i++;
        }
        if (i < input.length) i++;
        isStart = false;
        continue;
      }

      if (ch === '"') {
        hasQuotes = true;
        i++;
        while (i < input.length && input[i] !== '"') {
          if (input[i] === "\\" && i + 1 < input.length) {
            const next = input[i + 1];
            if (next === '"' || next === "\\" || next === "$" || next === "`") {
              word += next;
              i += 2;
              continue;
            }
          }
          if (input[i] === "$") {
            const { value, end } = expandDollar(input, i, env);
            word += value;
            i = end;
            continue;
          }
          word += input[i];
          i++;
        }
        if (i < input.length) i++;
        isStart = false;
        continue;
      }

      if (ch === "$") {
        const { value, end } = expandDollar(input, i, env);
        word += value;
        i = end;
        isStart = false;
        continue;
      }

      if (ch === "~" && isStart) {
        const next = i + 1 < input.length ? input[i + 1] : undefined;
        if (
          !next ||
          next === "/" ||
          next === " " ||
          next === "\t" ||
          next === "|" ||
          next === ";" ||
          next === "&"
        ) {
          word += env["HOME"] ?? "/home/guest";
          i++;
          isStart = false;
          continue;
        }
      }

      word += ch;
      i++;
      isStart = false;
    }

    if (word !== "" || hasQuotes) {
      tokens.push({ type: "word", value: word });
    }
  }

  return tokens;
}

// --- Pipeline Parser ---

export function parsePipeline(tokens: Token[]): Token[][] {
  const stages: Token[][] = [];
  let current: Token[] = [];

  for (const token of tokens) {
    if (token.type === "pipe") {
      stages.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0 || stages.length > 0) {
    stages.push(current);
  }

  return stages;
}

// --- Command Parser ---

export function parseCommand(tokens: Token[]): ParsedCommand {
  const words = tokens.filter((t) => t.type === "word").map((t) => t.value);
  if (words.length === 0) {
    return { name: "", args: [], flags: {} };
  }

  const name = words[0];
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const valueFlags = SHORT_VALUE_FLAGS[name] ?? new Set<string>();

  let i = 1;
  while (i < words.length) {
    const w = words[i];

    if (w === "--") {
      args.push(...words.slice(i + 1));
      break;
    }

    if (w.startsWith("--")) {
      const eqIdx = w.indexOf("=");
      if (eqIdx !== -1) {
        flags[w.slice(2, eqIdx)] = w.slice(eqIdx + 1);
      } else {
        flags[w.slice(2)] = true;
      }
    } else if (w.startsWith("-") && w.length > 1) {
      const flagStr = w.slice(1);
      if (flagStr.length === 1) {
        if (
          valueFlags.has(flagStr) &&
          i + 1 < words.length &&
          !words[i + 1].startsWith("-")
        ) {
          flags[flagStr] = words[i + 1];
          i++;
        } else {
          flags[flagStr] = true;
        }
      } else {
        for (const ch of flagStr) {
          flags[ch] = true;
        }
      }
    } else {
      args.push(w);
    }
    i++;
  }

  return { name, args, flags };
}

// --- Chain Parser ---

export function parseChain(
  input: string,
  env: Record<string, string>,
): ChainEntry[] {
  const tokens = tokenize(input, env);
  const entries: ChainEntry[] = [];
  let current: Token[] = [];

  for (const token of tokens) {
    if (token.type === "and" || token.type === "semi") {
      const stages = parsePipeline(current);
      entries.push({
        pipeline: stages.map((s) => parseCommand(s)),
        operator: token.type === "and" ? "&&" : ";",
      });
      current = [];
    } else {
      current.push(token);
    }
  }

  if (current.length > 0) {
    const stages = parsePipeline(current);
    entries.push({
      pipeline: stages.map((s) => parseCommand(s)),
      operator: null,
    });
  }

  return entries;
}

// --- History Expansion ---

export function expandHistory(
  input: string,
  history: HistoryEntry[],
): string {
  if (!input.includes("!") || history.length === 0) return input;

  let result = "";
  let i = 0;

  while (i < input.length) {
    if (input[i] === "!" && i + 1 < input.length) {
      if (input[i + 1] === "!") {
        result += history[history.length - 1].command;
        i += 2;
        continue;
      }

      if (input[i + 1] === "-" && i + 2 < input.length && /\d/.test(input[i + 2])) {
        let numStr = "";
        let j = i + 2;
        while (j < input.length && /\d/.test(input[j])) {
          numStr += input[j];
          j++;
        }
        const idx = history.length - parseInt(numStr, 10);
        result += idx >= 0 && idx < history.length ? history[idx].command : "";
        i = j;
        continue;
      }

      if (/\d/.test(input[i + 1])) {
        let numStr = "";
        let j = i + 1;
        while (j < input.length && /\d/.test(input[j])) {
          numStr += input[j];
          j++;
        }
        const idx = parseInt(numStr, 10) - 1;
        result += idx >= 0 && idx < history.length ? history[idx].command : "";
        i = j;
        continue;
      }
    }

    result += input[i];
    i++;
  }

  return result;
}

// --- Glob Expansion ---

export function expandGlob(
  pattern: string,
  fs: FileSystem,
  cwd: string,
): string[] {
  if (!/[*?[\]]/.test(pattern)) return [pattern];

  try {
    const matches = fs.glob(pattern, cwd);
    if (matches.length === 0) return [pattern];

    if (!pattern.startsWith("/")) {
      const prefix = cwd === "/" ? "/" : cwd + "/";
      return matches.map((m) =>
        m.startsWith(prefix) ? m.slice(prefix.length) : m,
      );
    }
    return matches;
  } catch {
    return [pattern];
  }
}

// --- Top-level Parse ---

export function parse(
  input: string,
  env: Record<string, string>,
  history: HistoryEntry[],
): ChainEntry[] {
  const expanded = expandHistory(input, history);
  return parseChain(expanded, env);
}
