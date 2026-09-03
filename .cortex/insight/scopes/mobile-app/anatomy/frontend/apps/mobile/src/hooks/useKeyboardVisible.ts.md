---
path: frontend/apps/mobile/src/hooks/useKeyboardVisible.ts
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 31
size_tokens: 226
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a58a67c32f9a3b1fa658105cf09e9166d016a81eab0b35c022ba7213ba8e2ff1"
---

## Purpose

Small hook returning whether the on-screen keyboard is currently visible, backed by `Keyboard.addListener`.

## Connections

Uses: none within scope (imports React and RN's `Keyboard`/`Platform`, both outside this scope).

Used by: no in-scope file is captured in L1's structural edges (the `@/hooks/useKeyboardVisible` alias goes unresolved), but by direct reading it is called once, in `app/conversation/[id].tsx`, to adjust the composer's bottom padding.

## Insights

- iOS listens to `keyboardWillShow`/`keyboardWillHide` (pre-animation events) while Android listens to `keyboardDidShow`/`keyboardDidHide` (post-animation, the only pair Android ever fires) — using the `will` events on iOS lets dependent layout changes ride the same animation curve as the keyboard itself instead of visibly snapping a frame after it.
