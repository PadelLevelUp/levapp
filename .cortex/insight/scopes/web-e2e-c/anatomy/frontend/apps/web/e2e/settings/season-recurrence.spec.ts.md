---
path: frontend/apps/web/e2e/settings/season-recurrence.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 138
size_tokens: 1301
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0b98c3128e6eb5976e07954f86f87276a999538b10992e61dbba3ec8da25813a"
---

## Purpose

PAD-8: season-based recurrence with coach-specific end dates. A coach manages
named seasons (name, start, end) in Settings > Calendar; when creating a
recurring class the coach can pick "recurs until season end" instead of typing
an explicit end date, and instance generation stops at the owning coach's
season `end_date`. Covers creating a season and confirming it persists across
reload, then (idempotently creating a season first if missing) opening the
"add class" sheet, enabling Recurring, toggling "recurs until season end" (the
manual end-date field is replaced by season-end helper text), and confirming
the created class appears on the calendar.

## Connections

Uses:
- ../helpers/auth: `loginAsCoach`
- ../helpers/navigation: `openSettings`, `openCalendar`

Used by: —

Semantically related (not imports): the Seasons management UI (SeasonsSection)
and AddClassSheet recurrence controls also exercised by
`settings/seasons-i18n.spec.ts` (i18n coverage of the same two surfaces) and
`settings/season-upsert-safety.spec.ts` (upsert-safety of the same
`/app/add_seasons` endpoint, using far-future 2027 dates specifically to avoid
colliding with this spec's today..today+3-months season).
