---
path: frontend/apps/mobile/src/features/calendar/hooks.ts
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 194
size_tokens: 1301
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "4a196857151f1f7298eaf531d730ae5ff1ee2a321a794c44cd152fcb7f2c44d3"
---

## Purpose

TanStack Query mutation/query hooks covering class and calendar-block CRUD plus every notification/attendance action tied to a class instance: add/edit/remove a class, add a personal calendar block, send reminder nudges, send manual (outside-auto-invite) notifications, fetch eligible notification groups, confirm a class's training plan, confirm presences, cancel an attendance, and respond to a reminder. Every mutation routes through `useInvalidateClassData`, which invalidates the `calendar-events`, `class-instance`, and `dashboard` query keys — a mutation here can never leave any of those three caches stale. Wraps `@levelup/api`'s `calendarApi`/`classesApi`/`notificationEngineApi`/`presencesApi`/`trainingApi` resource modules.

## Connections

Uses:
- `@levelup/api` (frontend/packages/api/src/index.ts): `calendarApi`, `classesApi`, `notificationEngineApi`, `presencesApi`, `trainingApi`.
- `@levelup/types` (frontend/packages/types/src/index.ts): `AbsenceJustification`, `CalendarEvent`, `ClassInstance`, `PresenceStatus`.

Used by:
- `frontend/apps/mobile/src/features/calendar/notify-modal.tsx` (in scope): `useNotificationGroups`, `useSendManualNotifications`.

Semantically related (not imports): mirrors web's calendar mutation hooks payload-shape-for-payload-shape, so both platforms send identical request bodies for the same actions.
