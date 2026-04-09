"use client";

import { type ReactNode, isValidElement } from "react";
import type { CommandOutput, TerminalOutputLine } from "@/lib/types";

interface TerminalOutputRendererProps {
  output: CommandOutput;
  onClickAction: (command: string) => void;
}

const STYLE_CLASSES: Record<string, string> = {
  error: "text-terminal-error",
  bold: "text-terminal-bold font-bold",
  dim: "text-terminal-dim",
  highlight: "text-terminal-highlight",
  link: "text-terminal-link underline cursor-pointer",
};

export function TerminalOutputRenderer({
  output,
  onClickAction,
}: TerminalOutputRendererProps) {
  if (output.lines.length === 0) return null;

  return (
    <div className="whitespace-pre-wrap break-words">
      {output.lines.map((line, i) => (
        <OutputLine key={i} line={line} onClickAction={onClickAction} />
      ))}
    </div>
  );
}

function OutputLine({
  line,
  onClickAction,
}: {
  line: TerminalOutputLine;
  onClickAction: (command: string) => void;
}) {
  if (isValidElement(line.content) || typeof line.content !== "string") {
    const node = line.content as ReactNode;
    if (line.clickAction) {
      return (
        <div
          className="cursor-pointer hover:bg-terminal-selection/30 hover:underline decoration-terminal-dim"
          onClick={() => onClickAction(line.clickAction!.command)}
        >
          {node}
        </div>
      );
    }
    return <div>{node}</div>;
  }

  const styleClass = line.style ? STYLE_CLASSES[line.style] : "text-terminal-fg";
  const clickable = !!line.clickAction;

  return (
    <div
      className={`${styleClass} ${clickable ? "cursor-pointer hover:bg-terminal-selection/30 hover:underline decoration-terminal-dim" : ""}`}
      onClick={clickable ? () => onClickAction(line.clickAction!.command) : undefined}
    >
      {line.content}
    </div>
  );
}

// --- Markdown rendering ---

const INLINE_RE =
  /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[([^\]]+)\]\(([^)]+)\))/g;

function parseInlineMarkdown(text: string): ReactNode {
  const tokens: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }

    if (match[2] != null) {
      tokens.push(
        <strong key={key++} className="text-terminal-bold font-bold">
          {match[2]}
        </strong>,
      );
    } else if (match[3] != null) {
      tokens.push(
        <em key={key++} className="italic">
          {match[3]}
        </em>,
      );
    } else if (match[4] != null) {
      tokens.push(
        <code
          key={key++}
          className="bg-terminal-selection px-1 rounded text-terminal-highlight"
        >
          {match[4]}
        </code>,
      );
    } else if (match[5] != null && match[6] != null) {
      tokens.push(
        <a
          key={key++}
          href={match[6]}
          className="text-terminal-link underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {match[5]}
        </a>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }

  return tokens.length === 1 ? tokens[0] : <>{tokens}</>;
}

export function MarkdownBlock({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const elements: ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      elements.push(
        <pre
          key={key++}
          className="bg-terminal-selection rounded p-2 my-1 overflow-x-auto text-terminal-fg"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const sizes = [
        "text-xl",
        "text-lg",
        "text-base",
        "text-base",
        "text-sm",
        "text-sm",
      ];
      elements.push(
        <div
          key={key++}
          className={`${sizes[level - 1]} font-bold text-terminal-bold mt-2 mb-1`}
        >
          {parseInlineMarkdown(headerMatch[2])}
        </div>,
      );
      i++;
      continue;
    }

    if (line.match(/^[-*+]\s+/)) {
      elements.push(
        <div key={key++} className="pl-2">
          <span className="text-terminal-dim">{"• "}</span>
          {parseInlineMarkdown(line.replace(/^[-*+]\s+/, ""))}
        </div>,
      );
      i++;
      continue;
    }

    const olMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (olMatch) {
      elements.push(
        <div key={key++} className="pl-2">
          <span className="text-terminal-dim">{olMatch[1]}. </span>
          {parseInlineMarkdown(olMatch[2])}
        </div>,
      );
      i++;
      continue;
    }

    if (line.match(/^(---+|===+|\*\*\*+)\s*$/)) {
      elements.push(
        <hr key={key++} className="border-terminal-dim my-1" />,
      );
      i++;
      continue;
    }

    if (line.startsWith("> ")) {
      elements.push(
        <div
          key={key++}
          className="border-l-2 border-terminal-dim pl-2 text-terminal-dim italic"
        >
          {parseInlineMarkdown(line.slice(2))}
        </div>,
      );
      i++;
      continue;
    }

    if (line.trim() === "") {
      elements.push(<div key={key++} className="h-2" />);
      i++;
      continue;
    }

    elements.push(
      <div key={key++}>{parseInlineMarkdown(line)}</div>,
    );
    i++;
  }

  return <div className="space-y-0.5 text-terminal-fg">{elements}</div>;
}
