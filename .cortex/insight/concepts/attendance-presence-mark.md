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
