---
path: backend/padel_app/tests/test_player_invitation.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 231
size_tokens: 1884
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "598ec643058cb173dbf6f688288e56cfaa97b6720dd47b030993ae0149de5749"
---

## Purpose

Route + service tests for the `players.invite-completion` feature: a coach creates an "incomplete player" (`POST /api/app/incomplete_player`, PAD-92 now `@jwt_required()` with the inviting coach taken from the token rather than the body), producing a `PlayerInvitation` token, an inactive `User` with no password, and an `Association_CoachPlayer`. Covers resolving a token publicly (`GET /api/app/player-invitations/{token}` returns the player name and status, unknown token 404s), accepting an invitation (sets username/password, activates the user, hashes the password, marks the invitation `accepted`, returns an access token; a duplicate username 409s and leaves the invitation `pending`), expiry (`create_incomplete_player_service` sets `expires_at` = now + 7 days; `accept_player_invitation_service` raises Werkzeug `Gone` (410) past that point), and PAD-92 authorization (anonymous caller 401s; a coach cannot name a different coach's id in the body — 403).

## Connections

- Uses: `padel_app.services.player_invitation_service` (`create_incomplete_player_service`, `accept_player_invitation_service`), `padel_app.models.User`, `padel_app.models.Coach`, `padel_app.models.PlayerInvitation`, `padel_app.models.Association_CoachPlayer`, `padel_app.sql_db.db`, `werkzeug.exceptions.Gone`; `flask_jwt_extended.create_access_token` for auth headers; the `app` and `client` fixtures from `conftest.py` (scope `backend-tests-a`). Defines its own local `make_coach(app, username=...)` helper (distinct from `padel_app.tests.helpers.make_coach`, scope `backend-tests-a`, which takes no username parameter).
- Used by: —
- Semantically related (not imports): none identified.
