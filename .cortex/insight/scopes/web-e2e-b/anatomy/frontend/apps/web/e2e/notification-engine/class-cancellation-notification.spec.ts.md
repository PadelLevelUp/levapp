---
path: frontend/apps/web/e2e/notification-engine/class-cancellation-notification.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 80
size_tokens: 803
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "36fa5f1ac2ab29a1fb2900b0f1c041df86649897cce8693e9d3b7d3e26368b00"
---

## Purpose

E2E for PAD-75: when a coach cancels/deletes a scheduled class that has an
enrolled student, the student must automatically receive an in-app
cancellation notification — a message in their coach<->student conversation,
via the same delivery channel as other class notifications. The single test
creates its own dedicated class (never mutating the shared seeded "E2E
Academy Class"), enrols the seeded student via the PlayerSelector "All" tab,
deletes it as the coach (confirming the non-recurring delete dialog), then
switches identity (`page.context().clearCookies()` + `loginAsStudent`) and
asserts a message matching `/cancell?ed/i` appears in the student's
conversation with the coach.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`, `loginAsStudent`); `helpers/navigation`
  (`openCalendar`, `openMessages`). (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises class deletion in
  `backend/padel_app/services/lesson_service.py` and the cancellation-message
  fan-out in `notification_service.py`; covers
  `.specflow/specs/notifications/_overview.md` / class-cancellation delivery.
  Shares the local `findClass` next-week-scan helper pattern with
  `class-delete-confirm.spec.ts` and `class-deletion.spec.ts` in
  `schedule-calendar/` (each file defines its own copy rather than importing
  a shared one).
