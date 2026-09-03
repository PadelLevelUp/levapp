---
path: backend/padel_app/models/coaches.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 155
size_tokens: 1092
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "808e43324cff5c3725501f53b7934ac07d3ab0303871b3d7a08f29a9d67da095"
---

## Purpose

Coach is the aggregation-root hub of the coaching side: one-to-one with User, and owner of nearly every association/relation collection in this scope (clubs, lessons, lesson_instances, players, exercises/exercise groups -- owned and shared) plus direct one-to-many to CoachLevel, Season, EvaluationCategory and PlayerLevelHistory. `current_club` picks the LAST element of `clubs_relations` (ordered `desc(created_at)`), i.e. the most recently ADDED club membership, not a stored 'primary club' flag -- a coach that belongs to several clubs has an implicit, order-derived 'current' one. `name_str` duplicates `name` (both just proxy `self.user.name`); likely a leftover from before `name` existed as a property.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/users.py: User.coach back_populates coach, uselist=False (1:1)
- backend/padel_app/models/Association_CoachClub.py: back_populates coach, ordered desc(created_at) -> current_club
- backend/padel_app/models/evaluation_category.py: back_populates coach
- backend/padel_app/models/seasons.py: back_populates coach
- backend/padel_app/models/exercise.py: owned_exercises/owned_exercise_groups back_populates owner_coach
- backend/padel_app/models/player_level_history.py: player_levels back_populates coach
