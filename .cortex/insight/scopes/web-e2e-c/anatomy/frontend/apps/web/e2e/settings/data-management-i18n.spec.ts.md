---
path: frontend/apps/web/e2e/settings/data-management-i18n.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 113
size_tokens: 1316
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "958b2df4fd5f1b24adb28e6afc75df7760ca2d6d576911ec41dab210a11c0db6"
---

## Purpose

PAD-54: i18n localization coverage for Settings > Import Data labels. Covers
two surfaces: `DataImportSection`'s `SELECTABLE_TABLES` labels (e.g.
"Players", "Classes in Classes") render as localized English text once a CSV
file is picked (table-selection step, before any AI-analysis call fires), and
`ImportHistorySection`'s raw API status ("active"/"reverted") renders as a
localized capitalized label ("Active"/"Reverted"), not the raw lowercase
string. Both tests additionally scan the full body text for a raw-i18n-key
regex pattern to catch any leaked key. The English-only assertion strategy
follows i18n-e2e-default-locale-gotcha (coach seeded with `language="en"`).

## Connections

Uses:
- ../helpers/auth: `loginAsCoach`, `COACH_USERNAME`, `COACH_PASSWORD`
- ../helpers/navigation: `openSettings`
- fs, os, path: writes a temp CSV file for the file-input upload

Used by: —

Semantically related (not imports): DataImportSection and ImportHistorySection
components (Settings > Import Data tab); posts through
`/api/app/import/confirm` and `.../import/{id}/revert`.
