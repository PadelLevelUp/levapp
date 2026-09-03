---
path: frontend/apps/mobile/src/components/ui/time-picker-input.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 3
size_lines: 168
size_tokens: 1228
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a8280dda01a2cb671c3d17caf5714eccc9eeeb01130f1e1873205df797fef6b8"
---

## Purpose

`TimePickerInput` is a `Pressable` field styled like `Input` that opens a
native time picker instead of a keyboard, with a `"HH:MM"` (24h) string (or
`""` for unset) as its value contract — the same contract the free-text
`Input` it replaces used. Platforms diverge the same way as its sibling
`date-picker-input.tsx`: Android opens the platform dialog imperatively via
`DateTimePickerAndroid.open()` with `is24Hour: true`; iOS opens the picker
as a spinner inside the shared `Dialog` primitive with explicit Cancel/Done,
since iOS's native time picker has no built-in confirm step.

## Main players

- `TimePickerInput(props: TimePickerInputProps)` (lines 59–167) — critical,
  the sole export used by callers. Owns `open`/`draft` state for the iOS
  dialog path and the `openPicker`/`confirm` handlers.
- `toDate(value: string): Date` (lines 24–31) — supporting. Parses a valid
  `"HH:MM"` string into today's `Date` with those hours/minutes set; falls
  back to the current time for anything not matching `TIME_RE`, including
  `""`.
- `toTimeString(date: Date): string` (lines 33–37) — supporting. Formats a
  `Date` back to zero-padded `"HH:MM"`; the inverse of `toDate`.
- `TimePickerInputProps` interface (lines 39–48) — supporting, exported;
  the public prop contract (`value`, `onChange`, `label`, `placeholder`,
  `error`, `disabled`, required `testID`).
- `TIME_RE` (line 22) — supporting. `/^([01]\d|2[0-3]):[0-5]\d$/`, the sole
  validity gate for `toDate`.

## Insights

- `resolvedPlaceholder` and the dialog title/field-label fallback are
  computed in the function body via `t()`, not as default parameter values
  — so they stay reactive to a language switch, avoiding the frozen-`t()`-
  in-state bug class tracked elsewhere in this codebase.
- The Pressable sets `accessibilityValue={{ text: value || resolvedPlaceholder }}`
  — a value-bearing Pressable, matching the project's convention that
  Pressables representing a settable value (not a plain action) carry
  `accessibilityValue`.
- Displays the raw `"HH:MM"` value today; locale-pretty 12h/24h display is
  an intentionally deferred follow-up per the file's own doc comment, not
  an oversight.
- Android and iOS genuinely diverge in interaction model — there is no
  single path for "what happens on picking a time"; both branches of
  `openPicker` need reading.
- This file and `date-picker-input.tsx` are structural twins (Android
  imperative branch, iOS `Dialog`-wrapped spinner branch, identical
  `open`/`draft` state shape, identical `openPicker`/`confirm` handler
  names) differing only in the regex/parse/format functions and the
  picker `mode`/`is24Hour`. A bug or UX fix found in one should be checked
  against the other.

## Connections

Uses:
- `frontend/apps/mobile/src/components/ui/button.tsx`: the Cancel/Done
  buttons in the iOS dialog footer.
- `frontend/apps/mobile/src/components/ui/dialog.tsx`: wraps the iOS
  spinner picker in `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/
  `DialogFooter`.
- `frontend/apps/mobile/src/components/ui/label.tsx`: renders the optional
  field `label` above the pressable.
- `frontend/apps/mobile/src/components/ui/text.tsx`: renders the field
  value/placeholder and the error message.

Used by: not resolvable from this scope's L1 data (no crossing-scope edges
recorded); as a form-field primitive it is expected to be consumed by
feature screens with time fields, outside this scope.

Semantically related (not imports): `frontend/apps/mobile/src/components/ui/date-picker-input.tsx`
— near-identical twin component (same Android/iOS split, same state shape,
same "" = unset string contract) for date instead of time; treat the two as
one component to reason about.

## Query pointers

If you need to change picker behavior (validation, formatting, the
Android/iOS split), also read `date-picker-input.tsx` — the same change
almost certainly applies there too.

If you need to change the confirm-step chrome (buttons, dialog shell), read
`ui/dialog.tsx` first — this file only supplies the picker content, not the
modal mechanics.
