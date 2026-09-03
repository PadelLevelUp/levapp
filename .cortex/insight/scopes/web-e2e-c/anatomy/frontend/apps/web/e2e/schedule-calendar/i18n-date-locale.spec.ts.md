---
path: frontend/apps/web/e2e/schedule-calendar/i18n-date-locale.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 131
size_tokens: 1439
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "257cea62cbe6d93af078d8b7faa4c8eb4911fd6a7cae15b3bb835a4bd2376aaa"
---

## Purpose

PAD-52 regression test: several calendar components used to hardcode
date-fns `enUS`/`enGB` locale objects, so weekday/month labels stayed English
regardless of the coach's selected UI language, and `MobileCalendarView` leaked
a stray Portuguese `'de'` literal into an English-formatted date string. Pins
that mobile day-header formatting has no stray "de" and shows an English month
by default, and that switching to Portuguese in Settings flips the desktop
weekday header labels (and no English abbreviation survives). Restores English
afterwards so later specs keep matching English copy — mirrors the pattern in
`settings/language-preference.spec.ts`. All language switching happens at the
desktop viewport only.

## Connections

Uses:
- ../helpers/auth: `loginAsCoach`
- ../helpers/navigation: `openCalendar`, `openSettings` (used by the locally-defined `openPreferences`)

Used by: —

Semantically related (not imports): the fix routes every date-format call site
through `dateFnsLocale(i18n.language)` in `apps/web/src/lib/dateLocale.ts`,
touching `MobileCalendarView.tsx`, `CalendarHeader.tsx`, `EventDetailSheet.tsx`,
`RescheduleDialog.tsx` and `ClassDetailSheet.tsx`; `openPreferences`/
`selectLanguage` are duplicated from `settings/language-preference.spec.ts`
(not exported there).
