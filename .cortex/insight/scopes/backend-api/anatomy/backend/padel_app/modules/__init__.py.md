---
path: backend/padel_app/modules/__init__.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 41
size_tokens: 202
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "86d92ce34f71534be946b20a4e0c01b8d8aba3f5d51b9b2464a2c72c1b757264"
---

## Purpose

Central Blueprint registry: `register_blueprints(app)` imports every module-level blueprint (`main`, `auth`, `api`, `editor`, `editor_api`, `frontend_api`, `api_auth`, `notifications_api`, `notification_engine_api`) and registers each with the Flask app. `startup` is imported and re-exported in `__all__` but has no blueprint and is never registered.

## Connections

- Uses: every blueprint module in `padel_app/modules/` (`api`, `auth`, `editor`, `editor_api`, `main`, `frontend_api`, `api_auth`, `notifications_api`, `notification_engine_api`, `startup`)
- Used by: `padel_app/__init__.py`: `create_app` calls `modules.register_blueprints(app)` during app factory setup — this is the single wiring point that turns every route module into a live Flask route
