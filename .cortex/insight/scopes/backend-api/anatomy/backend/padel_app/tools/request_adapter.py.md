---
path: backend/padel_app/tools/request_adapter.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 23
size_tokens: 173
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "91e7188036650163b7358e995c5bcd1d89c5f2db632363c1e1a350743439cce8"
---

## Purpose

`JsonRequestAdapter` shims a plain JSON payload (`dict`) into an object exposing the `.form`/`.files` attributes that `padel_app.tools.input_tools`'s `Form.set_values()` expects from a real Flask `request` — letting the legacy form-field machinery (built around HTML form submission) also accept JSON bodies from API clients, normalizing keys to the target form's declared field names when a `form` is supplied.

## Connections

- Uses: `werkzeug.datastructures.MultiDict`
- Used by: `padel_app/tools/input_tools.py` (same scope) and multiple service modules outside this scope (`club_service.py`, `calendar_service.py`, `player_service.py`, `messaging_service.py`, `user_service.py`, `coach_service.py`, `lesson_service.py`, `import_service.py`) — a widely reused bridge between JSON API bodies and the legacy `Form`/`Field` validation layer
