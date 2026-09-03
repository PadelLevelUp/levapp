---
path: frontend/apps/mobile/src/components/ui/label.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 24
size_tokens: 157
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0f927290bd737b7d5c141de43516c2626491517466185fc11ba27e82c7e6acaa"
---

## Purpose

`Label` wraps `@rn-primitives/label`'s `Root`/`Text` pair: the `Root`
handles press-through-to-associated-control behavior (forwarding
`onPress`/`onLongPress`/`onPressIn`/`onPressOut`) while `Text` renders the
styled label string.

## Connections

Uses: (no other files in this scope; imports `@rn-primitives/label`)

Used by:
- `frontend/apps/mobile/src/components/ui/date-picker-input.tsx`: renders
  the optional field label above the picker pressable.
- `frontend/apps/mobile/src/components/ui/time-picker-input.tsx`: same.
