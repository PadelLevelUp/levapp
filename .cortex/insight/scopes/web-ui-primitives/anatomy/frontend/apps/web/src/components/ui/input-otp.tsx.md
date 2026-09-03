---
path: frontend/apps/web/src/components/ui/input-otp.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 62
size_tokens: 541
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a301658db5430d30108004cf05cb9469457a882f93dc057097f777ade4ca5423"
---

## Purpose

One-time-passcode input (`InputOTP`/`Group`/`Slot`/`Separator`) wrapping the `input-otp` library. Each `InputOTPSlot` reads its character and active/caret state from `OTPInputContext` and renders a blinking fake-caret div when the slot is the active one with no character yet.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `input-otp`: `OTPInput` (underlying input), `OTPInputContext` (per-slot state).
- `lucide-react`: `Dot`, the default separator glyph.
- `react`: `forwardRef`, `useContext`.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
