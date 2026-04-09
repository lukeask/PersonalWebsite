import { describe, it, expect } from "vitest";
import {
  buildPs1String,
  buildPreviewSegments,
  getComponentBashText,
  DEFAULT_COMPONENTS,
  ANSI_FG_CODES,
  type PS1Component,
  type AnsiColor,
} from "@/lib/util/ps1";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function comp(
  type: PS1Component["type"],
  color: AnsiColor = "none",
  bold = false,
  customText?: string,
): PS1Component {
  return { id: "t1", type, enabled: true, color, bold, customText };
}

// ─── buildPs1String ───────────────────────────────────────────────────────────

describe("buildPs1String", () => {
  it("returns bare bash escape for colorless username", () => {
    expect(buildPs1String([comp("username")])).toBe("\\u");
  });

  it("returns bare bash escape for colorless hostname", () => {
    expect(buildPs1String([comp("hostname")])).toBe("\\h");
  });

  it("returns \\w for full cwd", () => {
    expect(buildPs1String([comp("cwd")])).toBe("\\w");
  });

  it("returns \\W for short cwd", () => {
    expect(buildPs1String([comp("cwd_short")])).toBe("\\W");
  });

  it("returns \\t for 24h time", () => {
    expect(buildPs1String([comp("time_24")])).toBe("\\t");
  });

  it("returns \\T for 12h time", () => {
    expect(buildPs1String([comp("time_12")])).toBe("\\T");
  });

  it("returns \\d for date", () => {
    expect(buildPs1String([comp("date")])).toBe("\\d");
  });

  it("wraps username in ANSI color codes when color is green", () => {
    const code = ANSI_FG_CODES["green"]; // 32
    const ps1 = buildPs1String([comp("username", "green")]);
    expect(ps1).toBe(`\\[\\e[${code}m\\]\\u\\[\\e[0m\\]`);
  });

  it("wraps with bold prefix when bold is true and no color", () => {
    const ps1 = buildPs1String([comp("separator", "none", true, "$")]);
    expect(ps1).toBe("\\[\\e[1m\\]$\\[\\e[0m\\]");
  });

  it("combines bold and color codes with semicolon", () => {
    const code = ANSI_FG_CODES["bright_white"]; // 97
    const ps1 = buildPs1String([comp("separator", "bright_white", true, "$")]);
    expect(ps1).toBe(`\\[\\e[1;${code}m\\]$\\[\\e[0m\\]`);
  });

  it("concatenates multiple enabled components", () => {
    const components: PS1Component[] = [
      { id: "1", type: "username", enabled: true, color: "none", bold: false },
      {
        id: "2",
        type: "separator",
        enabled: true,
        color: "none",
        bold: false,
        customText: "@",
      },
      { id: "3", type: "hostname", enabled: true, color: "none", bold: false },
    ];
    expect(buildPs1String(components)).toBe("\\u@\\h");
  });

  it("skips disabled components", () => {
    const components: PS1Component[] = [
      { id: "1", type: "username", enabled: false, color: "none", bold: false },
      {
        id: "2",
        type: "separator",
        enabled: true,
        color: "none",
        bold: false,
        customText: "@",
      },
    ];
    expect(buildPs1String(components)).toBe("@");
  });

  it("returns empty string for all-disabled components", () => {
    const components: PS1Component[] = [
      { id: "1", type: "username", enabled: false, color: "none", bold: false },
    ];
    expect(buildPs1String(components)).toBe("");
  });

  it("returns empty string for empty component list", () => {
    expect(buildPs1String([])).toBe("");
  });

  it("includes git command substitution for git_branch type", () => {
    const ps1 = buildPs1String([comp("git_branch")]);
    expect(ps1).toContain("$(");
    expect(ps1).toContain("git branch");
    expect(ps1).toContain("sed");
  });

  it("separator with no customText produces empty string", () => {
    const ps1 = buildPs1String([comp("separator", "none", false, undefined)]);
    expect(ps1).toBe("");
  });

  it("custom type passes through its text literally", () => {
    const ps1 = buildPs1String([comp("custom", "none", false, "hello")]);
    expect(ps1).toBe("hello");
  });

  it("all 16 ANSI colors produce distinct codes", () => {
    const colors = Object.keys(ANSI_FG_CODES) as Exclude<AnsiColor, "none">[];
    const codes = colors.map((c) => ANSI_FG_CODES[c]);
    expect(new Set(codes).size).toBe(colors.length);
  });
});

// ─── getComponentBashText ─────────────────────────────────────────────────────

describe("getComponentBashText", () => {
  it("returns empty string for separator with no customText", () => {
    expect(
      getComponentBashText({
        id: "1",
        type: "separator",
        enabled: true,
        color: "none",
        bold: false,
      }),
    ).toBe("");
  });

  it("returns the customText for separator", () => {
    expect(
      getComponentBashText({
        id: "1",
        type: "separator",
        enabled: true,
        color: "none",
        bold: false,
        customText: ">",
      }),
    ).toBe(">");
  });
});

