---
path: frontend/apps/web/src/components/ui/dialog.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 100
size_tokens: 969
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a6f32c27b6ce52f301571ae955b2fcc9e8daa08b3ee75f54b08161bc4109bea1"
---

## Purpose

Modal dialog (`Overlay`/`Content`/`Header`/`Footer`/`Title`/`Description`) wrapping Radix Dialog. The built-in close (`X`) button's sr-only label is translated via `react-i18next` rather than hardcoded.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-dialog`: full primitive set.
- `lucide-react`: `X` close icon.
- `react`: `forwardRef` pattern.
- `react-i18next`: `useTranslation`, for the close button's `ui.dialog.close` label.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.

Semantically related (not imports):
- `sheet.tsx` — also wraps `@radix-ui/react-dialog` (aliased `SheetPrimitive`) for a side-anchored variant and shares the same `ui.dialog.close` translation key.
