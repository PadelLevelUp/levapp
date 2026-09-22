Flask-CORS on `/api/*` is configured with exactly two hardcoded allowed origins — the local Vite dev server and the shared dev/staging VM (plain HTTP, no TLS) — rather than a same-origin assumption or a wildcard. `supports_credentials=False` (cookies never cross origins; the app relies on JWT bearer/query-string tokens instead — see `jwt-auth`), and `expose_headers=["X-New-Token"]` is required so the rolling-JWT-refresh header is actually readable by frontend JS across origins. No production frontend origin appears in this static Python literal, so adding a new deployment target requires a code change here, not a config/env change.

## Implemented by
`backend/padel_app/__init__.py`

## Related concepts
[[jwt-auth]]
[[production-migration-guard]]
