---
id: B-068
title: "A nested app context removed the outer context's session, leaving it idle in a transaction"
type: incomplete-rule
severity: high
status: resolved
affects:
  - backend/padel_app/sql_db.py
  - backend/padel_app/tests/conftest.py
  - backend/padel_app/tests/test_scheduler_job_lifecycle.py
  - R-007
proposed_fix: "Scope db.session per app context (scopefunc = id(app_ctx), as Flask-SQLAlchemy 3 does) so a nested context only removes its own session; reorder the test; the conftest alarm names the test and fails the run."
opened: 2026-09-11T12:10:00Z
resolved: 2026-09-11T12:33:00Z
---

# B-068 — A nested app context removed the outer context's session, leaving it idle in a transaction

**Source:** the Postgres CI job hung after test #1399
(`test_scheduler_job_lifecycle::TestDeleteCancelsJobs::test_delete_future_instances_calls_cancel_for_each`)
on every run since #156 exposed it (run 34519232824). Hotfix #201 added a conftest safety net
(`gc.collect()`, terminate idle-in-transaction sessions, 15 s `lock_timeout`, a "leaked database
sessions" summary) and left the leak in place. Ticket PAD-291.

**What happens:** after that test, `pg_stat_activity` shows a backend `idle in transaction` whose
last statement is `SELECT lessons.created_at AS lessons_created_at, …` — a full `Lesson` load. The
next test's `TRUNCATE` waits on it forever unless Python's garbage collector happened to run.

**What should happen:** every session a test opens is closed when the app context that owns it
pops; nothing is left for the collector to release.

**Root cause (reproduced 2026-09-11 in ~/levapp-wt-g on staging 72ac170a8, Postgres 14, 2.7 s
for the class):**

1. The test reads `Lesson.query.get(_seed_lesson_with_instance(app, …)["lesson_id"])`. Python
   evaluates `Lesson.query` first, which binds a `Query` to the current session S1.
2. `_seed_lesson_with_instance` pushes its own `app.app_context()` *inside* the test's. When it
   pops, Flask-SQLAlchemy's `teardown_appcontext` handler runs `db.session.remove()`. Flask-SQLAlchemy
   2.5.1 scopes `db.session` per **thread**, so the session it removes is S1 — the outer context's.
3. `.get()` then runs `SELECT lessons.*` on the closed S1, which autobegins a new transaction. S1
   is no longer in the registry; nothing will ever commit or close it. It survives only through the
   `Session ↔ SessionTransaction` reference cycle, holding a checked-out connection, until a
   gen-2 collection finalises the connection fairy (rollback + return to pool).
4. Evidence: a gc-referrer probe at fixture teardown found exactly one `Session`
   (`in_transaction=True`, empty identity map) referenced only by its `SessionTransaction`, one
   `_ConnectionFairy` inside a `RootTransaction`, and one `idle in transaction` backend whose query
   is the `Lesson` load. `delete_future_instances` itself commits after every delete and is clean —
   the 2026-09-10 diagnosis pointed at the wrong frame.

**Why it is type 2:** R-007 says DB work runs inside `with app.app_context():` but never said that
a context pushed *inside* another one tears down the outer context's session. The scheduler already
works around this by hand (`_app_ctx()` in `scheduler.py`), which is the tell that the rule was
missing. The test is the first casualty, not the cause.

**Affected specs:**
- Dev: none — session lifecycle is infrastructure; governed by compass R-007 and R-026.
- Business: none.

### Change Plan

**Rule to modify:** `.cortex/compass/rules/R-007-app-context-for-db-work.md`
**Change type:** add rule text + regression test

**Add this rule text:** a nested `app.app_context()` must never disturb the outer context's
session. The session is scoped per app context (not per thread), so each context owns and closes
its own; helpers that push their own context are called *before* anything in the outer context
touches `db.session` or `Model.query`.

**Then:**
1. Regression test `backend/padel_app/tests/test_pad291_session_scope.py`: bind a `Query` in an
   outer context, push and pop an inner context, run the query, pop the outer context; every pool
   checkout must be checked in again with the collector disabled. Red on staging.
2. `backend/padel_app/sql_db.py`: `SQLAlchemy(session_options={"scopefunc": <id of app_ctx>})` —
   the scoping Flask-SQLAlchemy 3 adopted for exactly this bug.
3. `test_scheduler_job_lifecycle.py`: seed before entering the context, like its siblings.
4. `conftest.py`: the leak check moves to the `app` fixture's teardown so the summary names the
   test that leaked, and a non-empty summary fails the run. `gc.collect()`, the terminate and the
   `lock_timeout` stay as the safety net.
5. Proof: the Postgres suite with the `gc.collect()` net disabled runs past #1399 with an empty
   summary; then the net goes back in.
6. Sweep product code for sessions that outlive their context; list findings.

### Resolution

- Rule: R-007 extended (one context, one session) — 35d82582f.
- Code: `backend/padel_app/sql_db.py` scopes `db.session` per app context
  (`scopefunc = id(app_ctx)`); `test_scheduler_job_lifecycle.py` seeds before entering its
  context; `conftest.py` attributes a leaked session to its test and fails the run, keeps
  #201's safety net, and scopes both terminate queries to our own client backends (an
  autovacuum worker raised InsufficientPrivilege at session end) — ffa5ba59b.
- Tests: `backend/padel_app/tests/test_pad291_session_scope.py` (2, red on both backends first).
- Proof (2026-09-11, ~/levapp-wt-g, Postgres 14): full Postgres suite with `gc.collect()`
  disabled — 1557 passed, 5 skipped, exit 0, no "leaked database sessions" section; SQLite
  1562 passed. Net restored afterwards.
- Sweep of product code for sessions outliving their context: nothing found (details in the
  PAD-291 PR body); one follow-up question noted on `stream_import_analysis` running its
  coach-level lookup outside a request context.
- Resolved: 2026-09-11 in PAD-291.
