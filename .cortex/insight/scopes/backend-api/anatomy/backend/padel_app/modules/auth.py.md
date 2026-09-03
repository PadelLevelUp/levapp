---
path: backend/padel_app/modules/auth.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 130
size_tokens: 946
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2bd9f0a18f2881bc8754340e1bfafe7613a9d2a4e339bf9b49c2658019743e2d"
---

## Purpose

Session-cookie login blueprint (`/auth`) for the legacy server-rendered Jinja pages (as opposed to `modules/api_auth.py`'s JWT API for the frontend app): `login` checks credentials with `check_password_hash` and calls Flask-Login's `login_user`, also stamping `session["admin_logged"]` for admins; `forgot_password`/`generate_new_code`/`verify_generated_code` implement a mail-a-5-digit-code reset flow with no visible expiry or attempt-rate-limit on the generated code; `logout` is Flask-Login's session logout. Also renders the root `index.html` and `register.html` templates.

## Connections

- Uses: `padel_app.models.User`; `padel_app.tools.auth_tools` (`is_safe_url` for open-redirect-safe `next` handling) and `padel_app.tools.email_tools` (`send_email`) for the reset-code emails; `flask_login` (`login_required`, `login_user`, `logout_user`)
- Used by: `padel_app/modules/__init__.py`: `register_blueprints` registers `auth.bp`; `padel_app/modules/main.py`'s root route and the legacy editor templates link into these routes for session-based access
