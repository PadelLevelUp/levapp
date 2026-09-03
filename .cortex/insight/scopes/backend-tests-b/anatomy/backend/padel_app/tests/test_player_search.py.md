---
path: backend/padel_app/tests/test_player_search.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 163
size_tokens: 1573
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "dd3be420a6cdeb4502a280ab102b16b0a025736380832192850ede3e5bd41a89"
---

## Purpose

PAD-109 tests for `GET /api/app/notify/player_search`, the type-ahead student search used by Settings > Notifications (standing/permanent waiting list + `restrictions.excludedPlayers`). The route previously did not exist, so the frontend search silently returned nothing (404 swallowed by the client's `catch`). Pins the contract the frontend depends on: results are scoped to the calling coach's own roster via `Association_CoachPlayer` (another coach's matching players never leak in, verified with a deliberately colliding name "Alice Mallory"); matching is a case-insensitive substring of `User.name`; inactive (invited-but-never-registered) players are still included since they're addable to a waiting list; results are sorted by name; the returned `id` is `Player.id` — never `User.id` — since that's what `POST /standing_waiting_list` and `excludedPlayers.playerIds` expect; a blank, whitespace, or SQL-wildcard (`%`, `_`) query returns `[]` rather than dumping the whole roster; the route 401s anonymously and 403s for a user with no `Coach` record.

## Connections

- Uses: `padel_app.models.User`, `padel_app.models.coaches.Coach`, `padel_app.models.players.Player`, `padel_app.models.Association_CoachPlayer`, `padel_app.sql_db.db`; `flask_jwt_extended.create_access_token` for auth headers; the `app` and `client` fixtures from `conftest.py` (scope `backend-tests-a`). Exercises the `notification_engine_api`/`notifications_api` blueprint route (scope `backend-api`) indirectly through `client.get(...)`.
- Used by: —
- Semantically related (not imports): none identified.
