---
id: B-501
title: "An occurrence not yet materialised whose invitation window is already open when its jobs are derived is opened by neither rule-1c path until the reminder materialises it"
type: incomplete-rule
severity: high
status: triaged
affects:
  - notifications.invitations
  - notifications.invitations rule 1c
  - notifications.config rule 10a
  - backend/padel_app/scheduler.py
related_specs:
  - .specflow/specs/notifications/invitations.spec.md
  - .specflow/specs/notifications/config.spec.md
  - .specflow/specs/notifications/semi-auto-approval.spec.md
proposed_fix: "Catch-up fire: schedule_lesson_reminder_jobs arms invite_start_lesson_<lesson>_<date> at cutoff + 2 min for an unmaterialised occurrence still ahead whose invite-start time is already past (orchestrator decision a', 2026-10-14). Id unconfirmed (Session A range B-501–502, 508–520, wave 15)."
opened: 2026-10-14T18:40:00Z
---

# B-501: an occurrence inside its window at derivation is opened by nobody

**Source:** PAD-661 (High, production), reported by a coach via Discord on 2026-10-13: semi-automatic
mode, "Iniciar convites" 7 days before at 19:30, classes in the week of 12–18 Oct with free places
and no absence, no suggestions to approve. Follow-up to PAD-540 / B-301.

**What happens:** rule 1c (B-301) gives a never-filled place two paths: a lesson-level
`invite_start_lesson_<lesson>_<date>` job for an occurrence not materialised yet, and the tick's scan
of materialised classes. `scheduler._reconcile_date_job` arms a job only for a FUTURE fire time
(config rule 10a: "a past fire time always means no job"), and `_open_never_filled_places` reads only
`lesson_instances` rows. An occurrence whose window had already opened when its jobs were last
derived — the #558 deploy itself (promotion #593, 2026-10-08), promotions 11 and 12 (10-12, 10-13),
any config or lesson save by the coach, the daily 03:17 `extend_schedule_window` pass — and that
nothing has materialised is seen by neither path. It stays silent until the reminder materialises
it; with a 7-day window and a 48 h reminder, five days late. Rule 10a even says so in words ("the
next tick, once the class exists").

**What should happen:** the suggestions (semi-automatic) or the invitations (automatic) exist from
the later of the window opening and the moment the engine can see the occurrence — and a derivation
that finds the window open IS such a moment.

## Evidence (Phase 1)

`backend/padel_app/tests/test_pad661_semi_auto_never_filled_suggestions.py` at 8878417d4 (worktree
on staging d1ab64866, SQLite, real paused APScheduler, pinned clock, 2027 dates):
- control A green: semi-auto, class materialised 12 h out with a 24 h window → the tick creates 1
  pending vacancy, 1 `ReplacementApprovalPrompt`, 1 `replacement_approval` message, 0 invitations;
- control B green: semi-auto, jobs derived at −96 h with a 72 h window → the lesson-level job fires
  at −72 h, materialises, creates the prompt;
- **gap cell red in both modes:** window "7 days before at 19:30", reminder 48 h, jobs derived at
  −5 days (inside the window), unmaterialised → no job armed, no instance, the tick opens nothing;
- "late" cell green: the reminder at −48 h materialises it and the next tick opens it.
- `git log`: PR #558 merged 2026-10-08 11:06Z, in origin/main since promotion #593 (cde8647ca);
  `scheduler.py` and `notification_service.py` on staging carry the PAD-540 code unchanged.
- Hypotheses 2–4 of the ticket (semi-auto path, restrictions, auto_invites) are not the mechanism:
  the controls show the semi-auto path; restrictions never block a prompt (`trigger_invitations`
  creates it before `_check_restrictions`); `auto_invites` is read by both paths alike.
- Production read (counts only) pending on the owner: `docs/handoffs/2026-10-14-pad-661-prod-read.sql`.

## Diagnostic tree

1. Dev spec: `notifications.invitations` rule 1c. Yes.
2. A rule covering the case? Rule 1c names two moments "the engine can see the class" and the
   derivation of a job for a window already open is neither; rule 10a removes the job for a past
   time with a pointer to the tick "once the class exists". **Incomplete rule (type 2).**
7. Drift: the business spec (`coach-approves-replacements`, `coach-fills-vacancies-automatically`)
   promises suggestions/invitations from the window; the dev layer never said when, for this case.
   Not drift: an unstated case on both layers.

### Change Plan

**Spec to modify:** `.specflow/specs/notifications/invitations.spec.md` rule 1c — **Change type:**
extend the rule + criteria. A third moment the engine can see the occurrence: a derivation
(`schedule_lesson_reminder_jobs`: a save, the startup re-arm, the daily pass) that finds the
occurrence not materialised, still ahead on the club's clock, with an invitation timing that is not
`none` and an invite-start time already past, arms `invite_start_lesson_<lesson>_<date>` for
`cutoff + 2 min` (the catch-up) instead of removing it. The runner is the same, so every gate holds
(semi-automatic approval, restrictions and the quiet-hours hold, the start-once claim, the class
lock). Materialising removes the job as before; a later derivation finds the date materialised and
arms no second catch-up. A job already armed is left alone (rule 10a's "armed at the implied time").
Criteria: the red cell (both modes); a second derivation inside the window re-arms nothing once the
occurrence exists; a materialised date never gets the catch-up (the instance path owns it); the
timing `none` arms nothing.

`.specflow/specs/notifications/config.spec.md` rule 10a: the "a past fire time always means no job"
sentence gains the invite-start exception (pointer to rule 1c); the reminder half is unchanged, so a
save still re-sends no reminder.

**Code:** `scheduler.schedule_lesson_reminder_jobs` only (the catch-up branch before the
invite-start `_reconcile_date_job`); constant `INVITE_START_CATCH_UP = timedelta(minutes=2)`.

**Then:** the four cells green/red as above; mutant M1 (catch-up removed) → gap cell red; regression
on `test_pad540_*`, `test_pad478_*`, `test_b249*`, the scheduler and invitations tests; PR-1 into
staging. Acceptance 3 of the ticket ("the coach sees why" on an empty queue) is PR-2 on the same
ticket (orchestrator, 2026-10-14): `emptyQueueReasons` on the prompt payload, web + iOS cards.

**Deploy burst (owner):** the first startup after the fix arms a catch-up for every unmaterialised
occurrence inside an open window of every engine-on coach; those classes are materialised and
opened two minutes later. Sizing read, if wanted, is the same kind of production read as above.

### Resolution

(pending)
