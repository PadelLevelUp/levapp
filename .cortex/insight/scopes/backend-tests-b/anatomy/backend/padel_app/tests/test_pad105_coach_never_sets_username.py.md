---
path: backend/padel_app/tests/test_pad105_coach_never_sets_username.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 147
size_tokens: 1227
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e6f8f668005efb5abe6aba9e0fd0ed9840bb34b48bdc95000e6bc1045673b06a"
---

## Purpose

PAD-105 rule tests: a coach can never choose or change a player's username, since it is a login credential belonging to whoever logs in. Pins that coach-side player creation (`player_service.add_player_service`) always assigns a generated placeholder username (`is_placeholder_username`) even when the caller supplies one explicitly (an old client or hand-crafted request), that placeholders are unique across players and their accounts have no password until activation, that editing a player (`edit_player_service`) cannot overwrite the username while other edits still apply, that `unique_placeholder_username()` never returns an already-taken value, and — at the route level (`GET /api/app/register/user/{user_id}`) — that the activation/registration form returns `username: null` for a placeholder account (so the client doesn't prefill and leak the generated string) but returns the real value for a user who already chose one.

## Connections

- Uses: `padel_app.tools.username_tools` (`is_placeholder_username`, `unique_placeholder_username`), `padel_app.tests.helpers.make_coach` (scope `backend-tests-a`, not in this scope), `padel_app.services.player_service` (`add_player_service`, `edit_player_service`), `padel_app.models.Player`, `padel_app.models.User`, `padel_app.sql_db.db`; the `app` and `client` fixtures from `conftest.py` (scope `backend-tests-a`).
- Used by: —
- Semantically related (not imports): none identified.
