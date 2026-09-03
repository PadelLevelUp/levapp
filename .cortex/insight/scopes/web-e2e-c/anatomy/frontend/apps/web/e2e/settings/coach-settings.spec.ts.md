---
path: frontend/apps/web/e2e/settings/coach-settings.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 81
size_tokens: 778
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "945d139892f659fb916cbe9098579f82412164e8d612860badcdb621b1067dff"
---

## Purpose

Baseline smoke coverage (US-66..US-70) that each top-level Settings section is
reachable: Profile tab, Preferences/appearance tab, Calendar tab (asserting the
"Seasons" heading it kept after a dead-UI-cleanup commit removed the wrapping
"Calendar defaults" card), skill-levels management under Preferences, and the
Import Data tab (tolerantly skipping if the section can't be located rather
than failing outright). The loosest/most defensive spec in the folder —
several assertions fall back to alternate locators or `test.skip` rather than
asserting a single strict locator.

## Connections

Uses:
- ../helpers/auth: `loginAsCoach`
- ../helpers/navigation: `openSettings`

Used by: —

Semantically related (not imports): SettingsPage's custom `<button>`-based tab
nav (not `role="tab"`), the same pattern every other spec in this folder
navigates through.
