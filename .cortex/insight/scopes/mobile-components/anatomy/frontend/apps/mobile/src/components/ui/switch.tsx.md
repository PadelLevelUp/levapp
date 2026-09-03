---
path: frontend/apps/mobile/src/components/ui/switch.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 27
size_tokens: 189
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0949f196b881ad3490c645993cb2b949de37656b35a761da2811e47986a9e4fb"
---

## Purpose

`Switch` wraps `@rn-primitives/switch`'s `Root`/`Thumb`: a pill track that
swaps between `bg-input` (off) and `bg-primary` (on), with a shadowed thumb
that translates via a fixed `translate-x-[18px]` when checked, dims to
`opacity-50` when disabled.

## Connections

Uses: (no other files in this scope; imports `@rn-primitives/switch`)

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); expected to be used for boolean settings/toggles throughout the
app, outside this scope.
