---
path: frontend/apps/web/src/api/editor.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 85
size_tokens: 498
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "cfeb2bfa846fe2b244949f0ba637ab8d7d2ee2f894d8733eacd9701bedf59e77"
---

## Purpose

The client for a generic, model-agnostic admin data editor: `getEditorModels` (list editable model kinds), `getEditorSchema`/`getEditorRecords`/`getEditorRecord`/`getEditorOptions` (read a model's field metadata, paginated records, one record, related-field options), and `createEditorRecord`/`updateEditorRecord`/`deleteEditorRecord` (write). Unlike every other file in `api/`, it calls `api.get`/`api.post`/`api.patch`/`api.delete` directly against `/editor/<model>...` REST paths rather than going through a `@levelup/api/src/resources/*` module — there is no package-level equivalent, since this is a web-only admin surface with no mobile counterpart and no mock branch at all (always hits the real backend).

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: the exported `api` axios instance, used directly.

Used by: no file within this scope (its consumer is the admin data-editor UI, outside `api/`/`hooks/`/`data/`).

Semantically related (not imports): `frontend/apps/web/src/api/import.ts`, `seasons.ts` — the other two files that call the raw `api` axios instance instead of a `@levelup/api` resource module.
