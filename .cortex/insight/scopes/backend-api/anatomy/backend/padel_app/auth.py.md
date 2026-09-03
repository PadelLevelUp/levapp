---
path: backend/padel_app/auth.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 47
size_tokens: 401
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0e71bc644ae331dc97fcc6959378a09690007b3bc86b792694278e446c3126f2"
---

## Purpose

App-wide auth wiring: `register_jwt_handlers` installs Flask-JWT-Extended callbacks for unauthorized/invalid/expired tokens, plus `token_in_blocklist_loader` which does double duty — it checks the per-token `TokenBlocklist` (populated on explicit logout, see `modules/api_auth.py`) AND, on every request, re-checks whether the token's user has `status == "disabled"`, treating any token from a disabled account as revoked. That second check is a deliberate "kill all sessions for this user" mechanism that needs no per-token bookkeeping — disabling the account instantly invalidates every JWT it ever issued. `setup_login_manager` wires the Flask-Login `user_loader` for the separate session-cookie auth path.

## Connections

- Uses: `padel_app.models` (`User`, `TokenBlocklist`); `flask_jwt_extended.JWTManager`
- Used by: `padel_app/__init__.py`: `create_app` calls `register_jwt_handlers(jwt)` and (via `LoginManager`) effectively `setup_login_manager` during app factory setup — this is what makes every `@jwt_required()` route across the scope (e.g. `frontend_api.py`, `notification_engine_api.py`, `api_auth.py`) honor blocklisting and disabled-account revocation
