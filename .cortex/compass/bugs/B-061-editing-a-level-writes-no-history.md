---
id: B-061
title: "Editing a player's level writes no history; Player.level returns the first level forever"
type: layer-drift
severity: medium
status: resolved
affects:
  - players.edit
  - players.level-history
  - levels.player-assignment
  - backend/padel_app/services/player_service.py
  - backend/padel_app/services/player_claim_service.py
  - backend/padel_app/models/players.py
proposed_fix: "History is the record and coach_in_player.level_id its cache, written by one helper (set_roster_level) that adds the history row; every level writer goes through it; Player.level is deleted; one class-level fallback helper."
opened: 2026-09-10T19:00:00Z
resolved: 2026-09-10T21:00:00Z
---

# B-061 — Editing a player's level writes no history

**Source:** data-model audit 2026-09-02, finding M1 (PAD-270).

**What happens:** `edit_player_helper` saves the roster link through its form and writes no
`player_level_history` row, so an edited level is never recorded; create, invitation and import each
build their own row. The claim merge borrows a placeholder's level onto the claimant's link, also
without a row. `Player.level` reads the history oldest-first and returns the first level forever; no
code reads it. The class-level fallback (an occurrence's level, else its lesson's default) was
written out again in the calendar serializer instead of using `effective_level_id` (PAD-86).

**What should happen:** `players.edit` rule 2 and `players.level-history` rule 1: every level change
creates a history entry.

**Root cause:** type 6, layer drift. The specs said history on every change; four code paths wrote
the level on their own, and the edit path forgot the history.

**Evidence:** `services/player_service.py` `edit_player_helper` (the relation form only);
`services/player_claim_service.py` `_merge_coach_relations` (`mine.level_id = rel.level_id`);
`models/players.py` `Player.level`; `serializers/calendar_event.py` (`obj.level_id or
lesson.default_level_id`).

### Change plan
- One writer, `set_roster_level` in `services/level_service.py`: sets the cache and adds the history
  row when the level differs from the latest entry. Create, edit, invitation, import and the claim
  merge call it.
- Delete `Player.level`. Specs describe the cache and the record instead.
- `effective_level_id` moves to `level_service`; the notification engine re-exports it and the
  calendar serializer uses it.
- Migration `2c18f5a47c8b` backfills a history entry wherever a roster level has none, or its
  latest entry names another level. Guarded, idempotent, never fails on data.
- Tests red first; a static test keeps every other module from writing a roster level.

### Resolution
Resolved in PAD-270. See the PR for code and tests.
