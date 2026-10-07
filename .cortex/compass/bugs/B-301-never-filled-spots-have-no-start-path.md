---
id: B-301
title: "A never-filled place is invited only if a one-shot job happens to be armed: the invitation start is derived at materialisation and only for a future time"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-10-07T19:47:28Z
affects:
  - notifications.invitations
  - notifications.config
  - backend/padel_app/scheduler.py
  - backend/padel_app/services/notification_service.py
proposed_fix: "A lesson-level invite_start_lesson_<lesson>_<date> job family mirroring the reminder one (materialises and triggers), and the 2-minute tick opens never-filled places for any future materialised class inside its window with free capacity and no vacancy of any status."
opened: 2026-10-07T19:28:59Z
---

# B-301: a never-filled place has no path to its first invitation

**Id unconfirmed** (Session-A's range B-301–B-320, wave 2026-10-07).

**Source:** PAD-540 (Urgent, Investigation), reported by a coach via Discord: "when a class has free
places but nobody recorded an absence, the engine sends no invitations". Reproduced by Session-A on
staging `7db0e3f4a` with `backend/padel_app/tests/test_pad540_never_filled_spots_start.py`.

**What happens:** a class with an unfilled place and no absence never gets a vacancy, so nobody is
invited, whenever the invitation window opens before a materialised occurrence with a future
invite time exists. Concretely:
1. the coach's "Iniciar convites" is at or before the first reminder (invitations 72 h before,
   reminder 48 h before): the reminder job materialises the occurrence at 48 h, the invite time is
   already past, nothing is armed;
2. reminders are `none`: nothing ever materialises the occurrence;
3. the occurrence is materialised after its window opened: the coach creates tomorrow's class
   (PAD-489, reminders rule 22, materialises at creation), opens it, or marks presences;
4. a restart that spans the fire time (`misfire_grace_time=300`).

**What should happen:** a class with an unfilled place and no absence opens a vacancy and invites
under the same pacing as an absence-created one, from the coach's "Iniciar convites" instant.

## Evidence

`test_pad540_never_filled_spots_start.py` on `7db0e3f4a` (SQLite, real paused APScheduler, pinned clock):
- cell 1 (invite 72 h, reminder 48 h, unmaterialised): no `invite_start_*` job after the lesson
  derivation; the reminder at 48 h materialises the occurrence with no start job; ticks at 47, 24
  and 2 h: **0 vacancies, 0 invitations**. Red.
- cell 2 (defaults, occurrence materialised 12 h before the class): `schedule_instance_jobs` arms
  nothing; ticks at 11, 6 and 2 h: **0 vacancies, 0 invitations**. Red.
- control 3 (same class, `trigger_invitations` called by hand inside the window): 1 structural
  vacancy, 1 invitation. Green: the engine is fine, the call is missing.
- control 4 (defaults, reminder first): the reminder materialises, `invite_start` armed at 24 h,
  fires, 1 vacancy, 1 invitation. Green.
- `scheduler.py` and `notification_service.py` are identical on `origin/main`: live on prod.

## Root cause

