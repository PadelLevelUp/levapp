Flask-JWT-Extended is the auth mechanism for every `/api/*` route (as opposed to `padel_app/modules/auth.py`'s separate Flask-Login session-cookie path for the legacy Jinja editor). `JWT_TOKEN_LOCATION` includes `query_string` specifically for the SSE stream route, opened by `EventSource`, which cannot set an `Authorization` header. Rolling refresh happens in an `after_request` hook: a token under 15 days from expiry is reissued and returned via `X-New-Token` (see `cors-origin-allowlist`'s `expose_headers`), so a session can stay alive indefinitely without re-login. Revocation is two-layered: a per-token blocklist row, plus a blanket check that instantly invalidates every session belonging to a `status == "disabled"` user, without per-token bookkeeping. This is the server-side issuance half of the cross-platform session contract `auth-session` describes from the client side.

## Implemented by
`backend/padel_app/config.py`
`backend/padel_app/auth.py`
`backend/padel_app/__init__.py`
`backend/padel_app/modules/frontend_api.py`

## Related concepts
[[auth-session]]
[[cors-origin-allowlist]]
