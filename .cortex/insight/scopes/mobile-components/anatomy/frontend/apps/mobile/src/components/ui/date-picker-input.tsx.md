---
path: frontend/apps/mobile/src/components/ui/date-picker-input.tsx
extracted_at: 2026-09-03T14:13:30Z
extraction_level: 3
size_lines: 156
size_tokens: 1163
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0cd83223e314375adb64e222660968a2322cb7d735902a8e6639e883396c8a22"
---

## Purpose

`DatePickerInput` is a `Pressable` field styled like `Input` that opens a
native date picker instead of a keyboard, with an ISO `"YYYY-MM-DD"` string
(or `""` for unset) as its value contract — the same contract the free-text
`Input` it replaces used, so callers can swap between them without changing
their state shape. Platforms diverge: Android opens the platform dialog
imperatively via `DateTimePickerAndroid.open()` (fire-and-forget, applies on
`"set"`); iOS opens the picker as a spinner inside the shared `Dialog`
primitive with explicit Cancel/Done buttons, because iOS's native date
picker has no built-in confirm step of its own.

## Main players

- `DatePickerInput(props: DatePickerInputProps)` (lines 49–155) — critical,
  the sole export used by callers. Owns `open`/`draft` state for the iOS
  dialog path and the `openPicker`/`confirm` handlers.
- `toDate(value: string): Date` (lines 25–27) — supporting. Parses a valid
  `"YYYY-MM-DD"` string via `date-fns/parseISO`; falls back to `new Date()`
  (today) for anything that doesn't match `DATE_RE`, including `""`.
- `DatePickerInputProps` interface (lines 29–38) — supporting, exported;
  the public prop contract (`value`, `onChange`, `label`, `placeholder`,
  `error`, `disabled`, required `testID`).
- `DATE_RE` (line 23) — supporting. `/^\d{4}-\d{2}-\d{2}$/`, the sole
  validity gate for `toDate`.

## Insights

- `resolvedPlaceholder` and the dialog title/field-label fallback are
  computed in the function body via `t()`, not as default parameter values
  — so they stay reactive to a language switch. A `t()` call baked into a
  default parameter would freeze at mount, the same class of bug tracked
  elsewhere in this codebase for translated labels stored in state.
- The Pressable sets `accessibilityValue={{ text: value || resolvedPlaceholder }}`
  — this is a value-bearing Pressable (it represents a settable value, not
  just a button), which is why it carries `accessibilityValue` unlike a
  plain action button.
- Displays the raw ISO string today ("Displays the raw ISO value for now" —
  the file's own doc comment); locale-pretty formatting is an intentionally
  deferred follow-up, not an oversight.
- Android and iOS genuinely diverge in interaction model (imperative
  fire-and-forget vs. modal-with-confirm) — there is no single code path to
  trace through for "what happens when the user picks a date"; you must
  read both branches of `openPicker`.
- This file and `time-picker-input.tsx` are structural twins (Android
  imperative branch, iOS `Dialog`-wrapped spinner branch, `open`/`draft`
  state shape, `openPicker`/`confirm` handlers) differing only in the
  regex/parse/format functions and the picker `mode`. A bug or UX fix found
  in one very likely needs the same fix mirrored in the other.

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
feature screens with date fields, outside this scope.

Semantically related (not imports): `frontend/apps/mobile/src/components/ui/time-picker-input.tsx`
— near-identical twin component (same Android/iOS split, same state shape,
same "" = unset string contract) for time instead of date; treat the two as
one component to reason about.

## Query pointers

If you need to change picker behavior (validation, formatting, the
Android/iOS split), also read `time-picker-input.tsx` — the same change
almost certainly applies there too.

If you need to change the confirm-step chrome (buttons, dialog shell), read
`ui/dialog.tsx` first — this file only supplies the picker content, not the
modal mechanics.
