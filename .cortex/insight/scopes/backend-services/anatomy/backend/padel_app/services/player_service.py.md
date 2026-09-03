---
path: backend/padel_app/services/player_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 392
size_tokens: 3426
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "90973dfd0f2468e0635c5abee7a738ba43c29015cc39bbcb302440cfe9580acc"
---

## Purpose

Coach-facing player roster CRUD and serialization: creating/editing
players (form-driven, via `create_player_helper`/`edit_player_helper`,
plus the higher-level `add_player_service`/`edit_player_service` that
build their payloads), listing (plain, paginated with search/sort/alert
filters), profile/evaluation reads, roster type-ahead search, and player
removal (which branches on multi-coach sharing and account activation
state). `_serialize_coach_player_relation` is the canonical
coach-player-relation → API dict shape, reused by both the list and
detail routes.

## Connections

- Uses: `padel_app.models` (`Player`, `User`, `Association_CoachPlayer`,
  `PlayerLevelHistory`); `padel_app.tools.request_adapter.JsonRequestAdapter`;
  `padel_app.tools.username_tools.unique_placeholder_username`;
  `services/student_notification_preferences.py`
  (`notification_block_payload`, imported lazily inside
  `_serialize_coach_player_relation`).
- Used by: `services/import_service.py` (`create_player_helper` — the
  bulk-import player-creation path reuses this same helper so imported
  and manually-added players go through identical logic).

## Insights

- PAD-105: a coach can never set or change a player's `username` —
  `add_player_service` always generates a placeholder via
  `unique_placeholder_username()` and `edit_player_service`'s payload
  deliberately omits `username` entirely. The player only picks their
  own username at self-service activation (the `player_invitation_service`
  flow).
- `_serialize_coach_player_relation`'s `validated` field (PAD-30) is
  derived from `user.password is not None` — a precise "has this player
  completed self-service registration" signal, distinct from `isActive`
  (a coach-disabled player keeps their password and stays `validated`
  but not active).
- `remove_player_service` has three distinct outcomes depending on state:
  multiple coaches sharing the player → only the relationship row is
  deleted; single coach + active player → the `Player` row is deleted
  (cascading associations) but the `User` survives; single coach +
  inactive player → BOTH `Player` and `User` rows are deleted. An
  inactive (never-activated) player has no independent identity worth
  keeping once its only coach removes it.
- `_serialize_coach_player_relation` merges in
  `student_notification_preferences.notification_block_payload(user)` —
  its docstring flags that `Player.coach_player_info` (elsewhere) must
  return the IDENTICAL keys, or the coach's "notifications cut" signal
  disappears whenever they edit rather than list the student.
