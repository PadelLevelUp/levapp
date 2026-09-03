---
path: frontend/apps/web/e2e/settings/language-preference.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 94
size_tokens: 912
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b6f666d5dcc59c6100da3ed6ead391e8498112f2da574c117c2b05c41dbf218f"
---

## Purpose

PAD-39/PAD-40: the coach's language selector in Settings > Preferences, and
its rollout to drive the ENTIRE app UI chrome (not just notifications),
applied globally on session restore rather than only while Settings is
mounted. Asserts the selector is present, that switching to Portuguese
re-renders nav chrome live (no full reload) with Portuguese labels, and that
the choice survives a page reload (re-applied from the persisted preference,
not local component state). Always restores English afterwards, since the
E2E coach is seeded as `language="en"` and later specs match English copy.

## Connections

Uses:
- ../helpers/auth: `loginAsCoach`
- ../helpers/navigation: `openSettings`

Used by: —

Semantically related (not imports): its local `openPreferences`/
`selectLanguage` helpers are duplicated (not exported) into
`schedule-calendar/i18n-date-locale.spec.ts`, which follows the same
switch-then-restore pattern for the calendar's locale-aware date formatting.
