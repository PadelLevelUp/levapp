---
id: R-037
title: "A migration-walk test uses raw SQL for the oldest schema it meets, and always returns the scratch database to head"
source:
  - ../bugs/B-046-lesson-instance-occurrence-not-unique.md
governs:
  - "backend/padel_app/tests/**/*.py"
check:
  kind: grep
  pattern: "downgrade\\("
confidence: MEASURED
status: active
---

# R-037 — A migration-walk test uses raw SQL for the oldest schema it meets, and always returns the scratch database to head

A test that walks migrations — `downgrade()` to a parent, exercise, `upgrade()` back — runs
against a schema the ORM does not describe. The models in the tree are written for head; on a
stacked branch the parent it downgrades to is also the parent of every migration merged after
it, so the walk unwinds columns the models still name. Three rules follow:

1. **Fixtures and reads inside the walk are raw SQL** —
   `db.session.execute(text("INSERT INTO … (cols) VALUES (:cols)"), cols)`, `SELECT max(id)`
   for the new id — naming only the columns that exist at every revision the walk passes
   through. Never construct a model or call a service inside a walk: both emit the head's
   column list.
2. **The walk's `finally` brings the shared scratch database back to head no matter what
   happened**: roll back inside its own try/except (a failed statement leaves the session
   PendingRollback, and a rollback that raises here skips everything after it),
   `db.session.remove()`, then `upgrade()`. A walk that can leave the database downgraded
   strands every later test in the run on a schema they were not written for.
3. **Assert the walk's own subject through the inspector or raw SQL** (reflected index and
   constraint names, row counts), not through the ORM, for the same reason as 1.

**Why:** on 2026-09-16 the batch-2 assembly combined a batch-1 test with batch-2 migrations.
`test_pad303`'s Postgres walk downgraded to PAD-303's parent, which on the assembled branch also
unwound PAD-271's `presences.response` and PAD-275's `lessons.series_id`; its fixtures inserted
through the ORM `Lesson` model, whose column list now named `series_id`, so the INSERT died with
UndefinedColumn, the `finally`'s bare rollback raised PendingRollbackError, the `upgrade()`
after it never ran, and dozens of later Postgres tests failed on the downgraded schema. Each PR had
been green alone. Session B's fix on #239 (`78cc812e6`) is the worked example: an
`_insert(table, **cols)` helper over `text()`, fixtures naming only columns present from
`fed5ed4916a8` onward, and a `finally` that swallows the rollback's own exception, removes the
session and always re-upgrades.

**How to apply:**
- The `check` above only locates walks (`downgrade\(` under `backend/padel_app/tests/`); the
  condition is prose: every file it finds must do its fixtures with `text(` and end its walk in
  a `finally:` whose last statement is `upgrade()`.
- Grep your walk for `from padel_app.models` and for any service call between `downgrade(`
  and `upgrade(` — each is a head-schema dependency.
- The parent you downgrade to is a moving target on a stacked branch or a batch: write the
  fixture for the OLDEST schema the walk can meet, not for today's.
- The `finally` shape is: `try: db.session.rollback() except Exception: pass`;
  `db.session.remove()`; `upgrade(directory=…)`.
- Run the walk with at least one later test file after it — the strand shows up there, not
  in the walk.
- This is the sibling of R-034's reproduction cell: the walk must have been seen failing on
  the defect it guards, but it must never be able to fail the tests that follow it.
- Number R-037 confirmed by the coordinator on 2026-09-16.
