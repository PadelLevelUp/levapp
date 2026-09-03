---
path: backend/padel_app/tests/test_player_level.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 152
size_tokens: 1295
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8d46507dd284c5aaece38e97cf853c11495bf2990a6bcdbc1d3a41b0418788f1"
---

## Purpose

Regression tests locking in that a player's `levelId` always serializes as a `str` (matching how `CoachLevel.id` is serialized), so the frontend level `<Select>` can match its option value by string equality. Covers `player_service.edit_player_service` (returns `levelId` as `str(level.id)`), `player_service.get_coach_players_list` (both `row["levelId"]` and `row["level"]["id"]` are strings and equal to each other; a player with no level serializes `levelId: None` and omits the `level` key entirely), and `Player.coach_player_info()` (same None-vs-string contract via the model serializer used elsewhere). Also pins PAD-30: `row["validated"]` (and `Player.coach_player_info()["validated"]`) is `True` only once `player.user.password` is set (PAD-32 self-service completion), independent of the `active`/`status` flag.

## Connections

- Uses: `padel_app.tests.helpers.make_coach` (scope `backend-tests-a`, not in this scope), `padel_app.services.player_service` (`edit_player_service`, `get_coach_players_list`), `padel_app.models.User`, `padel_app.models.Player`, `padel_app.models.Association_CoachPlayer`, `padel_app.models.coach_levels.CoachLevel`, `padel_app.models.coaches.Coach`, `padel_app.sql_db.db`; the `app` fixture from `conftest.py` (scope `backend-tests-a`). Docstring points to `padel_app/services/player_service.py::_serialize_coach_player_relation` and `padel_app/models/players.py::Player.coach_player_info` as the fix locations (both in scope `backend-services`/`backend-models`).
- Used by: —
- Semantically related (not imports): none identified.