Never-filled places are created only by `_create_structural_vacancies`, reached only from
`trigger_invitations` (`_find_or_create_open_vacancies`). For a class with no absence the only
caller is the `invite_start_<instance>` DateTrigger (`scheduler._run_trigger_invitations`), derived
in `schedule_instance_jobs` — which needs a `LessonInstance` row — through `_reconcile_date_job`,
which arms nothing for a past fire time (config rule 10: "a past fire time always means no job and
nothing sent"). The startup re-arm and the daily pass use the same derivation, so they do not heal
it. The tick (`process_invitation_batches`) reads only existing `Vacancy` rows. An absence has its
own path (`_ensure_vacancy_for_player` writes the row; the tick starts it, B-200 made the sweep gate
it); a never-filled place has none.

## Diagnostic tree

1. Dev spec: `notifications.invitations` rule 1 ("never-filled places get theirs, as before, when
   the class has no open vacancy") and rule 11 (when the window opens); `notifications.config`
   rule 10 (job derivation). Yes.
2. A rule covering the case? Rule 1 says never-filled places get vacancies but not **what opens
   them** when the window is already open or the occurrence does not exist yet; rule 10 was
   written for reminders (B-249) and says a past time arms nothing, with no exception for a
   window that is open and a class still ahead; reminders rule 22 (PAD-489) covers a class
   created after its reminder time but says nothing about its invitation window.
   **Incomplete rule.**

## Change plan

**Specs to modify:**
- `.specflow/specs/notifications/invitations.spec.md`: new rule 1c (numbering unconfirmed) — a
  never-filled place is opened at the later of its window opening and the moment the engine
  can see it: an occurrence not yet materialised gets a lesson-level start job; a materialised
  class inside its window with free capacity, automatic invitations on and no vacancy of any
  status is opened by the next tick, under the same restrictions (rule 6d) and the start-once
  claim (rule 1b). Criteria: the four cells above, plus "a save or a deploy that lands inside an
  open window opens the class's places on the next tick" (decision 2, pending) and "a class with a
  filled or expired vacancy is not reopened by the tick".
- `.specflow/specs/notifications/config.spec.md` rule 10: the "past time means no job" sentence
  gains the pointer to invitations rule 1c (the tick opens the places; the save still sends
  nothing itself).

**Code:**
- `scheduler.py`: `invite_start_lesson_<lesson>_<date>` jobs armed by
  `schedule_lesson_reminder_jobs` beside the reminder ones (materialise + `trigger_invitations`);
  cancelled with the occurrence job; removed on materialisation like the reminder pair (B-097).
- `notification_service.process_invitation_batches`: before the vacancy loop, open never-filled
  places for future materialised classes whose window is open (`invite_not_before` semantics of
  rule 11), with free capacity, auto-invites on, no vacancy of any status, through
  `trigger_invitations` so every existing gate applies.

**Then:** tests (the four cells turn green; a mutant removing the tick's scan turns cell 2 red; a
mutant removing the lesson job turns cell 1 red), regression on the invitation spine named in the
2026-10-06 handoff §9, Postgres race cells for the tick (two ticks at once open one class once —
rule 1b's claim covers the start; the creation is under the class lock, PAD-261).

**Decisions pending (coordinator):** fix shape (a)+(c) vs (b); deploy burst vs watermark.

## Resolution

Session-A, 2026-10-07, branch `feature/pad-540` (commits 5afa4e7e4 reproduction, 82090103c fix,
ce916b667 and b119dd3b7 review fixes). Decisions by the coordinator 0710-orchestrator: shape
(a)+(c); the deploy burst accepted pending a count on the staging database; the watermark is a
one-line addition in the scan.
- **Spec:** `notifications.invitations` rule 1c + seven criteria (numbering unconfirmed);
  `notifications.config` rule 10 pointer; compass R-010 lists the new job family and its two
  invariants.
- **Code:** `scheduler.py` — `_run_invite_start_for_lesson_occurrence`, the
  `invite_start_lesson_<lesson>_<date>` family armed by `schedule_lesson_reminder_jobs`, the
  `_OCCURRENCE_JOB_FAMILIES` table walked by cancel/move/prune, materialisation removes the pair;
  `notification_service.py` — `_open_never_filled_places` called by `process_invitation_batches`.
- **Tests:** `test_pad540_never_filled_spots_start.py` (9 SQLite + 1 Postgres cell). Mutants M1
  (count before the class lock, Postgres) → race cell red; M2 (scan removed) → cell 2 red; M3
  (lesson arming removed) → cell 1 red; M4 (pair not removed) → pair red; M5 (asks suppression
  removed) → roster-ask cell red.
- **Known limit, named in rule 1c:** the tick's "no vacancy of any status" pre-filter skips a
  class whose one absence vacancy was filled before the window while another place was never
  filled; `trigger_invitations` by hand still opens it.
