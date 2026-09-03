---
path: frontend/packages/api/src/resources/fields.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 27
size_tokens: 186
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "bb8a7d8bdda439a6cb274e327a266b9e16a9ebbc76e59ab5c865be6b0350414b"
---

## Purpose

`checkFieldAvailable` — a debounce-friendly uniqueness/availability check for a form field (username, email, player name), returning a message string on a 409 conflict or `null` otherwise (including for unrelated errors, so it fails soft rather than throwing). The optional `scope` param (PAD-17) restricts warn-only checks like the player-name duplicate warning to one coach's own roster; unique-field checks (username/email) ignore it and stay global server-side.

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` for `/app/check_field_available`.

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `fieldsApi`.
- `frontend/packages/hooks/src/useFieldAvailability.ts`: the sole caller, wraps this in a debounce.
