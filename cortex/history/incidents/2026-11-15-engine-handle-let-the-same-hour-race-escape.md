---
about: A request that lost the engine's same-hour placement race answered 500 instead of retrying or refusing
permanence: stable
verified: "2026-11-15 (inferred)"
origin:
  - commit:e34d14967
need:
  - backend/padel_app/invitation_engine/engine.py
  - backend/padel_app/services/engine_entry.py
  - backend/padel_app/services/engine_store.py
aliases:
  - B-730
  - B-730-engine-handle-lets-the-same-hour-race-escape
---

# B-730 — A request that lost the engine's same-hour placement race answered 500

**Source:** found while scoping B-729 (2026-11-15). Read from the code at `origin/staging` b6d320ae6; reproduced by `tests/test_b730_same_hour_race.py` before the fix.

**What happened:** the store refuses a placement that would put a student in two overlapping sessions
(`TableStore._guard_same_hour`, `engine_store.py:764-776`). It locks the student's row, re-reads, and
raises `SameHourConflict` (a `UnitConflict`, `engine_store.py:86`) when another unit has just placed
them. The engine's background work catches it: `Engine.tick` (`invitation_engine/engine.py:61`) and
`_plan_unit` (`:149`) roll the session back and leave it to the next run, and `engine_runner.py:59`
catches everything per session. A request does not: `Engine.handle` lets it out, and
`engine_entry.handle` (`engine_entry.py:92`) has no catch either. So the route that sent the request
answers 500.

**Where it can surface:** any route that calls `engine_entry.handle` with a request whose unit places
someone.
- **The student's own placement:** the engine's answer to a Yes (`answers.py:173`) or a regular's return
  (`answers.py:249`), through `respond_to_invitation` (`engine_entry.py:33`) and
  `answer_attendance_request` (`:135`).
- **Another student's placement:** most requests re-plan inside the same unit, and the plan can carry
  an auto-entry placement (`planner.py:832`, `auto_entries` inside `decide`). Then the request fails
  for a student it isn't about. That covers a coach marking absent (`:226`), a waiting-list join or
  leave (`:177`, `:199`, `:214`, `:365`), the coach's add (`coach_added`, `:384`), the coach's
  per-session side (`coach_sets_side`, `:418`) and the coach's invitation by hand (`coach_invites`,
  `:449`).
- Not B-729's routes: a class-request accept places nobody through the engine.

**What should happen:** a lost race is the same refusal the engine gives when it knows beforehand, never a
500. The student's own Yes answers like a same-hour refusal (`busy_same_hour`). A request that lost only
another student's auto-entry should still succeed, with that placement left to the next run, as `tick`
does.

**Root cause:** Type 1, a missing case. The guard was written for units the runner owns
(`tick`, `_plan_unit`), which catch `UnitConflict`. The request path through `handle` was never given
the same handling.

**Evidence:**
1. `engine_store.py:86` and `:764-776`: the conflict and where it is raised.
2. `invitation_engine/engine.py:61` and `:149`: the two places that catch `UnitConflict`. `handle` has
   no catch.
3. `engine_entry.py:92-102`: `handle` calls `engine(now).handle(...)` with no catch.
4. Not reproduced: it needs two units placing the same student at overlapping hours to interleave. A
   test can stage it the way B-729's does, making the clash land after the planner's read and before the
   store's guard.

**The routes it could 500 (no catch on the path; mapped 2026-11-15 at b6d320ae6):**
- the student's Yes or the coach's Yes on their behalf to a new-engine invitation
  (`POST /api/app/notify/respond`, `/coach_respond`, `invitationId`);
- a regular's reply to the attendance reminder, and a student's cancel (`/notify/respond_reminder`,
  `/notify/cancel_attendance`);
- the waiting lists: a sorry joining (`/notify/respond_waiting_list`), the coach adding or removing
  (`/notify/class_waiting_list` POST and DELETE), and a student joining or leaving
  (`POST /api/app/class-waiting-list`, `/class-waiting-list/<id>/leave`);
- the coach's invitation by hand (`/notify/manual`), the semi-automatic answers
  (`/notify/approval/respond`, `/approval/instance/<id>/recompute`);
- a direct join (`POST /api/app/class-join-requests`) and the coach's accept of a join request
  (`/class-join-requests/<id>/accept`);
- the coach's attendance save (`/class_instance/presences/confirm`, a mark absent) and class edit
  (`/edit_class`, an add or a removal from one date).

Already wrapped in `except Exception` on their path: an old invitation's Yes on a new-engine class
(NM3), the coach's per-session side (PAD-551), and the class edit's re-plan of vacancies.
`UpdateSettings` (`/notify/config`, `flask engine pause|resume`) re-plans through `_plan_unit`, which
already caught it. The tick never reaches `handle`.

**Resolved (2026-11-15, `engine/b-730`, bba0f5f6a):** `Engine.handle` runs a request whose unit is
refused again on the committed state, up to three times, so it answers as if it had come just after the
other unit. An app-level error handler answers a `UnitConflict` that still escapes with
`409 {code: "busy_same_hour", message, clashes: []}` and logs it (`notifications.engine-answers`
rule 10; NOTIFICATIONS-ENGINE-ANSWERS-33, 34).
