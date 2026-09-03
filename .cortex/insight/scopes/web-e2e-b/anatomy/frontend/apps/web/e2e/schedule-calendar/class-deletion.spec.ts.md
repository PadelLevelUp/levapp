---
path: frontend/apps/web/e2e/schedule-calendar/class-deletion.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 85
size_tokens: 875
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "cb68942f2f8d54b68f923170823c4a98fab129df69b14fecb3434c6c6b68cea9"
---

## Purpose

E2E for PAD-10: deleting a class must surface success (not an error toast)
for both a non-recurring class and a single occurrence of a recurring class.
Test 1 creates a dedicated "Delete Target Class" (avoiding mutation of the
shared seeded class), opens its detail sheet, confirms the PAD-58
`alertdialog`, and asserts "Class deleted" appears while "Delete failed" does
not, and the class disappears from the grid. Test 2 deletes a single
occurrence of the seeded recurring "E2E Recurring Class" via its scope dialog
("Only this class"), asserting the same success/no-failure outcome.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openCalendar`).
  (Scope `web-e2e-a`.) Defines a local `findClass` helper duplicated from the
  identical one in `class-delete-confirm.spec.ts` in this same directory.
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises the delete route in
  `lesson_service.py` (both `Lesson`/single and `LessonInstance`/recurring
  branches) and `ClassDetailSheet.tsx`'s delete + recurrence-scope dialogs;
  covers `.specflow/specs/classes/delete.spec.md` and
  `.specflow/specs/classes/recurrence.spec.md`.
