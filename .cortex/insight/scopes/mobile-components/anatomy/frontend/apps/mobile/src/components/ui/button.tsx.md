---
path: frontend/apps/mobile/src/components/ui/button.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 78
size_tokens: 509
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0e467b1775bfee5217b728e910def2888dbfb2e81188adfa98ed43b2c6f800a1"
---

## Purpose

`Button` is the primary tappable action component: a `Pressable` with six
`cva` variants (`default`, `destructive`, `outline`, `secondary`, `ghost`,
`link`) crossed with four sizes (`default`, `sm`, `lg`, `icon`). The
matching text color/size for each variant/size combination
(`buttonTextVariants`) is propagated to text children via
`TextClassContext.Provider` rather than requiring each caller to set the
right text className manually. `disabled` both sets `role`/`disabled` on
the `Pressable` and applies `opacity-50`.

## Connections

Uses:
- `frontend/apps/mobile/src/components/ui/text.tsx`: `TextClassContext`
  supplies the variant/size-matched text styling to the button's label.

Used by:
- `frontend/apps/mobile/src/components/error-state.tsx`: the retry button.
- `frontend/apps/mobile/src/components/ui/date-picker-input.tsx`: the
  Cancel/Done buttons in the iOS picker dialog.
- `frontend/apps/mobile/src/components/ui/time-picker-input.tsx`: the
  Cancel/Done buttons in the iOS picker dialog.
- `frontend/apps/mobile/src/components/ui/alert-dialog.tsx`: reuses
  `buttonVariants`/`buttonTextVariants` (not the `Button` component itself)
  to style `AlertDialogAction`/`AlertDialogCancel`.

Semantically related (not imports): `frontend/apps/mobile/src/components/ui/badge.tsx`
— same `cva` variant + `TextClassContext.Provider` pairing pattern, with a
near-identical variant naming scheme.
