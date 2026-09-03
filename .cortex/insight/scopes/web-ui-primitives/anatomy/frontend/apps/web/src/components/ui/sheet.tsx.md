---
path: frontend/apps/web/src/components/ui/sheet.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 112
size_tokens: 1079
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5f56f75d0f8350c76a7d55cd2e10e1b13d98aeb60c2e62bf8a8ed10e04cb6a59"
---

## Purpose

Side-anchored sheet/panel with `top`/`bottom`/`left`/`right` variants via `cva`, built on `@radix-ui/react-dialog` (imported directly, aliased `SheetPrimitive` — this file does not reuse `dialog.tsx`). Its close button's sr-only label reuses `dialog.tsx`'s `ui.dialog.close` translation key. Consumed directly by `sidebar.tsx` for the mobile sidebar (rendered as a left/right sheet).

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-dialog`: full primitive set, aliased `SheetPrimitive` (independent import from `dialog.tsx`'s).
- `class-variance-authority`: `cva`, for the four `side` variants.
- `lucide-react`: `X` close icon.
- `react`: `forwardRef` pattern.
- `react-i18next`: `useTranslation`, reusing the `ui.dialog.close` key.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.

Semantically related (not imports):
- `dialog.tsx` — both wrap `@radix-ui/react-dialog` independently and share the `ui.dialog.close` translation key; a change to that key must be made in both.
