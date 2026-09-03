---
path: frontend/apps/web/src/components/ui/sonner.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 29
size_tokens: 227
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ebd645455b3e23b602360b2d0fc9fbc0f2dc45bf61e7f44f5c71bee94e909e9a"
---

## Purpose

Alternate toast system: wraps the `sonner` library's `Toaster`, synced to the app's `next-themes` theme, with `sonner`'s toast classNames re-mapped onto the app's background/foreground/border/primary/muted tokens. LevApp runs two parallel toast systems — this one (`sonner`) and the Radix-based `toast.tsx`/`toaster.tsx`/`use-toast.ts` stack; the two are not interchangeable and a caller must commit to one.

## Connections

Uses:
- `next-themes`: `useTheme`, to sync sonner's `theme` prop.
- `sonner`: `Toaster` (aliased `Sonner`), `toast` — the underlying toast library, re-exported.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.

Semantically related (not imports):
- `toast.tsx`, `toaster.tsx`, `use-toast.ts` — the second, independent toast system this app maintains in parallel; see the `dual-toast-systems` note.
