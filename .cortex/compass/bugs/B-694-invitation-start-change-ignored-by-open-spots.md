---
id: B-694
title: "A coach who moved the invitation start later still had students invited under the old window: open spots kept the window they opened with"
type: incomplete-rule
severity: high
status: resolved
affects:
  - notifications.invitations
  - notifications.config
  - backend/padel_app/services/notification_service.py
proposed_fix: "Invitations rule 11a: a saved invitation start re-derives invite_not_before for every open spot of the coach's future classes (primary-coach scope); a later window pauses started spots, an earlier one starts held spots; 'Yes, right now' and manual invitations are exempt."
opened: 2026-10-28T11:00:00Z
resolved: 2026-10-28T12:00:00Z
---

# B-694: an invitation-start change ignored by open spots

**Source:** the owner's report from a coach, 2026-10-27 (Linear PAD-776). The coach moved
"iniciar convites" from 7 days before at 19:30 to 2 days before at 19:00 late on 27 Oct; a student
was invited at 22:18 that evening for a class on Monday 2 Nov, four days before the new window.
Prod rows not yet read (queued with SessionH); the mechanism below is reproduced in tests.

**What happens:** the window is read from the saved configuration only where a spot opens (a
decline, the never-filled scan, a class edit, the class's `invite_start` job). A spot opened before
the window stores it once in `Vacancy.invite_not_before`; a spot opened inside it stores nothing.
The 2-minute sweep and `trigger_invitations` gate on `invite_not_before` alone, and `update_config`
re-armed the scheduler jobs (config rule 10a) without touching any open spot. So a spot started
under the old window kept running its rounds after the window moved later, and a spot held for a
later window stayed held after the window moved earlier.

**What should happen:** the coach's currently saved invitation start decides every automatic send.

**Root cause:** `notifications.invitations` rule 11 says how the window is computed and config rule
10a says the jobs follow a timing change; neither said what happens to spots already open
(incomplete rule). Same shape as B-688: a value frozen at the spot's creation.

**Fix:** rule 11a (coordinator's text). `rederive_invite_windows` in `update_config`, in the
timing's commit, whenever the saved invitation start differs from the one before. Tests red on
staging aa4f8fde (SQLite and Postgres) for a later save pausing a started spot and an earlier save
starting a held one; guards for 'Yes, right now', manual invitations and a non-primary coach's save.
Test: `backend/padel_app/tests/test_pad776_window_follows_saved_timing.py`.

**Not done here:** invitations already sent outside the new window stay live (decision (a)); none
is retired.
