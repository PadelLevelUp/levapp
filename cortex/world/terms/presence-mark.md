---
about: "The present/justified/unjustified flattening of the backend's two-column `(status, justification)` presence model, plus every layer built on the same rows:…"
permanence: changing
verified: "2026-09-03 (inferred)"
origin:
  - migrated:insight/concepts/attendance-presence-mark.md@ef7a5f3
aliases:
  - attendance-presence-mark
---

The present/justified/unjustified flattening of the backend's two-column `(status, justification)` presence model, plus every layer built on the same rows: the read/write endpoints, the client-side mark-resolution primitives (`effectiveMark`, `fromMark`, `undecidedCount`) shared once from `@levelup/config`, and the attendance/absence/presence-overview screens on both web and mobile. Web and mobile each render the same status+justification pair with a different control (segmented buttons vs. sibling Pressables, the latter chosen so Maestro can assert `accessibilityState`), but both write through the identical config mapping so the two platforms can never disagree on what a mark means.

## Implemented by
`backend/padel_app/models/presences.py`
`backend/padel_app/services/presence_overview_service.py`
`frontend/packages/config/src/presence-status.ts`
`frontend/packages/config/src/presence-status.test.ts`
`frontend/packages/api/src/resources/presences.ts`
`frontend/packages/api/src/resources/attendance.ts`
`frontend/apps/web/src/components/presences/PresenceMarkToggle.tsx`
`frontend/apps/web/src/components/presences/PresenceCharts.tsx`
`frontend/apps/web/src/components/presences/PresencePlayersTable.tsx`
`frontend/apps/web/src/components/presences/ValidateClassesDialog.tsx`
`frontend/apps/web/src/pages/AttendancePage.tsx`
`frontend/apps/web/src/pages/AbsencesPage.tsx`
`frontend/apps/web/src/pages/PresencesPage.tsx`
`frontend/apps/mobile/src/features/presences/PresenceMarkToggle.tsx`
`frontend/apps/mobile/src/features/presences/PresencesScreen.tsx`

## Related concepts
[[web-mobile-parity]]
[[effective-seat-count]]
[[coach-scoped-authorization]]

(Merged text above: `.cortex/insight/concepts/attendance-presence-mark.md`.)

## Detail from `.cortex/insight/scopes/packages/concepts/attendance-presence-mark.md`

The shared model for what a coach records about a player's attendance: the backend stores two columns (`status`: present/absent, `justification`: justified/unjustified), but every UI presents it as one three-way choice (`PresenceMark`). This concept spans the config-level mapping/precedence logic and the API endpoints that read/write it, and is why `attendance.ts` and `absence_history` deliberately share one backend resolver differing only in which `Presence.status` is selected.

**Implementing files:**
- `frontend/packages/config/src/presence-status.ts` — `toMark`/`fromMark` mapping, `effectiveMark` precedence (coach edit > stored > prefill), `undecidedCount`.
- `frontend/packages/api/src/resources/presences.ts` — `confirmClassPresences`/`validateClassPresences` (recording IS validating — no separate validate call), `unvalidateClass`, presence stats/trend/pending-validation reads.
- `frontend/packages/api/src/resources/attendance.ts` — the PAD-114/PAD-141 attended/missed history reads built on the same underlying presence rows.

**Related concepts:** none within this scope.
