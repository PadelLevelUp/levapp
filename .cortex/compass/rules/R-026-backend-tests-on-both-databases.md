---
id: R-026
title: "Backend tests run on SQLite with foreign keys enforced and on Postgres built by the real migrations"
source:
  - ../../archive/documents/data-model-audit-2026-09-02/extracted/findings.md
governs:
  - "backend/padel_app/tests/**/*.py"
  - "backend/migrations/versions/*.py"
  - ".github/workflows/backend-tests.yaml"
confidence: EXTRACTED
status: active
---

# R-026 — Backend tests run on SQLite with foreign keys enforced and on Postgres built by the real migrations

The `app` fixture in `backend/padel_app/tests/conftest.py` has two backends, selected by
`LEVAPP_TEST_DB`: `sqlite` (default, `PRAGMA foreign_keys=ON`, `create_all`) and `postgres`
(one scratch database per session built by `flask db upgrade`, tables truncated per test). CI
(`backend-tests.yaml`) runs both on every pull request into `staging` or `main`, and both must
pass. Test code never branches on the backend; it only uses the fixture.

**Why:** audit M20 (2026-09-02, ticket PAD-278). With SQLite alone and FK enforcement off, every
`ondelete` was inert (C2 and H6 were invisible to the suite), migrations never executed under
pytest, `String(n)` and native enums were not checked, and a second Alembic head or a migration
that did not apply went unnoticed until the deploy crash-looped.

**How to apply:** a new model column needs a migration or the Postgres job fails; a migration must
apply cleanly from the previous head on an empty database; fixtures must insert rows that satisfy
foreign keys, lengths and enums. When the two backends disagree, Postgres is the truth.
