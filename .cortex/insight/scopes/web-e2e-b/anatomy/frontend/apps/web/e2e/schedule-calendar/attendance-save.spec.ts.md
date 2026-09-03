---
path: frontend/apps/web/e2e/schedule-calendar/attendance-save.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 109
size_tokens: 1063
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "4da8e7523a0f2c526971e84dcd4126e869df2765ec1b709f52bb2df4df29e37f"
---

## Purpose

E2E regression for PAD-64: a coach must be able to SAVE (not just view)
attendance for a RECURRING class occurrence, not only a pre-materialized
single class. Root cause (in the header comment): the confirm-presences
service branched on `'parentClassId' in class_instance_data.keys()`, but the
calendar API serializes every event with a `parentClassId` key (null for
plain `Lesson` events) — so recurring occurrences were always routed down the
`LessonInstance` id path and `get_or_404`'d. The fix branches on the event's
`model` field instead. Two parametrized-by-title tests (via the shared
`markPresentAndSave` + `assertPresentPersists` helpers) run the identical
mark-Present-and-confirm-and-reload flow against both "E2E Academy Class"
(materialized single) and "E2E Recurring Class" (recurring occurrence — the
one that 404'd before the fix), asserting the `presences/confirm` POST
returns 200 and "Present" survives a page reload for both. Notes that the
pre-existing `attendance.spec.ts` only VIEWS the roster, which is why this bug
shipped uncaught.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openCalendar`);
  `helpers/calendar-navigation` (`findClassOnCalendar`). (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises
  `POST /api/app/class_instance/presences/confirm`'s `model`-based branching
  in `lesson_service.py`, and `ClassDetailSheet.tsx`'s attendance-marking UI;
  covers `.specflow/specs/attendance/confirm.spec.md` and
  `.specflow/specs/classes/instances.spec.md` (recurring occurrence handling).
