---
path: backend/padel_app/modules/api_auth.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 108
size_tokens: 875
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "62fc6a968e8beaa63ac535c02b5a05ea2c9062d229485d99d49c34197d8afa80"
---

## Purpose

JWT auth blueprint (`/api/auth`) for the SPA/mobile clients: `POST /login` checks username+password (`werkzeug.security.check_password_hash`) and issues a JWT access token plus a minimal user summary; `POST /logout` revokes the current token by adding its `jti` to `TokenBlocklist`; `GET /me` returns the full profile payload (`_serialize_me`) the frontend hydrates its session and Settings form from, including per-user notification-block preferences (PAD-112) and profile fields (PAD-81); `DELETE /me` and `PATCH /me` delegate to `account_service`/`user_service` for account deletion and partial self-profile updates (only fields in `OWN_PROFILE_FIELDS`, and only those present in the payload).

## Connections

- Uses: `padel_app.models` (`User`, `TokenBlocklist`); `padel_app.sql_db.db`; `padel_app.services.account_service.delete_account_service`; `padel_app.services.user_service` (`OWN_PROFILE_FIELDS`, `ProfileValidationError`, `update_own_profile_service`) — all outside this scope; `flask_jwt_extended` for token creation/verification
- Used by: `padel_app/modules/__init__.py`: `register_blueprints` registers `auth_api.bp`; this is the frontend's login/session/profile API surface, distinct from `padel_app/modules/auth.py`'s session-cookie login used by the legacy Jinja pages
