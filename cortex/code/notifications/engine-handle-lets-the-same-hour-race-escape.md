---
about: A request that loses the engine's same-hour placement race answers 500 instead of retrying or refusing
permanence: changing
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
status: open
---

# B-730 — A request that loses the engine's same-hour placement race answers 500

**Source:** found while scoping B-729 (2026-11-15). Read from the code at `origin/staging` b6d320ae6; not
reproduced yet.

**What happens:** the store refuses a placement that would put a student in two overlapping sessions
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
