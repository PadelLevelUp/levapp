---
concept: jwt-auth
extracted_at: 2026-09-03T15:00:00Z
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
---

# JWT auth

Flask-JWT-Extended is the auth mechanism for every `/api/*` route in this scope (as opposed to `padel_app/modules/auth.py`'s separate Flask-Login session-cookie path for the legacy Jinja editor). Config (`padel_app/config.py`): `JWT_TOKEN_LOCATION = ["headers", "query_string"]` with `JWT_QUERY_STRING_NAME = "token"` — the query-string location exists specifically for `GET /api/app/events` (`modules/frontend_api.py`), the SSE stream, which is opened by `EventSource` and cannot set an `Authorization` header, so it authenticates via `?token=` instead (`@jwt_required(locations=["query_string"])` on that one route). `JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=30)`.

Rolling refresh: `padel_app/__init__.py`'s `after_request` hook checks the current token's remaining lifetime on every response and, if under 15 days, mints a fresh one and returns it via the `X-New-Token` response header (declared in `expose_headers` on the CORS config) — clients are expected to swap in the new token, so a session can stay alive indefinitely without a re-login as long as requests keep flowing.

Revocation is two-layered (`padel_app/auth.py`'s `register_jwt_handlers`): a `TokenBlocklist` row per explicitly-logged-out token (`jti`), AND a blanket check that rejects any token — regardless of `jti` — belonging to a user whose `status == "disabled"`. The second check is what lets disabling an account instantly invalidate every session it ever had, without per-token bookkeeping.

`SECRET_KEY`/`JWT_SECRET_KEY` fall back to hardcoded dev values if their env vars are unset (`padel_app/config.py`); the deploy path injects `FLASK_SECRET_KEY`, a variable this file never reads.

Evidence: `backend/padel_app/config.py`, `backend/padel_app/auth.py`, `backend/padel_app/__init__.py`, `backend/padel_app/modules/frontend_api.py` (`/events` route).
