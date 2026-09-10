---
id: B-013
title: "StudentDetailSheet's Level/Side selects and Save button persist nothing"
type: missing-criterion
severity: medium
status: resolved
affects:
  - players.profile
  - frontend/apps/web/src/components/students/StudentDetailSheet.tsx
proposed_fix: "Either wire the sheet to the level/side mutations (via @levelup/hooks) and cover it with a Playwright spec, or remove the dead controls until the behaviour is specified; fix the hardcoded 'es' locale in sideLabel to use the active i18n language."
opened: 2026-09-03T14:35:00Z
fixed: 2026-09-04T00:00:00Z
fixed_by: PAD-167
verified: 2026-09-09 (PAD-178)
---

# B-013 — StudentDetailSheet's Level/Side selects and Save button persist nothing

The sheet renders Level and Side selects and a Save button, but the selects are uncontrolled and Save has no persistence path — it looks like an unfinished stub that a coach would reasonably believe works. `sideLabel` is also called with a hardcoded `'es'` locale (the app's locales are pt/en).

`players.profile` does not name this sheet's save behaviour, so the first step is a criterion.

*Surfaced by the initial Cortex insight extraction (web-components-c scope), 2026-09-03. Not yet re-verified by a human.*

## Resolution (PAD-178, verified 2026-09-09)

The "remove the dead controls" option happened before this ledger entry was picked up:
PAD-167 (`2bf0b0fa`, 2026-09-04) deleted `StudentsPage.tsx` and with it
`components/students/StudentDetailSheet.tsx`, including its uncontrolled Level/Side selects,
the no-op Save and the hardcoded `sideLabel(..., 'es')`. Nothing imports either file on
`staging`. A coach edits a player's level and side on the player detail page (players.profile /
players.level-history), which is wired to the real mutations and covered by Playwright, so
`players.profile` needs no new criterion for a sheet that no longer exists.
