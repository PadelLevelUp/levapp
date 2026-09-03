---
path: frontend/apps/web/e2e/settings/seasons-i18n.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 97
size_tokens: 979
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "459cc4a1ba2fd0f8332bfeb71bb155cce318bf6e67f831eaefeaf1ea9e066d05"
---

## Purpose

PAD-51: i18n coverage for the Seasons management UI (Settings > Calendar) and
the class-recurrence controls in AddClassSheet, both of which shipped with
PAD-8 as hardcoded English strings. Asserts the localized English copy for the
Seasons section (heading, description, Add/Save buttons, form fields) and the
AddClassSheet recurrence controls (weekday initials, end-date field, the
"recurs until season end" switch and its localized helper text), and that no
raw i18n key or Portuguese-only leftover string surfaces. Asserts default
English rendering only — does not switch languages in-test, since language
switching is flaky under non-desktop viewports and would mutate the shared
seed DB (see `language-preference.spec.ts` for that pattern).

## Connections

Uses:
- ../helpers/auth: `loginAsCoach`
- ../helpers/navigation: `openSettings`, `openCalendar`

Used by: —

Semantically related (not imports): same SeasonsSection and AddClassSheet
surfaces exercised functionally by `season-recurrence.spec.ts` and
`season-upsert-safety.spec.ts`, here checked for i18n coverage instead of
behavior.
