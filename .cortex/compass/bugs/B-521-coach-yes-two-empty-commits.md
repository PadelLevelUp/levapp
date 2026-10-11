---
id: B-521
title: "The coach's recorded yes committed three times: enrol()'s real commit, then two empty ones from event.save() and vacancy.save(); the student's yes did the same once"
type: test-defect
severity: low
status: resolved
affects:
  - notifications.invitations
  - backend/padel_app/services/notification_service.py
  - backend/padel_app/tests/test_pad563_coach_answer_reaches_the_chat.py
proposed_fix: "Drop the save() calls after _add_player_to_instance on both yes paths; pin the coach's yes at one commit and the student's yes at no empty commit after the real one."
opened: 2026-10-09T19:24:00Z
resolved: 2026-10-10T02:30:00Z
---

# B-521 — The coach's recorded yes committed three times

**Source:** Linear PAD-596 (Session A, wave 13, 2026-10-09), found outside PAD-563's diff; the PAD-563
test recorded `['close', 'commit', 'publish:…', 'publish:…', 'commit', 'commit']`.

**What happens:** in `coach_respond_to_notification`'s `yes` branch everything that matters — the
answer, the vacancy close, the waiting-list settlement, the enrolment, the bubble edit — lands in
`enrol()`'s commit (rule 10, PAD-499). The code then called `event.save()` and `vacancy.save()`:
two more commits that wrote nothing and cost two round-trips. `respond_to_notification`'s `yes`
branch had one such `event.save()` after its enrolment.

**What should happen:** rule 10's ONE commit, and nothing after it on the accept path.

**Root cause:** the spec (rule 10) and its criterion were right; the code carried the pre-PAD-499
saves and the PAD-563 test could only pin "published after the *first* commit" — a test that
tolerated the extra commits instead of refusing them (Type 7).

**Affected specs:**
- Dev: `.specflow/specs/notifications/invitations.spec.md` (rule 10)

### Change Plan

Remove the two trailing `save()` calls on the coach path and the one on the student path.
Tighten `test_a_coach_recorded_yes_marks_the_winners_bubble_in_the_one_commit` to
`trail.count("commit") == 1`, as the coach's "no" test already does; pin the student path's
commit shape in `test_pad596_one_commit.py`.

### Resolution

- Spec changes: none (rule 10 already said ONE commit).
- Tests: `test_pad563_coach_answer_reaches_the_chat.py` (count pinned at 1),
  `test_pad596_one_commit.py` (student path).
- Code: `notification_service.py` — three `save()` calls removed after `_add_player_to_instance`.
- Resolved: 2026-10-10 (PAD-596).
