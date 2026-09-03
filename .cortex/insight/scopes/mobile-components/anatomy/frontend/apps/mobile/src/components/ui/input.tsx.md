---
path: frontend/apps/mobile/src/components/ui/input.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 2
size_lines: 23
size_tokens: 141
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5068958d8d62e7780a4454d153c9d8c5dcb0c8b74a51aeca0db4942bb823dbe0"
---

## Purpose

`Input` is the base single-line text field: a styled `TextInput` with a
fixed placeholder color, `opacity-50` when `editable={false}`, and the
standard height/border/background treatment shared with `Textarea`,
`DatePickerInput`, and `TimePickerInput`.

## Connections

Uses: (no other files in this scope; imports only `react-native`)

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); expected to be used broadly in forms throughout the app, outside
this scope.

Semantically related (not imports): `frontend/apps/mobile/src/components/ui/textarea.tsx`
— shares the same base styling (border/background/text classes,
`editable === false` → `opacity-50`, same placeholder color) for the
multiline case. `frontend/apps/mobile/src/components/ui/date-picker-input.tsx`
and `frontend/apps/mobile/src/components/ui/time-picker-input.tsx` are
explicitly designed as drop-in replacements for this component (same "" =
unset value contract), styled to look like it but opening a native picker
instead of the keyboard.
