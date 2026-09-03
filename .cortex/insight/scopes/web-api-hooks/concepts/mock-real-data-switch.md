---
name: mock-real-data-switch
---

# mock-real-data-switch

The dominant pattern across `frontend/apps/web/src/api/*.ts`: nearly every resource wrapper function checks `USE_MOCK_DATA` (from `@/config`, outside this scope) and either returns a canned/derived value from `frontend/apps/web/src/data/mockData.ts` or `mockAttendance.ts`, or delegates to the matching `@levelup/api/src/resources/<name>` module. Mock writes typically `console.log` and return a synthetic success object without persisting (`classes.ts`, `coachLevel.ts`, `evaluation.ts`, `register.ts`); `training.ts` instead mutates local copies of the mock arrays so CRUD actually persists across calls in a session. `presences.ts`'s PAD-140 aggregate functions deliberately omit the mock branch entirely — coach-only endpoints with no fixture to fake. Thin re-export barrels (see [[thin-resource-reexport-barrel]]) have no mock branch at all.

**Implementing files:**
- `frontend/apps/web/src/api/absences.ts`, `attendance.ts`, `auth.ts`, `calendar.ts`, `classes.ts`, `coachLevel.ts`, `dashboard.ts`, `evaluation.ts`, `messages.ts`, `players.ts`, `register.ts`, `training.ts`, `users.ts` — the `if (USE_MOCK_DATA) { ... } return xApi.y(...)` shape.
- `frontend/apps/web/src/api/presences.ts` — mixes both: two legacy functions have a mock branch, four PAD-140 functions don't.
- `frontend/apps/web/src/data/mockData.ts`, `data/mockAttendance.ts` — the fixture data every mock branch reads from.

**Related concepts:** [[thin-resource-reexport-barrel]] — the sibling pattern for resources with no mock behavior to add.