// ─── buildPreviewSegments ─────────────────────────────────────────────────────

describe("buildPreviewSegments", () => {
  it("resolves \\u to the username", () => {
    const segs = buildPreviewSegments([comp("username")], "luke", "askew", "/home/luke");
    expect(segs[0].text).toBe("luke");
  });

  it("resolves \\h to the hostname", () => {
    const segs = buildPreviewSegments([comp("hostname")], "luke", "askew", "/home/luke");
    expect(segs[0].text).toBe("askew");
  });

  it("replaces /home/username with ~ in full cwd", () => {
    const segs = buildPreviewSegments(
      [comp("cwd")],
      "luke",
      "askew",
      "/home/luke/projects/foo",
    );
    expect(segs[0].text).toBe("~/projects/foo");
  });

  it("leaves non-home cwd unchanged", () => {
    const segs = buildPreviewSegments([comp("cwd")], "luke", "askew", "/etc");
    expect(segs[0].text).toBe("/etc");
  });

  it("resolves \\W to the basename of cwd", () => {
    const segs = buildPreviewSegments(
      [comp("cwd_short")],
      "luke",
      "askew",
      "/home/luke/projects",
    );
    expect(segs[0].text).toBe("projects");
  });

  it("renders git_branch with surrounding parens", () => {
    const segs = buildPreviewSegments(
      [comp("git_branch")],
      "luke",
      "askew",
      "/home/luke",
      "feature/auth",
    );
    expect(segs[0].text).toBe("(feature/auth)");
  });

  it("defaults git_branch to 'main'", () => {
    const segs = buildPreviewSegments([comp("git_branch")], "luke", "askew", "/home/luke");
    expect(segs[0].text).toBe("(main)");
  });

  it("passes through separator customText verbatim", () => {
    const segs = buildPreviewSegments(
      [comp("separator", "none", false, "@")],
      "luke",
      "askew",
      "/home/luke",
    );
    expect(segs[0].text).toBe("@");
  });

  it("skips disabled components", () => {
    const components: PS1Component[] = [
      { id: "1", type: "username", enabled: false, color: "none", bold: false },
      { id: "2", type: "hostname", enabled: true, color: "none", bold: false },
    ];
    const segs = buildPreviewSegments(components, "luke", "askew", "/home/luke");
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe("askew");
  });

  it("filters out segments with empty text", () => {
    const segs = buildPreviewSegments(
      [comp("separator", "none", false, "")],
      "luke",
      "askew",
      "/home/luke",
    );
    expect(segs).toHaveLength(0);
  });

  it("propagates color and bold to each segment", () => {
    const segs = buildPreviewSegments(
      [comp("username", "green", true)],
      "luke",
      "askew",
      "/home/luke",
    );
    expect(segs[0].color).toBe("green");
    expect(segs[0].bold).toBe(true);
  });

  it("produces one segment per enabled component", () => {
    const segs = buildPreviewSegments(
      DEFAULT_COMPONENTS,
      "guest",
      "hostname",
      "/home/guest/projects",
    );
    // All DEFAULT_COMPONENTS are enabled; some separators may have non-empty text
    expect(segs.length).toBeGreaterThan(0);
    const text = segs.map((s) => s.text).join("");
    expect(text).toContain("guest");
    expect(text).toContain("hostname");
    expect(text).toContain("~/projects");
    expect(text).toContain("$");
  });
});

// ─── DEFAULT_COMPONENTS ───────────────────────────────────────────────────────

describe("DEFAULT_COMPONENTS", () => {
  it("has unique IDs", () => {
    const ids = DEFAULT_COMPONENTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has at least one username component", () => {
    expect(DEFAULT_COMPONENTS.some((c) => c.type === "username")).toBe(true);
  });

  it("has at least one hostname component", () => {
    expect(DEFAULT_COMPONENTS.some((c) => c.type === "hostname")).toBe(true);
  });

  it("has at least one cwd component", () => {
    expect(
      DEFAULT_COMPONENTS.some((c) => c.type === "cwd" || c.type === "cwd_short"),
    ).toBe(true);
  });

  it("has a git_branch component", () => {
    expect(DEFAULT_COMPONENTS.some((c) => c.type === "git_branch")).toBe(true);
  });

  it("buildPs1String produces a string containing all bash escapes", () => {
    const ps1 = buildPs1String(DEFAULT_COMPONENTS);
    expect(ps1).toContain("\\u");
    expect(ps1).toContain("\\h");
    expect(ps1).toContain("\\w");
  });

  it("all components are enabled by default", () => {
    expect(DEFAULT_COMPONENTS.every((c) => c.enabled)).toBe(true);
  });
});
