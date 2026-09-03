---
path: frontend/apps/mobile/src/components/ui/text.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 28
size_tokens: 225
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d5201804b4e70822441535ab34b58a79f68cf7f067ccb1db6ea70299cbb599cf"
---

## Purpose

`Text` is the base text-rendering primitive nearly the whole app renders
text through: it applies `font-sans text-base text-foreground` as the base
face (the file's own comment explains why this exists — RN `Text` doesn't
inherit a font family, and React 19 removed `Text.defaultProps`, so a
wrapper is the only way to give every text node a default face), layers in
whatever string the ambient `TextClassContext` provides, then the caller's
own `className`. `asChild` swaps the rendered element for
`@rn-primitives/slot`'s `Slot.Text` so a parent can merge props onto a
single child instead of wrapping it. `TextClassContext` itself (a plain
`React.createContext<string | undefined>`) is exported alongside `Text` and
is the mechanism nearly every other component in this scope uses to push
variant-specific text styling down to nested `Text`s without prop drilling.

## Connections

Uses: (no other files in this scope; imports `@rn-primitives/slot`)

Used by: this scope's most widely depended-on file — `TextClassContext`
and/or `Text` are imported by `empty-state.tsx`, `error-state.tsx`,
`screen.tsx`, `ui/alert-dialog.tsx`, `ui/avatar.tsx`, `ui/badge.tsx`,
`ui/button.tsx`, `ui/card.tsx`, `ui/date-picker-input.tsx`, `ui/tabs.tsx`,
`ui/time-picker-input.tsx`, and `ui/toast.tsx` — plus, outside this scope,
essentially any feature screen that renders text at all.
