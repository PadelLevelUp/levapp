---
id: B-035
title: "Deleting a coach level deletes every player at that level, with their notes and evaluations, or 500s"
type: incomplete-rule
severity: critical
status: triaged
affects:
  - levels.coach-levels
  - backend/padel_app/models/coach_levels.py
  - backend/padel_app/models/Association_CoachPlayer.py
  - backend/padel_app/modules/frontend_api.py
proposed_fix: "Drop the ORM cascade; ON DELETE SET NULL on the four level FKs and the two invited_by_coach_id FKs (idempotent migration); a delete service that unassigns before it deletes."
opened: 2026-09-10T02:40:00Z
---

# B-035 — Deleting a coach level deletes every player at that level, with their notes and evaluations, or 500s

**Source:** data-model audit 2026-09-02, findings C2 and H7 (`.cortex/archive/documents/data-model-audit-2026-09-02/extracted/findings.md`), re-verified on `origin/staging` 58e7ab0 on 2026-09-10 (PAD-255).

**What happens:** `POST /api/app/delete/coach_level` (`backend/padel_app/modules/frontend_api.py:1977`) calls `rel.delete()`. `CoachLevel.coach_player_relations` (`models/coach_levels.py:26-29`) carries `cascade="all, delete-orphan"`, so every `coach_in_player` row at that level is deleted, and each of those cascades into `coach_player_notes` and `evaluation_entries`. The audit's probe: 1 roster row, 1 note, 1 evaluation before; 0, 0, 0 after. When a lesson, instance or vacancy references the level, Postgres refuses the delete instead (NO ACTION on `lessons.default_level_id`, `lesson_instances.level_id`, `vacancies.level_id`) and the click 500s. H7: `coach_invitations.invited_by_coach_id` and `player_invitations.invited_by_coach_id` are NO ACTION too, so a coach who ever sent an invitation cannot be deleted.

**What should happen:** removing a rung from the ladder unassigns it — players, classes, occurrences and open spots that pointed at it simply have no level — and nothing else changes. Deleting a coach detaches their invitations' "invited by" pointer.

**Root cause:** Type 2, incomplete rule. `levels.coach-levels` rule 6 lists DELETE among the CRUD verbs and the business spec says the coach "can … delete levels at any time", but no rule says what a delete does to the rows that reference the level. The ORM cascade was added to make the delete succeed against the roster's NO ACTION FK, and it "succeeded" by deleting the roster.

**Evidence:**
1. `models/coach_levels.py:26-29` — the cascade.
2. `models/Association_CoachPlayer.py:22`, `models/lessons.py:33`, `models/lesson_instances.py:29`, `models/vacancy.py:31`, `models/coach_invitation.py:26`, `models/player_invitation.py:25` — six FKs with no `ondelete`.
3. `grep -rn "delete_coach_level" backend/padel_app/services` — no service; the route deletes the row directly.

**Affected specs:**
- Dev: `.specflow/specs/levels/coach-levels.spec.md`
- Business: `.specflow/specs-business/levels/coach-defines-and-assigns-skill-ladder.business.md`

### Change Plan

**Spec to modify:** `.specflow/specs/levels/coach-levels.spec.md`
**Change type:** Add rule + acceptance criteria

**Add this rule:**
11. Deleting a level unassigns it, never deletes what held it: roster rows keep their notes and evaluations with `level_id = NULL`; lessons, instances and vacancies at that level get `NULL`; the six FKs are `ON DELETE SET NULL`; level history rows of that level go with it.

**Then:**
1. Tests (`test_pad255_level_delete_keeps_roster.py`), watched red first.
2. Drop the cascade; `ondelete="SET NULL"` on the six columns; `delete_coach_level_service` that unassigns in Python before deleting (so the guarantee holds where FK actions do not run, e.g. SQLite tests).
3. Idempotent migration rewriting the six FKs by column.
4. Regression: backend suite; no client change (web and iOS already call the same route).

### Resolution

_Pending._
