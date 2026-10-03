---
id: B-285
title: "A court chosen for one occurrence of a class was answered 200 and dropped"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - backend/padel_app/services/lesson_service.py
  - backend/padel_app/models/lesson_instances.py
  - backend/padel_app/serializers/calendar_event.py
  - backend/padel_app/serializers/lesson.py
  - backend/padel_app/services/court_service.py
proposed_fix: "lesson_instances.court_id (nullable, FK SET NULL, guarded migration), written as an override by both instance helpers and read before the lesson's court; a one-off class's single-scope edit writes the class's court; null for one occurrence of a series with a court is refused by name."
opened: 2026-10-03T02:33:01Z
resolved: 2026-10-03T02:51:53Z
---

# B-285: a court for one occurrence was accepted and dropped

**Source:** PAD-513, filed by Session D on 2026-10-03 from a reading while fixing B-266. The B-266 E2E asserts only "accepted", not "persisted", because of it.

**What happened:** an edit with scope `single` and a `courtId` answered 200 and stored nothing. `edit_lesson_instance_helper` and `create_lesson_instance_helper` never wrote a court, and `lesson_instances` had no court column, so the occurrence kept showing the series' court. The coach saw the save succeed.

**Wider than reported:** both editors save a class that does not recur with scope `single` (web `ClassDetailSheet.tsx` `commitEdit("single")`, iOS `class/[id].tsx` the same). So the Court select on every one-off class also went down this path: choosing or clearing a one-off class's court from either editor was dropped too. The PAD-194 tests passed because they edit with scope `future`, which the editors only use for a recurring series.

**Root cause:** `classes.edit` rule 7 said an occurrence "has no court of its own — those keys are accepted and ignored". The rule wrote the silent drop down as intended behaviour, and `clubs.courts` v1 left a per-occurrence court out of scope while both editors kept offering the Court select in every scope.

**Evidence (red before the fix, on origin/staging 8e95ece21):**
- `test_pad513_occurrence_court.py`, the materialised and not-yet-materialised paths: 200, then the card and the detail read court 1 (the series') instead of 2.
- The same file, the one-off class, run on a clean checkout of 8e95ece21: 200, then the class still shows court 1 after the coach chose court 2. Clearing a one-off class's court is the case a first draft of the fix would have refused; the test keeps it.

**Which guard should have caught it, and did not:** none existed. A save that answers 200 is not checked against a read-back anywhere generic; the court tests used the one scope the editors never send for a one-off class.

### Resolution
- Code: `LessonInstance.court_id` + `effective_court`; `_court_override` in both instance helpers (a court equal to the lesson's clears the override); `_court_ref` and the class detail read the occurrence first; a one-off class's single-scope edit writes the lesson's court; `courtId: null` for one occurrence of a series with a court is 400 `invalid_fields ["courtId"]`; a "this and future" edit that sends `courtId` clears own courts from the boundary on (`_clear_court_overrides` on the Lesson path; the LessonInstance path gets it through the instance helper); `delete_court` clears occurrences too.
- Migration `1228571ddef6` (parent `b3a1c474d07b`): guarded both ways; Postgres walk in `test_pad513_migration_postgres.py`.
- Spec: `clubs.courts` rule 9 and criteria, the display-only statement in its Intent; `classes.edit` rules 6 and 7; the business spec's rule 8.
- Clients: no product change. Wiring tests keep `courtId` in the single-scope save (web `ClassDetailSheet.court.test.ts`, iOS `class-save-flow.test.ts`).
