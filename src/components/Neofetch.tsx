"use client";

// ─── Neofetch Display Component ───────────────────────────────────────────────
// Renders the neofetch-style splash: ASCII art left, info panel right,
// clickable nav bar at the bottom.

interface NeofetchProps {
  onNavigate?: (command: string) => void;
}

// ─── ASCII Art (alpine peak + reflection) ────────────────────────────────────

const ASCII_ART = [
  "        /\\",
  "       /  \\",
  "      /    \\",
  "     /  /\\  \\",
  "    /  /  \\  \\",
  "   /__/____\\__\\",
  "   ‾‾‾‾‾‾‾‾‾‾‾‾",
  "   \\  \\    /  /",
  "    \\  \\  /  /",
  "     \\  \\/  /",
  "      \\    /",
  "       \\  /",
  "        \\/",
];

const ASCII_ART_SMALL = [
  "    /\\",
  "   /  \\",
  "  /____\\",
  "  ‾‾‾‾‾‾",
  "  \\    /",
  "   \\  /",
  "    \\/",
];

// ─── Info lines ──────────────────────────────────────────────────────────────

interface InfoLine {
  label?: string;
  value: string;
  separator?: boolean;
  link?: string;
}

const INFO_LINES: InfoLine[] = [
  { label: "", value: "luke@askew.sh", separator: false },
  { label: "", value: "──────────────────", separator: true },
  { label: "Contact", value: "root@askew.sh" },
  { label: "Languages", value: "Python, Magma, R, C, CUDA, TS, Bash" },
  { label: "Tools", value: "PyTorch, AWS, Linux" },
  { label: "Interests", value: "Alignment, Interpretability, Arithmetic Geometry" },
  { label: "", value: "──────────────────", separator: true },
  { label: "GitHub", value: "github.com/lukeask", link: "https://github.com/lukeask" },
  { label: "LinkedIn", value: "linkedin.com/in/lukeask", link: "https://linkedin.com/in/lukeask" },
];

// ─── Navigation items ────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  command: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Projects", command: "ls ~/projects/" },
  { label: "Blog", command: "ls ~/blog/" },
  { label: "Resume", command: "cat ~/resume.md" },
  { label: "Contact", command: "cat ~/contact.md" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function Neofetch({ onNavigate }: NeofetchProps) {
  const artLines = ASCII_ART;

  return (
    <div className="font-mono">
      {/* ASCII art + info panel side by side */}
      <div className="flex flex-col sm:flex-row gap-0 sm:gap-4">
        {/* ASCII art — hidden on very narrow screens, small variant shown instead */}
        <div className="hidden sm:block text-terminal-highlight whitespace-pre leading-tight select-none shrink-0 min-w-[18ch] text-center">
          {artLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
        <div className="sm:hidden text-terminal-highlight whitespace-pre leading-tight select-none min-w-[10ch] text-center">
          {ASCII_ART_SMALL.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>

        {/* Info panel */}
        <div className="flex flex-col justify-center min-w-0">
          {INFO_LINES.map((info, i) => {
            if (info.separator) {
              return (
                <div key={i} className="text-terminal-dim">
                  {info.value}
                </div>
              );
            }

            // Title line (luke@askew.sh)
            if (!info.label && !info.separator) {
              return (
                <div key={i}>
                  <span className="text-terminal-user font-bold">luke</span>
                  <span className="text-terminal-dim">@</span>
                  <span className="text-terminal-host font-bold">askew.sh</span>
                </div>
              );
            }

            // Link line
            if (info.link) {
              return (
                <div key={i}>
                  <span className="text-terminal-highlight">{info.label}</span>
                  <span className="text-terminal-dim">: </span>
                  <a
                    href={info.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-terminal-link underline cursor-pointer hover:bg-terminal-selection/30"
                  >
                    {info.value}
                  </a>
                </div>
              );
            }

            // Regular info line
            return (
              <div key={i}>
                <span className="text-terminal-highlight">{info.label}</span>
                <span className="text-terminal-dim">: </span>
                <span className="text-terminal-fg">{info.value}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Color blocks (like real neofetch) */}
      <div className="mt-2 flex gap-0">
        {[
          "bg-terminal-error",
          "bg-terminal-green",
          "bg-terminal-highlight",
          "bg-terminal-user",
          "bg-terminal-host",
          "bg-terminal-cwd",
          "bg-terminal-link",
          "bg-terminal-bold",
        ].map((color) => (
          <span key={color} className={`${color} inline-block w-4 h-3`} />
        ))}
      </div>

      {/* Navigation bar */}
      {onNavigate && (
        <div className="mt-2 flex gap-3 flex-wrap">
          {NAV_ITEMS.map((item) => (
            <span
              key={item.label}
              className="text-terminal-link cursor-pointer hover:bg-terminal-selection/30 hover:underline decoration-terminal-dim"
              onClick={() => onNavigate(item.command)}
            >
              [{item.label}]
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
