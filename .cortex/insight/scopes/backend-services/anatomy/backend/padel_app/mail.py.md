---
path: backend/padel_app/mail.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 4
size_tokens: 11
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "dba302fea4ae38314536038a1dc4f774181bcca56d63153f758eef64e4fc90a4"
---

## Purpose

Module-level singleton for the Flask-Mail extension (`mail = Mail()`),
instantiated once so it can be imported and initialized against the
Flask app elsewhere in the codebase (outside this scope, in app setup).

## Connections

- Uses: `flask_mail.Mail` (third-party).
- Used by: app initialization code that calls `mail.init_app(app)`
  (outside this scope).
