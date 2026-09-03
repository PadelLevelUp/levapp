---
path: frontend/apps/web/e2e/notification-engine/cancel-attendance-class-view.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 108
size_tokens: 1252
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5b4f99f53eb8e1cb5c596adaf7985273b375c8263847f4d8b21c167f9ea89cb0"
---

## Purpose

E2E for PAD-46: proves a student can cancel their attendance directly from the
enrolled class's calendar class-detail view (the `[role="dialog"]` opened by
clicking the class), not only from a chat reminder bubble. The single test
confirms attendance via `respond_reminder`, logs in as the student, opens the
seeded "E2E Academy Class" detail sheet, clicks the "Cancel attendance"
button, confirms the `[role="alertdialog"]`, and asserts the same
`POST /api/app/notify/cancel_attendance` call the reminder-bubble path uses —
then checks via the coach's `/lesson_instance/{id}/presences` endpoint that
the student's presence reverted to `status: absent, justification: justified`,
exactly like a reminder decline. Deliberately scoped to the pre-deadline
("normal") cancel path only — the seeded class instance is always far in the
future, so the past-deadline "late cancellation" 409 is left to the backend
unit test (PAD-43) rather than forced here.

## Connections

- Uses: `helpers/api` (`API_APP`, `API_AUTH` base URLs) — for direct login and
  presence-check calls; `helpers/auth` (`loginAsStudent`) — UI login;
  `helpers/navigation` (`openCalendar`) — reach the calendar; `helpers/calendar-navigation`
  (`findClassOnCalendar`) — page forward until the seeded class is visible.
  (These helpers live in scope `web-e2e-a`.)
- Used by: — (Playwright entry point; not imported by any other file in this
  scope or `edges_within_scope`)
- Semantically related (not imports): exercises the `POST /api/app/notify/cancel_attendance`
  route in `backend/padel_app/modules/notification_engine_api.py` and the
  cancel/decline logic in `backend/padel_app/services/notification_service.py`;
  covers `.specflow/specs/attendance/confirm.spec.md` rule 9. Sibling of
  `cancel-attendance.spec.ts` (API-only version of the same rule) in this
  scope.
