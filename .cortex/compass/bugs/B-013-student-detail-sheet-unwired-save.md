---
id: B-013
title: "StudentDetailSheet's Level/Side selects and Save button persist nothing"
type: missing-criterion
severity: medium
status: open
affects:
  - players.profile
  - frontend/apps/web/src/components/students/StudentDetailSheet.tsx
proposed_fix: "Either wire the sheet to the level/side mutations (via @levelup/hooks) and cover it with a Playwright spec, or remove the dead controls until the behaviour is specified; fix the hardcoded 'es' locale in sideLabel to use the active i18n language."
opened: 2026-09-03T14:35:00Z
---

# B-013 — StudentDetailSheet's Level/Side selects and Save button persist nothing

The sheet renders Level and Side selects and a Save button, but the selects are uncontrolled and Save has no persistence path — it looks like an unfinished stub that a coach would reasonably believe works. `sideLabel` is also called with a hardcoded `'es'` locale (the app's locales are pt/en).

`players.profile` does not name this sheet's save behaviour, so the first step is a criterion.

*Surfaced by the initial Cortex insight extraction (web-components-c scope), 2026-09-03. Not yet re-verified by a human.*
