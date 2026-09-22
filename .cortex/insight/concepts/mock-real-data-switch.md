The dominant pattern across `frontend/apps/web/src/api/*.ts`: nearly every resource wrapper checks `USE_MOCK_DATA` and either returns a canned/derived value from `data/mockData.ts` or `mockAttendance.ts`, or delegates to the matching `@levelup/api/src/resources/<name>` module. Mock writes typically `console.log` and return a synthetic success object without persisting (`classes.ts`, `coachLevel.ts`, `evaluation.ts`, `register.ts`); `training.ts` instead mutates local copies of the mock arrays so CRUD actually persists across calls in a session. `presences.ts`'s PAD-140 aggregate functions deliberately omit the mock branch entirely — coach-only endpoints with no fixture to fake. `thin-resource-reexport-barrel` is the sibling pattern for resources with no mock behavior to add at all.

## Implemented by
`frontend/apps/web/src/api/absences.ts`
`frontend/apps/web/src/api/attendance.ts`
`frontend/apps/web/src/api/auth.ts`
`frontend/apps/web/src/api/calendar.ts`
`frontend/apps/web/src/api/classes.ts`
`frontend/apps/web/src/api/coachLevel.ts`
`frontend/apps/web/src/api/dashboard.ts`
`frontend/apps/web/src/api/evaluation.ts`
`frontend/apps/web/src/api/messages.ts`
`frontend/apps/web/src/api/players.ts`
`frontend/apps/web/src/api/register.ts`
`frontend/apps/web/src/api/training.ts`
`frontend/apps/web/src/api/users.ts`
`frontend/apps/web/src/api/presences.ts`
`frontend/apps/web/src/data/mockData.ts`
`frontend/apps/web/src/data/mockAttendance.ts`

## Related concepts
[[thin-resource-reexport-barrel]]
