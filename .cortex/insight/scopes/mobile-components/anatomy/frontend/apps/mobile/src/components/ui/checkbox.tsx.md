---
path: frontend/apps/mobile/src/components/ui/checkbox.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 30
size_tokens: 221
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "aabde3a88555632234e016727f8222cdf0d8401b5c040173552b098603341b2a"
---

## Purpose

Styled wrapper around `@rn-primitives/checkbox`: a 20x20 rounded box that
fills with the primary color and swaps in a checkmark `Ionicons` glyph via
`CheckboxPrimitive.Indicator` when `checked`, dims to `opacity-50` when
`disabled`.

## Connections

Uses: (no other files in this scope; imports `@rn-primitives/checkbox`,
`@expo/vector-icons`, `@levelup/config`)

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); expected to be used in forms throughout the app, outside this
scope.
