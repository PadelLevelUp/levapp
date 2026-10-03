---
id: B-266
title: "Editing a class at a coach's older club offered the newest club's courts, and every save failed"
type: wrong-rule
severity: low
status: resolved
affects:
  - .specflow/specs/clubs/courts.spec.md
  - frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx
  - frontend/apps/mobile/app/class/[id].tsx
  - backend/padel_app/serializers/lesson.py
  - backend/padel_app/modules/frontend_api.py
proposed_fix: "The edit form lists the courts of the class's own club (clubId in the detail payload); the 400 names courtId."
opened: 2026-10-03T02:24:14Z
resolved: 2026-10-03T02:32:25Z
---

# B-266: the class editor lists the wrong club's courts

**Source:** found while studying PAD-440 (coaches at several clubs), 2026-10-03.

**What happens:** a coach linked to two clubs (reachable today through a coach-invitation link)
edits a class at the OLDER club. The Court select lists the courts of the coach's **current**
club, which is the newest membership (`Coach.current_club`). `edit_class` validates the court
against **the class's own club** (`lesson_service.py:1345`), so every court on offer answers
400 `court_not_in_club`, on web (`ClassDetailSheet` via `listCurrentClubCourts`) and on iOS
(`class/[id].tsx` via `getCoachClub`).

**Evidence (Phase 1):** reproduced on web with
`e2e/schedule-calendar/b266-class-court-follows-class-club.spec.ts` against an isolated stack. The
seeded coach got a court on the seeded club, then created a newer club (which became the current
club) with a court of its own. Editing "E2E Academy Class" (at the seeded club), the select did
not offer the seeded club's court (line 72, element not found). Setup and cleanup verified in the
DB afterwards (one club, no courts).

**Root cause:** `clubs.courts` rule 7 told both forms to list "the coach's current club's courts",
while rule 6 validates against the class's club. For an edit those disagree as soon as a coach
has two clubs (Type 3, wrong rule). The 400 also named no field.

**Exposure:** low today. Prod counts of coaches with two clubs are pending (PAD-440 query); the
coordinator runs them.

### Change Plan
- Rule 7: the edit form lists the class's own club's courts; the detail payload carries `clubId`.
  Rule 6: the 400 carries `fields: ["courtId"]`. One criterion.
- Code: `serialize_class_instance` adds `clubId`. Web and iOS edit forms list that club's courts
  through one shared helper (`courtsForClass`). Both court-error responses add `fields`.
- Tests: the E2E above (red first). Backend tests for `clubId` and `fields`. The shared helper's
  unit test, and an iOS wiring test (mutant: the coach's current club, which must go red).

### Resolution

- Spec: `clubs.courts` rule 6 (the 400 names `courtId`), rule 7 (`clubId` in the detail; the edit
  form lists the class's own club's courts; the create form keeps the current club), one criterion.
- Code: `serialize_class_instance` adds `clubId`. `courtsApi.listCourtsForClass` (shared). Web
  `ClassDetailSheet` and iOS `class/[id].tsx` (`classCourtsQuery`) list the class's club's courts.
  Both court-error responses add `fields: ["courtId"]`.
- Tests: web E2E `b266-class-court-follows-class-club` (red first at the picker, green after).
  Backend `test_b266_class_editor_courts` (3, red first). `courtsApi` tests (+2, red against a
  stub). iOS `class-courts.test.ts` (4: the query, plus a static wiring check of the screen, red
  on the stub and on the "coach's current club" mutant).
- Found on the way, NOT fixed here: a court set on ONE occurrence of a materialised class
  (`edit_class` scope `single` on a LessonInstance) returns 200 and is dropped.
  `edit_lesson_instance_helper` never writes a court, and `lesson_instances` has no court column.
  Reported to the coordinator for its own ledger entry.
- Resolved: 2026-10-03T02:32:25Z
