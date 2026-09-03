---
path: backend/padel_app/tools/email_tools.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 19
size_tokens: 113
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "492319925c696e5be46c86375cef81e75cee0c5903c2b50d4194c9de7c5bb4ef"
---

## Purpose

Single-function Flask-Mail wrapper: `send_email(subject, recipients, body=None, html=None)` builds and sends a `flask_mail.Message` from `MAIL_USERNAME` (env var), requiring at least one of `body`/`html`.

## Connections

- Uses: `flask_mail.Message`; `padel_app.mail.mail` (the shared Flask-Mail extension instance, outside this scope)
- Used by: `padel_app/modules/auth.py`: `forgot_password`/`generate_new_code` send the password-reset-code email
