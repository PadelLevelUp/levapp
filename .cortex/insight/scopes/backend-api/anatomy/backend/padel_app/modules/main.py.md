---
path: backend/padel_app/modules/main.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 11
size_tokens: 57
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5fe831a6788d8800b6303949e94c29ed8c43b83b8a16a7ceca76c2471b1fa797"
---

## Purpose

Registers the `main` Blueprint whose sole route (`GET/POST /`) redirects the site root to `editor.index`, effectively making the legacy coach editor UI the default landing page.

## Connections

- Uses: `flask` (Blueprint, url_for, redirect), `flask_jwt_extended` (jwt_required import present but unused on the single route)
- Used by: registered via `padel_app.modules.register_blueprints` (`modules/__init__.py`); reached whenever a client hits the bare app root
