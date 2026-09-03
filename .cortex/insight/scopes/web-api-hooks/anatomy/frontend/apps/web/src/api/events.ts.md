---
path: frontend/apps/web/src/api/events.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 5
size_tokens: 38
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "503a6d3b23e0bdbb4ec96bfb29033aab59c1582d37da13a324ec9c12eae58e9a"
---

## Purpose

`createEventSource(token)` — constructs the native browser `EventSource` for the app's SSE connection, using `@levelup/api`'s `buildEventsUrl("/api", token)` to build the URL (the package deliberately does not construct the `EventSource` itself, since that's platform-specific — this is web's half of that split, importing `@levelup/api` directly rather than through `@/api/client`, since it needs no axios/auth-client behavior, just the URL builder).

## Connections

Uses:
- `@levelup/api` (outside scope): `buildEventsUrl`.

Used by: no file within this scope (its consumer is whatever sets up the app's live messaging/notification stream, outside `api/`/`hooks/`/`data/`).
