---
id: B-063
title: "An Alembic run inside the test session disabled every existing logger: three push-sender tests went red only on Postgres, only in the batch"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - backend/migrations/env.py
  - backend/padel_app/tests/test_pad279_migration_postgres.py
  - backend/padel_app/tests/test_pad294_push_sender_review.py
proposed_fix: "fileConfig(config.config_file_name, disable_existing_loggers=False) in migrations/env.py, so a migration run never silences the application's loggers."
opened: 2026-09-11T19:52:00Z
---

# B-063 — An Alembic run inside the test session disabled every existing logger

**Source:** batch 4's PR #224, `pytest (postgres, real migrations)` run 34639665806 (2026-09-11
19:52): 3 failed, 1647 passed. Diagnosis by Session G, fix by Session J (feature/pad-279
906084603), reproduction and verification by Session E.

**What happened:** `backend/migrations/env.py` called `logging.config.fileConfig(alembic.ini)`
with its default `disable_existing_loggers=True`. Every Alembic run therefore set
`disabled = True` on every logger that already existed in the process. The session-start
`flask db upgrade` in the Postgres conftest is harmless (few loggers exist yet), but PAD-279's
`test_pad279_migration_postgres.py` walks the migrations mid-session, after
`test_native_push.py` and `test_notification_*.py` have imported `padel_app.utils.push_sender`.
From then on that logger emitted nothing, and the three PAD-294 review tests that assert on
captured WARNINGs ("dropping oldest", "provider unresponsive", "inline push … provider
exploded") failed while every submit/flush before them passed.

**Why it was invisible until the batch:** Alembic never runs on the SQLite job, so the same
order passed there; #208 alone had no PAD-294 tests and #212 alone had no mid-session
migration walk; the review file alone, and the pad276..pad294 files together, pass on Postgres.
Reproduction: `test_native_push.py test_pad279_migration_postgres.py
test_pad294_push_sender_review.py` on Postgres → 3 failed; with the fix → 24 passed.

**Rule (incomplete):** a migration run inside a process that keeps running (tests, the
scheduler, a request) must not reconfigure logging for the rest of the process.

**Fix:** `fileConfig(config.config_file_name, disable_existing_loggers=False)`. Alembic's own
loggers are still configured; nothing else changes.
