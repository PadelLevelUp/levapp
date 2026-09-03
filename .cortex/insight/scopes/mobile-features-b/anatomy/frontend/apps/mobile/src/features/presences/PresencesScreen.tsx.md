---
path: frontend/apps/mobile/src/features/presences/PresencesScreen.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 3
size_lines: 267
size_tokens: 2270
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d13d13551cbb079bc51982ceb29b2d3151b3ff5626b7988d5e409e90d5e78c3f"
---

## Purpose

`PresencesScreen` is the coach-only "Presenças" tab on iOS (PAD-140), a phone-adapted counterpart to the web Presences page. Its own doc comment is explicit about what parity means here: the same validation inbox, the same four KPI figures, and every action a coach can take on web is still available here — only presentation differs. The web players *table* (eight numeric columns) becomes a searchable list where each row leads with a total and shows the rest as labelled chips; the 90-day trend sparkline is dropped entirely in favor of the KPI figures it summarized (mobile has no Recharts, and a 300pt-wide chart communicates less than the numbers already shown); the per-player bar chart's ranking is preserved by sorting the list by total.

## Main players

- `PresencesScreen` (lines 40–174) — critical. The screen component: owns `weekOffset`/`sheetOpen`/`query` state, wires `usePresenceStats`, `usePendingValidation`, `useValidateClasses`, `useUnvalidateClass`, and renders the validation-trigger row, the four `StatTile`s, the searchable player list, and the `ValidateClassesSheet`.
- `StatTile` (lines 176–214) — supporting. One KPI card (icon + numeric/string value + label), with a loading skeleton state and an `accessibilityValue` on the value text so Maestro/VoiceOver can read the number, not just the label.
- `PlayerRow` (lines 216–266) — supporting. One row in the searchable player list: total badge, name, and a filtered set of non-zero stat chips (private/academy/unjustified/invitesJoined), unjustified rendered in a "bad" (destructive) tone.

## Insights

- The pt-locale "0 aula" gotcha is called out inline (lines 83–84): pt's CLDR "one" plural category covers the count 0, so a naively pluralized string would render "0 aula" instead of an empty-state phrasing — the code deliberately branches on `pendingCount === 0` to use a dedicated `triggerEmpty` key instead of feeding 0 into the counted string.
- Every value-bearing element (`StatTile`'s number, `PlayerRow`) sets `accessibilityValue={{ text: ... }}` in addition to a label — a project-wide convention (see also `presences-kpi-*` testIDs) for making numeric UI state assertable by Maestro without OCR.
- Deliberately drops the trend chart and full data table (documented tradeoff, not an oversight) — every number is still present, just reshaped for a 390pt screen; this is the kind of platform-specific presentation choice the project's web/iOS parity rule explicitly allows, since the underlying data and actions are unchanged.

## Connections

Uses:
- `frontend/apps/mobile/src/features/presences/ValidateClassesSheet.tsx`: renders it as the attendance-inbox sheet, passing pending/validated queues and the validate/unvalidate mutation callbacks.
- `frontend/apps/mobile/src/features/presences/hooks.ts`: `usePendingValidation`, `usePresenceStats`, `useUnvalidateClass`, `useValidateClasses`, `weekBounds`.

Used by: no in-scope file imports this screen (no in-edges in this scope's L1 data) — it is mounted as a route/tab screen outside this scope (an `app/(tabs)/...` file, per the Expo Router convention this codebase uses elsewhere).

## Query pointers

If you need to change the validation inbox (the trigger row's pending count, or the sheet contents), read `ValidateClassesSheet.tsx` and `hooks.ts` next — this file only owns the trigger and the two mutation call sites.
If you need to change the KPI figures or the player list shape, this file and `hooks.ts` (`usePresenceStats`) are the only two files involved; the shapes come from `@levelup/types`' `PresencePlayerStats`.
