---
concept: cors-origin-allowlist
extracted_at: 2026-09-03T15:00:00Z
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
---

# CORS origin allowlist

`padel_app/__init__.py`'s `create_app` configures Flask-CORS on `/api/*` with exactly two hardcoded allowed origins — `http://localhost:8080` (the local Vite dev server) and `http://34.78.247.45` (the shared dev/staging VM, plain HTTP, no TLS) — rather than a same-origin assumption or a wildcard. `supports_credentials=False` (cookies are not sent cross-origin; the app relies on JWT bearer/query-string tokens instead, see the `jwt-auth` concept), and `expose_headers=["X-New-Token"]` is required so the rolling-JWT-refresh header is actually readable by frontend JS across origins (a header not in `expose_headers` is invisible to `fetch`/`XMLHttpRequest` even though it's present on the wire).

Notably, no production frontend origin appears in this list — `34.78.247.45` is documented elsewhere in this scope (`production-migration-guard` concept) as a production/shared-VM host, but there's no distinct prod domain entry, and the list is a static Python literal rather than environment-driven, so adding a new frontend deployment target requires a code change here, not a config/env change.

Evidence: `backend/padel_app/__init__.py` (`create_app`'s `CORS(...)` call).
