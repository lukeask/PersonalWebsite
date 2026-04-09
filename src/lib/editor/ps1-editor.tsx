// Shim: PS1 logic has moved to src/lib/util/ps1.ts
// PS1Editor component has moved to src/components/PS1Editor.tsx
// This file re-exports both for backward compatibility.
export * from "@/lib/util/ps1";
export { PS1Editor } from "@/components/PS1Editor";
export type { PS1EditorProps } from "@/components/PS1Editor";
