---
path: frontend/packages/api/src/sse.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 9
size_tokens: 83
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "35fb35470d5a2e0a7e1029bb3719400b0c64010a8647eba74d80208551322ed4"
---

## Purpose

Builds the URL for the server-sent-events stream (`<baseURL>/app/events?token=<token>`). Deliberately does NOT construct the `EventSource` itself, since that's platform-specific — web uses the native `EventSource`, mobile needs a polyfill — so the package only hands back the URL string for the platform shell to connect with.

## Connections

Uses: none (leaf, no imports).

Used by:
- `frontend/packages/api/src/index.ts`: re-exports `buildEventsUrl`.
- `frontend/packages/api/src/client.test.ts`: tests the URL shape directly.
