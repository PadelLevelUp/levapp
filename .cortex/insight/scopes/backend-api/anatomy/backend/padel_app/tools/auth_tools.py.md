---
path: backend/padel_app/tools/auth_tools.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 27
size_tokens: 244
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "861d63a196dc70ebb03be34aba2d94b5f61201f28da42e9d21fb19ef96ec7730"
---

## Purpose

Small auth utilities for the legacy Flask-Login surface: `admin_required` is a route decorator that redirects unauthenticated users to `/auth/login` (preserving `next`) and non-admins to `main.index` with a flash message; `is_safe_url` guards the `next` redirect target against open-redirect by requiring the same scheme/netloc as the current host.

## Connections

- Uses: `flask_login.current_user`; `flask` (`flash`, `redirect`, `request`, `url_for`)
- Used by: `padel_app/modules/editor.py`: `admin_required` on the editor blueprint's `before_request`; `padel_app/modules/auth.py`: `is_safe_url` guards the login `next` redirect
