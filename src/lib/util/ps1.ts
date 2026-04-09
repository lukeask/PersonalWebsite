// PS1 tokenizer, formatter, and preview renderer — pure logic, no React.

// --- Types ---

export type AnsiColor =
  | "none"
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "bright_black"
  | "bright_red"
  | "bright_green"
  | "bright_yellow"
  | "bright_blue"
  | "bright_magenta"
  | "bright_cyan"
  | "bright_white";

export type ComponentType =
  | "username"
  | "hostname"
  | "cwd"
  | "cwd_short"
  | "time_24"
  | "time_12"
  | "date"
  | "git_branch"
  | "custom"
  | "separator";

export interface PS1Component {
  id: string;
  type: ComponentType;
  enabled: boolean;
  color: AnsiColor;
  bold: boolean;
  customText?: string;
}

export interface PreviewSegment {
  text: string;
  color: AnsiColor;
  bold: boolean;
}

// --- Constants ---

export const ANSI_FG_CODES: Record<Exclude<AnsiColor, "none">, number> = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  bright_black: 90,
  bright_red: 91,
  bright_green: 92,
  bright_yellow: 93,
  bright_blue: 94,
  bright_magenta: 95,
  bright_cyan: 96,
  bright_white: 97,
};

// Tokyo Night–mapped hex values matching the site's terminal palette
export const ANSI_HEX: Record<Exclude<AnsiColor, "none">, string> = {
  black: "#1a1b26",
  red: "#f7768e",
  green: "#9ece6a",
  yellow: "#e0af68",
  blue: "#7aa2f7",
  magenta: "#bb9af7",
  cyan: "#73daca",
  white: "#a9b1d6",
  bright_black: "#565f89",
  bright_red: "#ff899d",
  bright_green: "#b9f27c",
  bright_yellow: "#ff9e64",
  bright_blue: "#a9c1ff",
  bright_magenta: "#d4b3ff",
  bright_cyan: "#7dcfff",
  bright_white: "#c0caf5",
};

export const NORMAL_COLORS: Exclude<AnsiColor, "none">[] = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
];

export const BRIGHT_COLORS: Exclude<AnsiColor, "none">[] = [
  "bright_black",
  "bright_red",
  "bright_green",
  "bright_yellow",
  "bright_blue",
  "bright_magenta",
  "bright_cyan",
  "bright_white",
];

// Powerline glyphs (U+E0B0–U+E0B3) require a Nerd Font; box-drawing chars work universally
export const SEPARATOR_PRESETS: { char: string; label: string }[] = [
  { char: "@", label: "@" },
  { char: ":", label: ":" },
  { char: " ", label: "·" },
  { char: "$", label: "$" },
  { char: ">", label: ">" },
  { char: "[", label: "[" },
  { char: "]", label: "]" },
  { char: "(", label: "(" },
  { char: ")", label: ")" },
  { char: "─", label: "─" },
  { char: "\ue0b0", label: "" }, // powerline filled right
  { char: "\ue0b1", label: "" }, // powerline thin right
  { char: "\ue0b2", label: "" }, // powerline filled left
  { char: "\ue0b3", label: "" }, // powerline thin left
];

export const PS1_STORAGE_KEY = "askew:ps1-config";

// --- Default PS1 — [guest@hostname:~/projects] (main) $ ---

export const DEFAULT_COMPONENTS: PS1Component[] = [
  {
    id: "d1",
    type: "separator",
    enabled: true,
    color: "bright_black",
    bold: false,
    customText: "[",
  },
  { id: "d2", type: "username", enabled: true, color: "cyan", bold: false },
  {
    id: "d3",
    type: "separator",
    enabled: true,
    color: "bright_black",
    bold: false,
    customText: "@",
  },
  { id: "d4", type: "hostname", enabled: true, color: "blue", bold: false },
  {
    id: "d5",
    type: "separator",
    enabled: true,
    color: "bright_black",
    bold: false,
    customText: ":",
  },
  { id: "d6", type: "cwd", enabled: true, color: "yellow", bold: false },
  {
    id: "d7",
    type: "separator",
    enabled: true,
    color: "bright_black",
    bold: false,
    customText: "]",
  },
  {
    id: "d8",
    type: "separator",
    enabled: true,
    color: "none",
    bold: false,
    customText: " ",
  },
  { id: "d9", type: "git_branch", enabled: true, color: "magenta", bold: false },
  {
    id: "d10",
    type: "separator",
    enabled: true,
    color: "none",
    bold: false,
    customText: " ",
  },
  {
    id: "d11",
    type: "separator",
    enabled: true,
    color: "bright_white",
    bold: true,
    customText: "$",
  },
  {
    id: "d12",
    type: "separator",
    enabled: true,
    color: "none",
    bold: false,
    customText: " ",
  },
];

