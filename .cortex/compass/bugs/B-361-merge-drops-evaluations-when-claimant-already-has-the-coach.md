---
id: B-361
title: "Claim merge deletes the placeholder's evaluations and notes when the student already has the coach: the dropped coach relation cascades its children"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-10-07T19:25:54Z
affects:
  - players.claim
  - backend/padel_app/services/player_claim_service.py
proposed_fix: "Rule 5a names the rows that hang off the coach relation: before the placeholder's relation is dropped, its notes and evaluation records move to the kept relation; a same-(day, class) record merges into the kept one (ratings join where unrated, stay as history where rated, the note is appended). A second metadata guard covers every FK onto coach_in_player.id."
opened: 2026-10-07T19:25:54Z
---

# B-361 — Claim merge deletes evaluations and notes when the student already has the coach

**Source:** PAD-528 design read (Session-D, 2026-10-07), reproduced on staging `7db0e3f4a` by
`test_b361_evaluations_and_notes_survive_when_the_claimant_already_has_the_coach`
(`backend/padel_app/tests/test_player_claim_merge.py`): red with
`AssertionError: the placeholder's evaluation record was deleted by the merge`.

**What happens:** `merge_placeholder_player_into` → `_merge_coach_relations` (rule 5a). When the
claimant already has a `coach_in_player` row with a coach the placeholder also has, the claimant's
row is kept, level/side/notes are borrowed where empty, and the placeholder's row is
`db.session.delete`d. `Association_CoachPlayer.notes_list`, `.evaluations` and
`.evaluation_records` carry `cascade="all, delete-orphan"`, and the three tables FK onto
`coach_in_player.id` with `ondelete="CASCADE"`: every evaluation record, rating and strength/weakness
note the coach wrote on the placeholder is destroyed by the merge.

This is exactly the PAD-528 scenario: the coach pre-creates and evaluates a player, the student
later scans the coach's QR (PAD-212) and so already holds a relation with that coach, and the coach
then links the placeholder to them. The other branch (claimant has no relation with the coach)
re-points the row and loses nothing.

**What should happen:** rule 5 says the coach's data survives the merge; the ticket's goal names
evaluations explicitly. Nothing that hangs off the dropped relation may be lost.

**Root cause (type 2, incomplete rule):** rule 5a spoke of the relation row's own columns and the
Entities list scoped the merge to "every table with a FK to `players.id`". Evaluation records,
entries and notes FK onto `coach_in_player.id`, not `players.id`, so neither the rule nor the
`test_every_players_fk_is_covered_by_the_merge` guard ever saw them. Evaluation records (PAD-363)
were added after PAD-213 without revisiting the merge.

**Evidence:** `backend/padel_app/models/Association_CoachPlayer.py` lines 33–35 (the cascades);
`player_claim_service.py` had no reference to `coach_player_id`, `EvaluationRecord`, `EvaluationEntry`
or `CoachPlayerNote` before the fix; `git log` on the service shows no change since PAD-301.

**Affected specs:**
- Dev: `.specflow/specs/players/claim.spec.md` (rule 5a, Entities, criteria)
- Business: `.specflow/specs-business/players/coach-builds-roster.business.md` (the "what is kept"
  business rule named level, side and notes; evaluations were implied, now written)

### Change Plan

**Spec to modify:** `.specflow/specs/players/claim.spec.md` — rule 5a gains the relation's
children; Entities WRITES names `EvaluationRecord`, `EvaluationEntry`, `CoachPlayerNote`
(via `coach_in_player.id`); two criteria added (plain move; same-day record collision).
**Business spec:** the "what survives" rule says evaluations and notes too.
**Then:** red tests (done, 3), service fix (`_merge_relation_children`, `MERGED_RELATION_FK_TABLES`
guard), merge suite green, claim/evaluation regression.

### Resolution
- Spec changes: `players/claim.spec.md` rule 5a + Entities + 2 criteria; business spec rule.
- Tests added: `test_b361_evaluations_and_notes_survive_when_the_claimant_already_has_the_coach`,
  `test_b361_same_day_records_merge_into_the_claimants`,
  `test_every_coach_relation_fk_is_covered_by_the_merge`.
- Code: `player_claim_service._merge_relation_children`, called before the dropped relation is
  deleted; the relation is expired first so the ORM cascade sees no stale collection.
- Resolved: 2026-10-07 (PAD-528, PR 1).
