---
id: B-715
title: "An absence and a coach's enrolment did not re-count the class's open spots, and a coach's enrolment closed the oldest spot, not the one of the student's side"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - notifications.invitations
  - classes.instance-enrollment
  - classes.join-requests
  - backend/padel_app/services/notification_service.py
  - backend/padel_app/services/lesson_service.py
proposed_fix: "Rule 2d gains two moments (an absence that opens a spot; a coach's enrolment), rule 13 closes the joiner's-side spot for a coach's enrolment, and instance-enrollment rule 4a runs the side-request move after it."
opened: 2026-10-30T15:30:00Z
resolved: 2026-11-03T10:50:00Z
---

# B-715: an absence and a coach's enrolment did not re-count the sides

**Source:** Linear PAD-805, sub-ticket 3 of PAD-802.

**What happened:**
- **Absence.** A cancellation, a reminder "no" or the coach's absent mark created the leaver's freed
  spot with the right side (rule 2c). The class's other open spots were not re-counted until each
  one's next batch, which could be 15 minutes or more later.
- **Coach's enrolment.** `enrol(..., "coach")` closed a spot through `reconcile_vacancies`, which
  ignored sides: a spot with no live invitation, else the oldest. It did not re-count the spots left
  open. It did not move pending requests whose side had lost its last spot to the waiting list.
- **Example.** A coach adding a right student could close the left spot. The right spot then flipped
  at its next batch and withdrew invitations that need never have gone out.

**What should happen:** both moments re-count the open spots in the operation's one commit, as a
"yes" does. A coach's enrolment closes the spot of the student's side (`vacancy_for_joiner`, as an
accepted join request does, PAD-715) and then runs `move_side_requests_to_waiting_list`.

**Root cause:** rule 2d listed the batch, a "yes", an accepted request and a side change as its
moments. It did not list these two, and nothing in the spec or code said why not (type
incomplete-rule).

**Evidence:** four tests in `test_pad805_recount_after_absence_and_coach_enrol.py` failed on staging
`318e411f5`, each at its claimed assertion. The red output is on PAD-805.

### Resolution
- **Spec:**
  - `notifications.invitations`: rule 2d has two new moments and a note that the re-counts never
    wait on a spot's lock. Rule 13 has the coach-enrolment choice. Three criteria were added.
  - `classes.instance-enrollment`: new rule 4a and one criterion.
  - `classes.join-requests`: rule 20 names the coach's enrolment.
- **Code:**
  - `_create_vacancy_for_absent_player` adds and flushes the spot, re-counts the open spots under
    the class lock, and commits once.
  - `reconcile_vacancies` takes `preferred_id`.
  - `enrol` with `source = "coach"` passes `vacancy_for_joiner`'s spot as `preferred_id`,
    re-counts the open spots before its commit, and runs the side-request move after it.
- **Tests:**
  - The PAD-805 file has 4 tests. The absence test asserts the rule 18a move of Rui's invitation,
    not a withdrawal: a right sibling spot is open.
  - `test_pad565`: the absent-mark path now ends with 6 right + 3 left spots open (8 / 8 projected).
  - `test_pad581`: the stale-spot batch test makes its spot stale with an `import` enrolment, since a
    coach's enrolment now re-counts at once.
