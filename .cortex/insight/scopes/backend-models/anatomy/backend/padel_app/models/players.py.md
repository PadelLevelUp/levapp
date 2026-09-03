---
path: backend/padel_app/models/players.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 3
size_lines: 171
size_tokens: 1313
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "72d69a038778aa5e69c1eb1d491af26c1c90a40f97957c332686a3dfd05d4b94"
---

## Purpose

Player is the student-side mirror of coaches.py's Coach: one-to-one with User, owning lessons_relations, presences, lesson_instances_relations, clubs_relations, coaches_relations (a player CAN have multiple coaches, e.g. across clubs) and level_history. `level` returns `level_history[0]` -- the most recently assigned level across ALL coaches, not scoped to a specific one (see Insights). `coach_player_info(coach_id)` is the canonical dict returned by the add/edit-player API endpoints; a PAD-112 comment warns it must stay in sync with an out-of-scope `_serialize_coach_player_relation` helper that builds the same shape via the same `notification_block_payload` building block, or a UI signal disappears right after an edit.

## Main players

- **Player** (lines 9-45, critical): the student entity: 1:1 User, and every relation collection to lessons/instances/clubs/coaches/level history.
- **level** (lines 42-45, supporting): 'current level' shortcut = level_history[0]; see Insights for the multi-coach ambiguity.
- **coach_player_info** (lines 108-136, critical): the canonical per-coach player-record payload used by add/edit-player endpoints (PAD-112, PAD-30).

## Insights

- `Player.level` does NOT scope by coach -- it is the single most-recently -assigned row in `level_history` across ALL of a player's coaches, ordered purely by `assigned_at`. In a multi-coach context, `Association_CoachPlayer.level_id` is the actually-correct per-coach source of truth for 'this player's level with THIS coach'; `Player.level` is a global shortcut that can silently return a different coach's most recent assignment.
- `coach_player_info`'s `validated` field is `user.password is not None` (PAD-30: has the player completed self-service registration), which is deliberately distinct from `isActive` (`user.status == 'active'`, a coach-controlled flag) -- a coach-disabled player can be `validated` but not `isActive`, and vice versa for a player mid-registration.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/users.py: User.player back_populates player, uselist=False (1:1)
- backend/padel_app/models/Association_CoachPlayer.py: coaches_relations back_populates player; coach_player_info() reads its level_id/side/notes
- backend/padel_app/models/presences.py: presences back_populates player, cascade delete-orphan
- backend/padel_app/models/player_level_history.py: level_history back_populates player, ordered desc(assigned_at)
- backend/padel_app/models/Association_PlayerLessonInstance.py: lesson_instances_relations back_populates player

## Query pointers

- If you need 'the player's level for coach X', use `Association_CoachPlayer.level_id`, not `Player.level` (that reads the most-recent history row across ALL coaches).
- If you change the add/edit-player response shape, keep `coach_player_info` in sync with the out-of-scope `_serialize_coach_player_relation` helper (PAD-112).
