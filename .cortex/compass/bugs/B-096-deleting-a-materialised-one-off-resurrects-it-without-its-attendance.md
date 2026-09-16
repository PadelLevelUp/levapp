---
id: B-096
title: "Deleting a materialised one-off class deleted only its instance — the class came back without its attendance"
type: incomplete-rule
severity: high
status: triaged
affects:
  - classes.delete
  - backend/padel_app/services/lesson_service.py
proposed_fix: "A one-off has exactly one occurrence, so removing its materialised instance removes the Lesson too (cascade), cancels both reminder jobs and answers `deleted`; the confirmation dialogs say when marked attendance goes with the class."
opened: 2026-09-16T16:20:00Z
---

# B-096 — Deleting a materialised one-off class resurrected it without its attendance

**Source:** weekly QA sweep 2026-09-13 (report F-10), ticket PAD-335. Reproduced here by
`backend/padel_app/tests/test_pad335_delete_materialised_one_off.py` (both cases red before the
fix). Bug number self-assigned from Session B's reserved range B-096..B-100 (unconfirmed).

**What happens:** a coach creates a one-off class, marks and confirms attendance, and the
calendar refetches. Confirming attendance materialised a `LessonInstance`, so the card now
carries `model=LessonInstance`. Delete class → `POST /api/app/remove_class` returns 200
`{"status": "deleted"}`. `_dispatch_remove_class` deletes the instance and, because the parent
`Lesson` has no `recurrence_rule`, returns without touching it. The next calendar fetch projects
the parent again as a fresh occurrence: `confirmedCount: 0`, edits reverted, "Mark attendance"
back. The dialog promised permanent removal; the register is what got removed.

**What should happen:** a one-off has exactly one occurrence, so "delete this class" and
"delete this occurrence" are the same act: the Lesson, its instance, its presences and both
reminder jobs (`reminder_<instance>` and `reminder_lesson_<lesson>_<date>`) go together, and no
later fetch shows the class in any state.

**Root cause:** `classes.delete` rule 2 ("`DELETE lesson_instance` deletes a single instance")
never said what the parent does when the instance is the only occurrence. The PAD-65 fix added
the recurring branch (exclude the date from the series) and left the non-recurring branch as a
bare instance delete; the test that covered it
(`test_delete_single_instance_of_non_recurring_lesson_still_deletes`) asserted the instance was
gone and never asked about the Lesson or the calendar.

**Evidence that selected the type:** the reproduction shows `Lesson.query.get(lesson_id)` still
present after a 200, and `get_lesson_instances_in_range` returning the occurrence again with
`model=Lesson`; the instance's job is cancelled but the lesson-occurrence job is not.

**Affected specs:**
- Dev: `.specflow/specs/classes/delete.spec.md`
- Business: `.specflow/specs-business/classes/coach-schedules-recurring-classes.business.md`
  (rule "Deleting a whole class removes every occurrence and any reminders still pending for
  it" already states the outcome; no drift)

### Change Plan

**Spec to modify:** `.specflow/specs/classes/delete.spec.md`
**Change type:** Add rules 5–7 + two acceptance criteria (see the spec).

**Then:**
1. `_dispatch_remove_class`, `LessonInstance` + `single` branch: after deleting the instance,
   always run `_remove_single_occurrence_from_lesson(parent, occ_date)` — it already deletes a
   non-recurring parent and cancels its occurrence job; answer `deleted` for a one-off and
   `single_removed` for a recurring occurrence.
2. Web `ClassDetailSheet` and mobile `class/[id]` delete dialogs: when attendance has been
   marked, say it will be removed with the class.
3. Playwright `e2e/schedule-calendar/pad335-delete-materialised-one-off.spec.ts`: create, mark,
   confirm, refetch, delete, refetch, assert absent from `GET /api/app/calendar`.

### Review round (Session A, 2026-09-16; fixed the same day)

Two sibling branches of the same defect, both inside rule 7's "never 2xx with the occurrence
still visible":
- **F2, recurring series.** The web sheet keeps `event.model="Lesson"` after confirming
  attendance, so "delete this occurrence" arrives as `model=Lesson, scope=single` on a date that
  now has an instance. `split_lesson` moves only instances after the date and
  `build_lesson_events` re-appends any instance the projection did not render, so the occurrence
  came back with its register after 200 `single_removed`. `_remove_single_occurrence_from_lesson`
  now deletes the instance(s) on that date (jobs cancelled) before excluding it.
- **F3, one-off + `scope=future`.** Both shells hide the scope choice for a one-off, but a stale
  client or crafted body could send it; the truncation did nothing on a lesson with no
  recurrence (200, occurrence still there) or, on the instance, deleted it and let the parent
  re-project (the original symptom). A one-off's `future` is now the whole-class delete.
- F1 (nothing refuses; the register goes with the class the coach confirmed deleting) is rule 7
  by design; F4 (superadmin generic deletes bypass the service) is by design — one sentence on
  the ticket, no change.

### Resolution

- Spec changes: `.specflow/specs/classes/delete.spec.md` (rules 5–7, two criteria)
- Tests added: `backend/padel_app/tests/test_pad335_delete_materialised_one_off.py`,
  `frontend/apps/web/e2e/schedule-calendar/pad335-delete-materialised-one-off.spec.ts`
- Code changes: `lesson_service._dispatch_remove_class`; delete dialog copy on web and iOS
- Resolved: pending (PAD-335 PR)
