"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
} from "react";
import type { Command } from "@/lib/types";

// ---------------------------------------------------------------------------
// Rate limiting — client-side, session-scoped (one message per minute)
// ---------------------------------------------------------------------------

const RATE_LIMIT_MS = 60_000;
const RATE_LIMIT_KEY = "askew:mail:last-sent";

function isRateLimited(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  const last = sessionStorage.getItem(RATE_LIMIT_KEY);
  if (!last) return false;
  return Date.now() - parseInt(last, 10) < RATE_LIMIT_MS;
}

function markSent(): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(RATE_LIMIT_KEY, String(Date.now()));
  }
}

// ---------------------------------------------------------------------------
// MailComposer — mutt/alpine-styled TUI compose screen
// ---------------------------------------------------------------------------

export interface MailComposerProps {
  onQuit: (message?: string) => void;
}

type ActiveField = "from" | "subject" | "body";

type Status =
  | { type: "idle" }
  | { type: "sending" }
  | { type: "error"; message: string }
  | { type: "success" };

export function MailComposer({ onQuit }: MailComposerProps) {
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [activeField, setActiveField] = useState<ActiveField>("from");
  const [status, setStatus] = useState<Status>({ type: "idle" });

  const fromRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Focus the From field on mount
  useEffect(() => {
    fromRef.current?.focus();
  }, []);

  const focusField = useCallback((field: ActiveField) => {
    setActiveField(field);
    switch (field) {
      case "from":
        fromRef.current?.focus();
        break;
      case "subject":
        subjectRef.current?.focus();
        break;
      case "body":
        bodyRef.current?.focus();
        break;
    }
  }, []);

  const send = useCallback(async () => {
    if (status.type === "sending") return;

    if (isRateLimited()) {
      setStatus({
        type: "error",
        message: "Rate limited: please wait a minute between messages.",
      });
      return;
    }

    if (!from.trim()) {
      setStatus({ type: "error", message: "From field required." });
      focusField("from");
      return;
    }
    if (!subject.trim()) {
      setStatus({ type: "error", message: "Subject field required." });
      focusField("subject");
      return;
    }
    if (!body.trim()) {
      setStatus({ type: "error", message: "Message body required." });
      focusField("body");
      return;
    }

    setStatus({ type: "sending" });

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: from.trim(),
          subject: subject.trim(),
          body: body.trim(),
        }),
      });

      if (res.ok) {
        markSent();
        setStatus({ type: "success" });
        setTimeout(() => onQuit("Message sent."), 1000);
      } else {
        const data = (await res.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        setStatus({
          type: "error",
          message:
            typeof data.error === "string"
              ? data.error
              : `Error ${res.status}: message not sent.`,
        });
      }
    } catch {
      setStatus({ type: "error", message: "Network error: message not sent." });
    }
  }, [from, subject, body, status.type, focusField, onQuit]);

  // Global Ctrl+X / Ctrl+C handler — attached to the container div so it
  // fires regardless of which child element has focus.
  const handleGlobalKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "x") {
        e.preventDefault();
        e.stopPropagation();
        send();
      } else if (e.ctrlKey && e.key === "c") {
        e.preventDefault();
        e.stopPropagation();
        onQuit();
      }
    },
    [send, onQuit],
  );

  // Tab advances to the next field within the header row
  const handleFieldTab = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, next: ActiveField) => {
      if (e.key === "Tab") {
        e.preventDefault();
        focusField(next);
      }
    },
    [focusField],
  );

  // Status bar content
  let statusContent: React.ReactNode = null;
  let statusClass = "text-terminal-dim";
  if (status.type === "sending") {
    statusContent = "Sending message...";
  } else if (status.type === "error") {
    statusContent = status.message;
    statusClass = "text-terminal-error";
  } else if (status.type === "success") {
    statusContent = "Message sent.";
    statusClass = "text-terminal-green";
  }

  return (
    <div
      className="flex flex-col h-full w-full bg-terminal-bg text-terminal-fg font-mono text-sm"
      onKeyDown={handleGlobalKey}
      // tabIndex so the div itself can receive key events when no child is
      // focused (e.g. right after mount before focus() completes)
      tabIndex={-1}
    >
      {/* ── Title bar ──────────────────────────────────────────────── */}
      <div className="bg-terminal-fg text-terminal-bg px-2 py-0.5 shrink-0 select-none font-bold">
        Mutt 2.2.12 — Compose New Message
      </div>

      {/* ── Header fields ──────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-terminal-dim/30">
        {/* To: fixed, not editable */}
        <div className="flex items-baseline px-2 py-0.5">
          <span className="w-20 shrink-0 text-terminal-bold">To     :</span>
          <span className="ml-1">root@askew.sh</span>
        </div>

        {/* From: editable */}
        <div
          className={`flex items-baseline px-2 py-0.5 ${
            activeField === "from" ? "bg-terminal-selection" : ""
          }`}
        >
          <span className="w-20 shrink-0 text-terminal-bold">From   :</span>
          <input
            ref={fromRef}
            type="text"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            onFocus={() => setActiveField("from")}
            onKeyDown={(e) => {
              handleFieldTab(e, "subject");
              // Also handle global shortcuts from field inputs
              if (e.ctrlKey && (e.key === "x" || e.key === "c")) {
                handleGlobalKey(e as unknown as KeyboardEvent);
              }
            }}
            className="flex-1 ml-1 bg-transparent text-terminal-fg outline-none border-none caret-terminal-cursor font-[inherit] text-[length:inherit] leading-[inherit]"
            placeholder="your@email.com"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>

        {/* Subject: editable */}
        <div
          className={`flex items-baseline px-2 py-0.5 ${
            activeField === "subject" ? "bg-terminal-selection" : ""
          }`}
        >
          <span className="w-20 shrink-0 text-terminal-bold">Subject:</span>
          <input
            ref={subjectRef}
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onFocus={() => setActiveField("subject")}
            onKeyDown={(e) => {
              handleFieldTab(e, "body");
              if (e.ctrlKey && (e.key === "x" || e.key === "c")) {
                handleGlobalKey(e as unknown as KeyboardEvent);
              }
            }}
            className="flex-1 ml-1 bg-transparent text-terminal-fg outline-none border-none caret-terminal-cursor font-[inherit] text-[length:inherit] leading-[inherit]"
            placeholder="(no subject)"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <textarea
        ref={bodyRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onFocus={() => setActiveField("body")}
        onKeyDown={(e) => {
          if (e.ctrlKey && (e.key === "x" || e.key === "c")) {
            handleGlobalKey(e as unknown as KeyboardEvent);
          }
        }}
        className="flex-1 min-h-0 p-2 bg-transparent text-terminal-fg outline-none border-none resize-none caret-terminal-cursor font-[inherit] text-[length:inherit] leading-relaxed"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
      />

      {/* ── Status line ────────────────────────────────────────────── */}
      <div
        className={`px-2 shrink-0 h-5 leading-5 border-t border-terminal-dim/30 text-xs ${statusClass}`}
      >
        {statusContent}
      </div>

      {/* ── Key binding bar ────────────────────────────────────────── */}
      <div className="bg-terminal-fg text-terminal-bg px-2 py-0.5 shrink-0 select-none flex gap-6 text-xs font-bold">
        <span>
          <span className="underline">^X</span> Send
        </span>
        <span>
          <span className="underline">^C</span> Cancel
        </span>
        <span className="ml-auto font-normal opacity-60">Tab: next field</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// createMailCommand — factory; returns a Command wired to a caller-supplied
// onOpen callback.  The parent (page.tsx) should:
//
//   const [mailOpen, setMailOpen] = useState(false);
//   const mailCommand = useMemo(
//     () => createMailCommand({ onOpen: () => setMailOpen(true) }),
//     [],
//   );
//   registry.register(mailCommand);
//
//   // Pass <MailComposer onQuit={() => setMailOpen(false)} /> as vimOverlay
//   // when mailOpen is true.
// ---------------------------------------------------------------------------

interface CreateMailCommandOptions {
  onOpen: () => void;
}

export function createMailCommand({
  onOpen,
}: CreateMailCommandOptions): Command {
  return {
    name: "mail",
    aliases: ["mutt"],
    description: "Compose and send an email to the site owner",
    usage: "mail root@askew.sh",
    execute(args) {
      const addr = args[0];
      if (addr !== "root@askew.sh") {
        return {
          lines: [{ content: "Usage: mail root@askew.sh" }],
          exitCode: 1,
        };
      }
      onOpen();
      return { lines: [], exitCode: 0 };
    },
  };
}
