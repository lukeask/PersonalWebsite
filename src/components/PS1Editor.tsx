"use client";

import { useState, useEffect, useRef, useCallback } from "react";

import {
  type PS1Component,
  type ComponentType,
  ANSI_HEX,
  NORMAL_COLORS,
  BRIGHT_COLORS,
  SEPARATOR_PRESETS,
  ADDABLE_TYPES,
  DEFAULT_COMPONENTS,
  PS1_STORAGE_KEY,
  buildPs1String,
  buildPreviewSegments,
  getComponentLabel,
} from "@/lib/util/ps1";

// --- Props ---

export interface PS1EditorProps {
  username: string;
  hostname: string;
  cwd: string;
  onApply: (ps1: string) => void;
  onCancel: () => void;
  initialComponents?: PS1Component[];
}

// --- ID generator ---

let _uid = 200;
function nextId(): string {
  return `c${_uid++}`;
}

// --- PS1Editor component ---

export function PS1Editor({
  username,
  hostname,
  cwd,
  onApply,
  onCancel,
  initialComponents,
}: PS1EditorProps) {
  const [components, setComponents] = useState<PS1Component[]>(() => {
    if (initialComponents && initialComponents.length > 0) return initialComponents;
    try {
      const saved = localStorage.getItem(PS1_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as PS1Component[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore parse errors
    }
    return DEFAULT_COMPONENTS.map((c) => ({ ...c }));
  });

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [panel, setPanel] = useState<"components" | "options">("components");
  const [showAddMenu, setShowAddMenu] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const handleApply = useCallback(() => {
    const ps1 = buildPs1String(components);
    try {
      localStorage.setItem(PS1_STORAGE_KEY, JSON.stringify(components));
    } catch {
      // ignore storage errors
    }
    onApply(ps1);
  }, [components, onApply]);

  const handleReset = useCallback(() => {
    setComponents(DEFAULT_COMPONENTS.map((c) => ({ ...c })));
    setSelectedIdx(0);
    setShowAddMenu(false);
  }, []);

  const updateSelected = useCallback(
    (updater: (c: PS1Component) => PS1Component) => {
      setComponents((prev) =>
        prev.map((c, i) => (i === selectedIdx ? updater(c) : c)),
      );
    },
    [selectedIdx],
  );

  const removeSelected = useCallback(() => {
    setComponents((prev) => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx((i) => Math.max(0, i - 1));
  }, [selectedIdx]);

  const addComponent = useCallback(
    (type: ComponentType, defaultText?: string) => {
      const newComp: PS1Component = {
        id: nextId(),
        type,
        enabled: true,
        color: "none",
        bold: false,
        ...(defaultText !== undefined ? { customText: defaultText } : {}),
      };
      setComponents((prev) => {
        const next = [...prev];
        next.splice(selectedIdx + 1, 0, newComp);
        return next;
      });
      setSelectedIdx((i) => i + 1);
      setShowAddMenu(false);
    },
    [selectedIdx],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;

      if (panel === "components") {
        switch (e.key) {
          case "ArrowUp":
            e.preventDefault();
            if (e.shiftKey) {
              // Move component up
              setComponents((prev) => {
                const target = selectedIdx - 1;
                if (target < 0) return prev;
                const next = [...prev];
                [next[selectedIdx], next[target]] = [next[target], next[selectedIdx]];
                return next;
              });
              setSelectedIdx((i) => Math.max(0, i - 1));
            } else {
              setSelectedIdx((i) => Math.max(0, i - 1));
            }
            break;
          case "ArrowDown":
            e.preventDefault();
            if (e.shiftKey) {
              // Move component down
              setComponents((prev) => {
                const target = selectedIdx + 1;
                if (target >= prev.length) return prev;
                const next = [...prev];
                [next[selectedIdx], next[target]] = [next[target], next[selectedIdx]];
                return next;
              });
              setSelectedIdx((i) => Math.min(components.length - 1, i + 1));
            } else {
              setSelectedIdx((i) => Math.min(components.length - 1, i + 1));
            }
            break;
          case " ":
            e.preventDefault();
            updateSelected((c) => ({ ...c, enabled: !c.enabled }));
            break;
          case "Tab":
            e.preventDefault();
            setPanel("options");
            break;
          case "a":
            e.preventDefault();
            handleApply();
            break;
          case "c":
            e.preventDefault();
            onCancel();
            break;
          case "r":
            e.preventDefault();
            handleReset();
            break;
          case "n":
            e.preventDefault();
            setShowAddMenu((v) => !v);
            break;
          case "Escape":
            e.preventDefault();
            if (showAddMenu) setShowAddMenu(false);
            else onCancel();
            break;
          case "Enter":
            e.preventDefault();
            handleApply();
            break;
        }
      } else {
        // options panel
        switch (e.key) {
          case "Tab":
          case "Escape":
            e.preventDefault();
            setPanel("components");
            break;
        }
      }
    },
    [
      panel,
      selectedIdx,
      components.length,
      updateSelected,
      showAddMenu,
      onCancel,
      handleApply,
      handleReset,
    ],
  );

  const selected = components[Math.min(selectedIdx, components.length - 1)];
  const previewSegments = buildPreviewSegments(components, username, hostname, cwd);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="flex flex-col h-full w-full outline-none bg-terminal-bg text-terminal-fg font-mono text-sm select-none"
    >
      {/* ── Title bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-terminal-dim/40 shrink-0">
        <span className="text-xs">
          <span className="text-terminal-highlight font-bold">─ PS1 Editor</span>
          <span className="text-terminal-dim"> ─── .bashrc</span>
        </span>
        <span className="text-terminal-dim text-xs">
          a: apply · c: cancel · r: reset
        </span>
      </div>

      {/* ── Main panels ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left: Components ──────────────────────────────────────────── */}
        <div
          className={`flex flex-col w-64 shrink-0 border-r ${
            panel === "components"
              ? "border-terminal-highlight/50"
              : "border-terminal-dim/30"
          }`}
        >
          {/* Panel header */}
          <div className="px-3 py-1 border-b border-terminal-dim/30 text-xs shrink-0">
            {panel === "components" ? (
              <span className="text-terminal-highlight">▶ COMPONENTS</span>
            ) : (
              <span className="text-terminal-dim">  COMPONENTS</span>
            )}
            <span className="text-terminal-dim/50 ml-1">↑↓ S+↑↓ spc Tab</span>
          </div>

          {/* Component list */}
          <div className="flex-1 overflow-y-auto py-0.5">
            {components.map((comp, idx) => (
              <div
                key={comp.id}
                className={`flex items-center px-2 py-0.5 cursor-pointer text-xs ${
                  idx === selectedIdx
                    ? "bg-terminal-selection"
                    : "hover:bg-terminal-selection/20"
                }`}
                onClick={() => {
                  setSelectedIdx(idx);
                  setPanel("components");
                  containerRef.current?.focus();
                }}
              >
                {/* Selection indicator */}
                <span
                  className={`w-2 mr-1 shrink-0 ${
                    idx === selectedIdx
                      ? "text-terminal-highlight"
                      : "text-transparent"
                  }`}
                >
                  ▶
                </span>

                {/* Toggle */}
                <span
                  className={`w-3 mr-2 text-center shrink-0 cursor-pointer ${
                    comp.enabled ? "text-terminal-green" : "text-terminal-dim"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setComponents((prev) =>
                      prev.map((c, i) =>
                        i === idx ? { ...c, enabled: !c.enabled } : c,
                      ),
                    );
                  }}
                >
                  {comp.enabled ? "✓" : "·"}
                </span>

                {/* Color swatch */}
                <span
                  className="w-2.5 h-2.5 rounded-sm mr-2 shrink-0 inline-block"
                  style={{
                    backgroundColor:
                      comp.color === "none"
                        ? "transparent"
                        : ANSI_HEX[comp.color],
                    border:
                      comp.color === "none"
                        ? "1px solid var(--terminal-dim)"
                        : "none",
                    opacity: comp.enabled ? 1 : 0.35,
                  }}
                />

                {/* Label */}
                <span
                  className={`truncate ${
                    comp.enabled ? "text-terminal-fg" : "text-terminal-dim/50"
                  } ${comp.bold ? "font-bold" : ""}`}
                >
                  {getComponentLabel(comp)}
                </span>
              </div>
            ))}
          </div>

          {/* Add component button + menu */}
          <div className="border-t border-terminal-dim/30 shrink-0">
            <button
              className="w-full text-left text-xs px-3 py-1.5 text-terminal-dim hover:text-terminal-fg hover:bg-terminal-selection/20"
              onClick={() => {
                setShowAddMenu((v) => !v);
                containerRef.current?.focus();
              }}
            >
              {showAddMenu ? "▼" : "▶"} [n]ew component
            </button>
            {showAddMenu && (
              <div className="border-t border-terminal-dim/20 max-h-40 overflow-y-auto">
                {ADDABLE_TYPES.map(({ type, label, defaultText }) => (
                  <button
                    key={`${type}-${label}`}
                    className="block w-full text-left text-xs px-4 py-0.5 text-terminal-dim hover:bg-terminal-selection hover:text-terminal-fg"
                    onClick={() => {
                      addComponent(type, defaultText);
                      containerRef.current?.focus();
                    }}
                  >
                    + {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Options ────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          {/* Panel header */}
          <div className="px-3 py-1 border-b border-terminal-dim/30 text-xs shrink-0">
            {panel === "options" ? (
              <span className="text-terminal-highlight">▶ OPTIONS</span>
            ) : (
              <span className="text-terminal-dim">  OPTIONS</span>
            )}
            {selected && (
              <span className="ml-2 text-terminal-fg">
                — {getComponentLabel(selected).trim()}
              </span>
            )}
          </div>

          {selected ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* Text input for separator / custom */}
              {(selected.type === "separator" ||
                selected.type === "custom") && (
                <div>
                  <div className="text-xs text-terminal-dim mb-1.5">Text:</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={selected.customText ?? ""}
                      onChange={(e) =>
                        updateSelected((c) => ({
                          ...c,
                          customText: e.target.value,
                        }))
                      }
                      className="bg-transparent border border-terminal-dim/50 text-terminal-fg px-2 py-0.5 text-xs w-20 focus:border-terminal-highlight outline-none"
                    />
                    {selected.type === "separator" && (
                      <div className="flex gap-1 flex-wrap">
                        {SEPARATOR_PRESETS.map(({ char, label }) => (
                          <button
                            key={char}
                            title={`char: ${char === " " ? "space" : char}`}
                            className={`w-6 h-5 text-xs border text-center leading-none hover:border-terminal-highlight ${
                              selected.customText === char
                                ? "border-terminal-highlight text-terminal-highlight bg-terminal-highlight/10"
                                : "border-terminal-dim/40 text-terminal-fg"
                            }`}
                            onClick={() =>
                              updateSelected((c) => ({ ...c, customText: char }))
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Color picker */}
              <div>
                <div className="text-xs text-terminal-dim mb-2">
                  Foreground color:
                </div>
                <div className="space-y-2">
                  {/* Normal row */}
                  <div>
                    <div className="text-xs text-terminal-dim/50 mb-1">
                      normal
                    </div>
                    <div className="flex gap-1.5">
                      {NORMAL_COLORS.map((color) => (
                        <button
                          key={color}
                          title={color}
                          className={`w-5 h-5 rounded-sm border-2 transition-transform hover:scale-110 ${
                            selected.color === color
                              ? "border-terminal-bold scale-110"
                              : "border-transparent hover:border-terminal-dim"
                          }`}
                          style={{ backgroundColor: ANSI_HEX[color] }}
                          onClick={() =>
                            updateSelected((c) => ({ ...c, color }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                  {/* Bright row */}
                  <div>
                    <div className="text-xs text-terminal-dim/50 mb-1">
                      bright
                    </div>
                    <div className="flex gap-1.5">
                      {BRIGHT_COLORS.map((color) => (
                        <button
                          key={color}
                          title={color}
                          className={`w-5 h-5 rounded-sm border-2 transition-transform hover:scale-110 ${
                            selected.color === color
                              ? "border-terminal-bold scale-110"
                              : "border-transparent hover:border-terminal-dim"
                          }`}
                          style={{ backgroundColor: ANSI_HEX[color] }}
                          onClick={() =>
                            updateSelected((c) => ({ ...c, color }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                  {/* None */}
                  <button
                    className={`text-xs px-2 py-0.5 border ${
                      selected.color === "none"
                        ? "border-terminal-highlight text-terminal-highlight"
                        : "border-terminal-dim/40 text-terminal-dim hover:border-terminal-fg hover:text-terminal-fg"
                    }`}
                    onClick={() =>
                      updateSelected((c) => ({ ...c, color: "none" }))
                    }
                  >
                    none (inherit terminal color)
                  </button>
                </div>
              </div>

              {/* Bold toggle */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={selected.bold}
                    onChange={(e) =>
                      updateSelected((c) => ({ ...c, bold: e.target.checked }))
                    }
                    className="accent-terminal-highlight"
                  />
                  <span
                    className={
                      selected.bold ? "text-terminal-bold font-bold" : "text-terminal-dim"
                    }
                  >
                    bold
                  </span>
                </label>
              </div>

              {/* Remove */}
              <div className="pt-2 border-t border-terminal-dim/20">
                <button
                  className="text-xs text-terminal-error/70 hover:text-terminal-error border border-terminal-error/30 hover:border-terminal-error px-2 py-0.5"
                  onClick={removeSelected}
                >
                  remove component
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-terminal-dim text-xs">
              no components
            </div>
          )}
        </div>
      </div>

      {/* ── Preview ─────────────────────────────────────────────────────── */}
      <div className="border-t border-terminal-dim/40 px-3 py-2 shrink-0">
        <div className="text-xs text-terminal-dim mb-1">
          ── preview ──────────────────────────────
        </div>
        <div className="flex items-center flex-wrap gap-0 min-h-5">
          {previewSegments.map((seg, i) => (
            <span
              key={i}
              className={seg.bold ? "font-bold" : ""}
              style={{
                color:
                  seg.color === "none"
                    ? "var(--terminal-fg)"
                    : ANSI_HEX[seg.color],
              }}
            >
              {seg.text}
            </span>
          ))}
          <span
            className="text-terminal-cursor animate-pulse"
            style={{ animationDuration: "1s" }}
          >
            █
          </span>
        </div>
      </div>

      {/* ── Action bar ──────────────────────────────────────────────────── */}
      <div className="border-t border-terminal-dim/40 flex items-center gap-2 px-3 py-1.5 shrink-0">
        <button
          className="text-xs px-3 py-1 bg-terminal-green/15 text-terminal-green border border-terminal-green/50 hover:bg-terminal-green/25"
          onClick={handleApply}
        >
          [a]pply
        </button>
        <button
          className="text-xs px-3 py-1 text-terminal-dim border border-terminal-dim/40 hover:text-terminal-fg hover:border-terminal-fg"
          onClick={onCancel}
        >
          [c]ancel
        </button>
        <button
          className="text-xs px-3 py-1 text-terminal-dim border border-terminal-dim/40 hover:text-terminal-fg hover:border-terminal-fg"
          onClick={handleReset}
        >
          [r]eset to default
        </button>
        <span className="ml-auto text-terminal-dim/50 text-xs hidden sm:block">
          Tab: switch panel · ↑↓: navigate · Shift+↑↓: reorder · Space: toggle
        </span>
      </div>
    </div>
  );
}