// --- Addable component types ---

export const ADDABLE_TYPES: {
  type: ComponentType;
  label: string;
  defaultText?: string;
}[] = [
  { type: "username", label: "\\u  username" },
  { type: "hostname", label: "\\h  hostname" },
  { type: "cwd", label: "\\w  full path" },
  { type: "cwd_short", label: "\\W  short dir" },
  { type: "time_24", label: "\\t  time (24h)" },
  { type: "time_12", label: "\\T  time (12h)" },
  { type: "date", label: "\\d  date" },
  { type: "git_branch", label: "    git branch" },
  { type: "separator", label: "    separator", defaultText: ":" },
  { type: "custom", label: "    custom text", defaultText: "" },
];

// --- Pure logic functions ---

function wrapWithColor(text: string, color: AnsiColor, bold: boolean): string {
  if (color === "none" && !bold) return text;
  const parts: string[] = [];
  if (bold) parts.push("1");
  if (color !== "none") parts.push(String(ANSI_FG_CODES[color]));
  return `\\[\\e[${parts.join(";")}m\\]${text}\\[\\e[0m\\]`;
}

export function getComponentBashText(comp: PS1Component): string {
  switch (comp.type) {
    case "username":
      return "\\u";
    case "hostname":
      return "\\h";
    case "cwd":
      return "\\w";
    case "cwd_short":
      return "\\W";
    case "time_24":
      return "\\t";
    case "time_12":
      return "\\T";
    case "date":
      return "\\d";
    case "git_branch":
      return '$(git branch --show-current 2>/dev/null | sed "s/.*/(&)/")';
    case "custom":
    case "separator":
      return comp.customText ?? "";
  }
}

export function buildPs1String(components: PS1Component[]): string {
  return components
    .filter((c) => c.enabled)
    .map((c) => {
      const text = getComponentBashText(c);
      return text ? wrapWithColor(text, c.color, c.bold) : "";
    })
    .join("");
}

export function getComponentLabel(comp: PS1Component): string {
  switch (comp.type) {
    case "username":
      return "\\u  username";
    case "hostname":
      return "\\h  hostname";
    case "cwd":
      return "\\w  full path";
    case "cwd_short":
      return "\\W  short dir";
    case "time_24":
      return "\\t  time (24h)";
    case "time_12":
      return "\\T  time (12h)";
    case "date":
      return "\\d  date";
    case "git_branch":
      return "    git branch";
    case "custom":
      return `    "${comp.customText ?? ""}"`;
    case "separator": {
      const ch = comp.customText ?? "";
      return `    "${ch === " " ? "·" : ch}"`;
    }
  }
}

function resolvePreviewText(
  comp: PS1Component,
  username: string,
  hostname: string,
  cwd: string,
  gitBranch: string,
): string {
  switch (comp.type) {
    case "username":
      return username;
    case "hostname":
      return hostname;
    case "cwd": {
      const home = `/home/${username}`;
      return cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
    }
    case "cwd_short":
      return cwd.split("/").filter(Boolean).pop() ?? "~";
    case "time_24": {
      const n = new Date();
      return [n.getHours(), n.getMinutes(), n.getSeconds()]
        .map((v) => String(v).padStart(2, "0"))
        .join(":");
    }
    case "time_12": {
      const n = new Date();
      const h = n.getHours();
      const ampm = h >= 12 ? "PM" : "AM";
      return `${String(h % 12 || 12).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")} ${ampm}`;
    }
    case "date":
      return new Date().toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "2-digit",
      });
    case "git_branch":
      return `(${gitBranch})`;
    case "custom":
    case "separator":
      return comp.customText ?? "";
  }
}

export function buildPreviewSegments(
  components: PS1Component[],
  username: string,
  hostname: string,
  cwd: string,
  gitBranch = "main",
): PreviewSegment[] {
  return components
    .filter((c) => c.enabled)
    .map((c) => ({
      text: resolvePreviewText(c, username, hostname, cwd, gitBranch),
      color: c.color,
      bold: c.bold,
    }))
    .filter((s) => s.text !== "");
}
