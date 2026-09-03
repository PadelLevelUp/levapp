---
path: frontend/apps/web/src/api/import.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 259
size_tokens: 1796
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "892d0c492f963ada6b4c560a51b19475bbeb7f4c8f207ac21c2928550f500b84"
---

## Purpose

The bulk-data-import feature's client: `analyzeFile` streams an uploaded file's extracted tables back via SSE (`POST /app/import/analyze`), `confirmImport`/`confirmImportStream` submit the user-reviewed rows (plain JSON POST vs. an SSE-progress variant for large uploads, so the gateway never returns a false 504), plus `getImportHistory`/`revertImport` for the import log and undo. Unlike every SSE-adjacent code path in `@levelup/api` (which centralizes URL-building in `sse.ts` for the platform shell to connect an `EventSource`), this file hand-rolls its OWN SSE parsing on top of a raw `fetch()` + `ReadableStream` reader (buffer/split-on-newline/parse-`data:` loop, duplicated near-verbatim between `analyzeFile` and `confirmImportStream`) because these are POST-with-streamed-response endpoints, which the browser's `EventSource` API cannot express (`EventSource` only does GET). It also duplicates `@/api/client.ts`'s 401 handling inline (clear `accessToken`, redirect to `/auth?next=...`) rather than routing through the axios client's interceptor, since these calls bypass axios entirely in favor of raw `fetch`.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: the exported `api` axios instance, read only for `api.defaults.baseURL` (both streaming functions build their own `fetch()` calls rather than using `api` for the request itself).

Used by: no file within this scope (its consumer is the data-import wizard UI, outside `api/`/`hooks/`/`data/`).

Semantically related (not imports): `frontend/packages/api/src/sse.ts` (outside scope) — the package's SSE-URL builder handles the GET-based `EventSource` case; this file's two streaming functions solve the POST-based SSE case that builder can't, with independently duplicated 401-redirect and buffer-parsing logic.
