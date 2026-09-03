---
path: frontend/apps/web/e2e/schedule-calendar/recurring-occurrence-delete.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 94
size_tokens: 908
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "dd2541497113a81d04ff645dbeea8ee55f864e3ce99383d8004cde81a9617b09"
---

## Purpose

PAD-65 regression test: deleting a single occurrence of the seeded weekly
"E2E Recurring Class" must keep it gone on reload. The bug: `recurrence_end`
is inclusive and a bare date coerces to end-of-day, so removing one occurrence
left the deleted date still covered by the (split) parent recurrence, and the
occurrence re-projected on reload. Locates the occurrence's week, deletes it
with scope "single" via the UI (waiting for the `remove_class` network
response), reloads, and asserts a per-week count of 0 on that week while the
following week's occurrence remains. Notes the materialized-instance variant
of this bug is covered separately by the backend
`test_recurring_delete_exclusion.py`.

## Connections

Uses:
- ../helpers/auth: `loginAsCoach`
- ../helpers/navigation: `openCalendar`
- ../helpers/calendar-navigation: `goToNextWeek`

Used by: —

Semantically related (not imports): same seeded "E2E Recurring Class" fixture
and weekday convention as `recurring-class-weekday.spec.ts`; exercises the
`remove_class` route's single-occurrence-scope deletion path also covered by
the backend's `test_recurring_delete_exclusion.py`.
