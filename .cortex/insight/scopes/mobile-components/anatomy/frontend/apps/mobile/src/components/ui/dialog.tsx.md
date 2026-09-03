---
path: frontend/apps/mobile/src/components/ui/dialog.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 143
size_tokens: 1070
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8c3404fe0e93e85fac60c3d1a9b4806a046da0460bed9fbc6db8c5c3cc54fce6"
---

## Purpose

Styled wrapper around `@rn-primitives/dialog` (react-native-reusables
convention): `Dialog`/`DialogTrigger`/`DialogPortal`/`DialogClose` re-export
the primitive's own pieces; `DialogOverlay`, `DialogContent`
(with a translated close-button `aria-label`), header/footer/title/
description add NativeWind styling and a `portalHost` override.
`DialogOverlay` carries a documented fix (PAD-102): its inner
`Animated.View` sets `alignSelf: "stretch"` as a plain style rather than a
NativeWind `w-full` className — the overlay's `items-center` centers its
child on the cross-axis, which without the fix collapses the whole dialog
to fit-content width for short/empty content, and the `w-full` percentage
className alternative thrashed against NativeWind's measure-based interop
for an animated `entering`/`exiting` component and threw a "Maximum update
depth exceeded" error. This is the general-purpose modal, as opposed to
`alert-dialog.tsx`'s destructive-confirmation-specific one.

## Connections

Uses: (no other files in this scope; imports `@rn-primitives/dialog`,
`@expo/vector-icons`, `@levelup/config`, `react-i18next`,
`react-native-reanimated`)

Used by:
- `frontend/apps/mobile/src/components/ui/date-picker-input.tsx`: wraps
  the iOS spinner picker in `Dialog`/`DialogContent`/`DialogHeader`/
  `DialogTitle`/`DialogFooter`.
- `frontend/apps/mobile/src/components/ui/time-picker-input.tsx`: same,
  for the time picker.

Semantically related (not imports): `frontend/apps/mobile/src/components/ui/alert-dialog.tsx`
— `AlertDialogOverlay` applies the identical `alignSelf: "stretch"` fix and
its comment explicitly cross-references this file's PAD-102 fix.
