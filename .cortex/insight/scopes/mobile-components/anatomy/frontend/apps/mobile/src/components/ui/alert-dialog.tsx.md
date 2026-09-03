---
path: frontend/apps/mobile/src/components/ui/alert-dialog.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 143
size_tokens: 914
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "476cfd028f8db9826d3d99bfe33544924c6a8db060a599edd5a6b4a829de2d67"
---

## Purpose

Styled wrapper around `@rn-primitives/alert-dialog` (react-native-reusables
convention): `AlertDialog`/`AlertDialogTrigger`/`AlertDialogPortal` are the
primitive's own exports re-exported unstyled, while `AlertDialogOverlay`,
`AlertDialogContent`, header/footer/title/description, and
`AlertDialogAction`/`AlertDialogCancel` add NativeWind classes and — for
the action/cancel buttons — thread `buttonVariants`/`buttonTextVariants`
through `TextClassContext.Provider` so they look like a normal `Button`.
Used for destructive-confirmation flows (as opposed to `dialog.tsx`, the
general-purpose modal).

## Connections

Uses:
- `frontend/apps/mobile/src/components/ui/button.tsx`: `buttonVariants`
  and `buttonTextVariants` style `AlertDialogAction`/`AlertDialogCancel`
  to look like `Button` variants without importing the component itself.
- `frontend/apps/mobile/src/components/ui/text.tsx`: `TextClassContext`
  propagates the button text styling into the primitive's text children.

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); expected to be consumed by feature screens needing
destructive-confirmation prompts, outside this scope.

Semantically related (not imports): `frontend/apps/mobile/src/components/ui/dialog.tsx`
— `AlertDialogOverlay`'s comment explicitly cites "same width-collapse fix
as dialog.tsx's DialogOverlay — see PAD-102": both overlays apply
`alignSelf: "stretch"` as a plain (non-NativeWind) style to work around a
flexbox `items-center` cross-axis collapse for short/empty content.
