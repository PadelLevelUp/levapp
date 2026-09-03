---
path: frontend/apps/web/src/components/ui/command.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 133
size_tokens: 1205
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2b640fee593528d494ca19b2888db68a396a96950ea0bb6f1b50536e26e26019"
---

## Purpose

Command-palette / fuzzy-search list built on the `cmdk` library, plus a `CommandDialog` variant that mounts it inside the shared `Dialog` for a full ⌘K-style modal overlay.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@/components/ui/dialog`: `Dialog`, `DialogContent` — host `CommandDialog`'s modal chrome.
- `@radix-ui/react-dialog`: `DialogProps` type only, for `CommandDialogProps`.
- `cmdk`: `Command` primitive (aliased `CommandPrimitive`), the underlying fuzzy-match list.
- `lucide-react`: `Search` icon in `CommandInput`.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
