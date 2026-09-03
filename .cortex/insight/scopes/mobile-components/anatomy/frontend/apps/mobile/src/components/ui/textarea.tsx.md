---
path: frontend/apps/mobile/src/components/ui/textarea.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 31
size_tokens: 183
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "90d69ddf9e22fcb5624673390b3f55f8ade9adf7c213f90aeb901a025f7b0e05"
---

## Purpose

`Textarea` is the multiline text field: a styled `TextInput` defaulting
`multiline={true}`, `numberOfLines={4}`, `textAlignVertical="top"`, with a
`min-h-[100px]` floor and the same placeholder color / `editable={false}`
→ `opacity-50` handling as `Input`.

## Connections

Uses: (no other files in this scope; imports only `react-native`)

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); expected to be used for longer free-text fields (notes,
descriptions) throughout the app, outside this scope.

Semantically related (not imports): `frontend/apps/mobile/src/components/ui/input.tsx`
— shares the same base styling and `editable === false` → `opacity-50`
convention for the single-line case.
