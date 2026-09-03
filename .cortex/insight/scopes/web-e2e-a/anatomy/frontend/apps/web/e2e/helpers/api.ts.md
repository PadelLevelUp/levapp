---
path: frontend/apps/web/e2e/helpers/api.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 3
size_lines: 25
size_tokens: 242
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b4739f27f85cafd76d6ea61ad3baccdc8903c4b9264f6bbb29c214db6c8e31b8"
---

## Purpose

Defines the E2E backend origin/API-root URL constants every spec that
talks to the API directly (rather than through the app) imports, instead
of hardcoding `localhost:5001`.

## Main players

- `BACKEND_ORIGIN` (line 15) — critical.
  `http://localhost:${PORT}`, `PORT` read from
  `process.env.E2E_BACKEND_PORT` with a `"5001"` fallback.
- `API_ROOT` (line 18) — critical. `${BACKEND_ORIGIN}/api`.
- `API_APP` (line 21) — critical. `${API_ROOT}/app`.
- `API_AUTH` (line 24) — critical. `${API_ROOT}/auth`.

## Insights

- The whole point of this file is the `E2E_BACKEND_PORT` override: port
  5001 is a popular port, and an unrelated local project squatting on it
  makes the suite unrunnable unless the port is overridable. A spec with a
  literal `localhost:5001` silently talks to whatever else is on 5001 and
  fails with a confusing 404 that looks like a product bug and isn't one
  — called out explicitly in the file's own header comment.
- Several callers import these constants and then still hand-roll their
  own `API_BASE`/`API_ROOT` string concatenation with `/app` or `/auth`
  appended locally (e.g. `presences-validation.spec.ts` imports `API_APP`/
  `API_AUTH` directly; others build `${API_ROOT}/app`) — there is no
  single canonical way callers reach the app/auth namespace, just three
  exported building blocks.
- Two spec files in this scope (`import-confirm-504.spec.ts`,
  `import-history.spec.ts`) don't import this file at all and instead
  call `/api/auth/login` as a page-relative path, relying on Vite's
  dev-server proxy rather than the explicit backend origin — an
  inconsistency worth knowing before assuming every spec goes through this
  constant.

## Connections

- Uses: — (no imports)
- Used by: `attendance/absence-history.spec.ts`,
  `attendance/attendance-history.spec.ts`,
  `attendance/presences-validation.spec.ts`,
  `dashboard/pending-confirmations.spec.ts` (all this scope, for
  `API_ROOT`/`API_APP`/`API_AUTH`); also imported by several sibling-scope
  files (notification-engine, schedule-calendar, security, settings
  specs, outside this scope) for the same reason.
- Semantically related (not imports): backend's Flask blueprint mount
  points `/api/app` and `/api/auth` (outside this scope) that these
  constants target.

## Query pointers

- If you need to add a new E2E spec that calls the backend directly,
  import `API_ROOT`/`API_APP`/`API_AUTH` from here rather than
  hardcoding a host/port.
- If E2E specs start failing with confusing 404s that look like a product
  bug, check `E2E_BACKEND_PORT`/port squatting before debugging the app.
