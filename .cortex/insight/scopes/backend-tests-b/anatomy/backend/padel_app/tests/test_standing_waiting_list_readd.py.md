---
path: backend/padel_app/tests/test_standing_waiting_list_readd.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 146
size_tokens: 1498
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "9df34518289d6a66175a7a14c496719b1f3ced9e4b442b380a4c4b8e654a774f"
---

## Purpose

PAD-109 regression tests: re-adding a player to the standing (permanent) waiting list after removal used to 500. `uq_waiting_session_player` is `UNIQUE(lesson_instance_id, player_id)` and does NOT include `is_active`; removing a standing entry only flips its per-class `WaitingListEntry` rows to `is_active=False` rather than deleting them, so `_fan_out_standing_entry()` (in `notification_service`) used to fall through its `is_active=True` existence check and re-`INSERT` the same `(instance, player)` pair, raising a `UniqueViolation`. This was invisible until PAD-109 shipped the player-search box (`test_player_search.py`), since coaches previously had no way to pick a player to add. Pins: remove-then-readd via `add_standing_waiting_list_entry`/`remove_standing_waiting_list_entry` does not raise, and reactivates the existing row (same PK, new `standing_entry_id` and credits) rather than creating a duplicate; adding twice without removing also reactivates in place, not a duplicate; and a player's OWN self-joined waiting-list row (`standing_entry_id=None`) is never hijacked — adding a standing entry for that same player doesn't overwrite its origin marker.

## Connections

- Uses: `padel_app.services.notification_service` (`add_standing_waiting_list_entry`, `remove_standing_waiting_list_entry`, `get_standing_waiting_list`), `padel_app.models.User`, `padel_app.models.coaches.Coach`, `padel_app.models.players.Player`, `padel_app.models.Association_CoachPlayer`, `padel_app.models.Association_CoachLessonInstance`, `padel_app.models.lessons.Lesson`, `padel_app.models.lesson_instances.LessonInstance`, `padel_app.models.clubs.Club`, `padel_app.models.waiting_list_entry.WaitingListEntry`, `padel_app.utils.dates.utcnow_naive`, `padel_app.sql_db.db`; the `app` fixture from `conftest.py` (scope `backend-tests-a`).
- Used by: —
- Semantically related (not imports): `test_player_search.py` (PAD-109 shipped both together — the search box that made this bug reachable, and this file's fix for what the search box then exposed).
