---
id: R-007
title: "DB operations in tests and scheduler jobs run inside `with app.app_context():` — one context, one session"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
  - ../bugs/B-068-nested-app-context-orphans-outer-session.md
governs:
  - "backend/padel_app/tests/**/*.py"
  - "backend/padel_app/scheduler.py"
  - "backend/padel_app/sql_db.py"
confidence: EXTRACTED
status: active
---

# R-007 — DB operations in tests and scheduler jobs run inside `with app.app_context():` — one context, one session

Outside an app context SQLAlchemy has no session bound to the request-less code path.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

## Each app context owns exactly one session, and closes it when it pops (B-068, PAD-291)

`db.session` is scoped **per app context**, not per thread (`sql_db.py` passes
`scopefunc` to Flask-SQLAlchemy, the scoping Flask-SQLAlchemy 3 adopted). Pushing an
`app.app_context()` inside an active one therefore gives the inner block its own session, and
the inner teardown removes only that one. Before B-068 the session was thread-scoped, so a
nested context's teardown ran `db.session.remove()` on the *outer* context's session: any
`Query` already bound to it, or any object loaded from it, then ran on a session nobody would
ever close, and Postgres kept a backend `idle in transaction` until the garbage collector
happened to finalise the connection (the CI hang after test #1399).

**How to apply:**
- A helper that pushes its own context (`_seed_*` in the tests, scheduler jobs) is called
  *before* the outer block touches `db.session` or `Model.query`, never as an argument inside
  a query expression — `Lesson.query.get(seed(app)["id"])` evaluates `Lesson.query` first.
- Objects loaded in an inner context are detached once it pops; re-load them by id in the
  outer one rather than passing instances across the boundary.
- Scheduler code called from a request keeps using `_app_ctx()` (push only when no context is
  active): the inner block would otherwise not see the request's uncommitted rows.
- The conftest leak alarm (`leaked database sessions`) names the test that left a session
  idle in a transaction and fails the run. It is the alarm, not the fix — do not silence it by
  widening the safety net.
