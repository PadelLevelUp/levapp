---
id: decision.2026-09-11-request-scoped-transactions
title: Session lifecycle (audit M8/M8b) — one transaction per operation, opt-in first; the owner picks how far and how fast
date: 2026-09-11T16:00:00Z
compass_rules: [R-007]
supersedes: []
sources:
  - ../../archive/documents/data-model-audit-2026-09-02/extracted/findings.md
  - ../../../backend/padel_app/tools/unit_of_work.py
---

# Session lifecycle — one transaction per operation, opt-in first

**Status: DRAFT.** Sections 1–2 are facts; section 3 is what PAD-272 shipped as the pilot;
section 4 is the decision for the owner. The coordinator carries it.

## 1. What the code does today

`padel_app/model.py`'s mixin commits on every `create()`, `save()` and `delete()`. Counted
on staging 72ac170a8: **188 call sites** through the mixin (notification_service 60,
lesson_service 47, calendar_service 14, player_service 12, messaging_service 12,
import_service 11, coach_service 10, training_service 5, api 5, class_join_request 4,
user_service 3, editor_api 3, availability 2, club_service 2) plus ~45 direct
`db.session.commit()` calls in the newer services (club, join requests, consent, email
verification, join/claim/invite). One row per transaction: a multi-step operation that fails
part-way leaves what it had already written. The audit's examples are real —
`create_player_helper` was four commits (user, player, coach link, level history); a level
id that does not exist failed on the third and left an orphan user and player.

Three places already contain the damage with a savepoint (`begin_nested()` opened outside
the `try`, PAD-117's shape): instance materialisation's standing-list sync
(`lesson_service`), conversation creation (`messaging_service`, the H6 fix) and one site in
`notification_service`.

Session lifecycle: Flask-SQLAlchemy's scoped session, `db.session.remove()` in
`teardown_appcontext` (which discards any open transaction — nothing is committed by the
framework). There is no `after_request` commit and no rollback-on-exception hook; a Postgres
error mid-request leaves the session in a failed state until teardown, which is how one
failed statement poisoned every later query of the same request (M8's "poisons the session").
APScheduler jobs run in their own threads under their own app contexts, so any request-level
hook would not cover the engine.

## 2. The fix shapes, with costs

**A. Savepoints at the known multi-step sites** (the audit's short term). Wrap split, accept,
materialise, player creation and batch sending each in `begin_nested()` + one commit. Cost:
one to two days for the six or seven known sites; leaves the other ~180 commits and the
poisoned-session behaviour alone. No lifecycle change. Safe, incremental, but each site is a
hand-written exception and the next multi-step service will not have one.

**B. Request-scoped transaction** (the audit's long term). Services never commit; one
`db.session.commit()` in `after_request` on success, rollback on exception; the mixin's
`commit()` becomes `flush()` everywhere. Cost: two to three weeks, because it is not only
the 188 sites. Three things break silently if done naively: (1) `publish()` (SSE) and the
push senders run inside services — under B they would fire before the commit, so a client
could receive `message_created` for a row that is then rolled back or not yet visible;
every publish has to move after the commit (an outbox or a "post-commit hooks" list on the
session). (2) The scheduler's jobs (`_run_process_batches`, reminders, `invite_start_*`)
are not requests; each runner needs its own explicit transaction, and
`process_invitation_batches` today relies on per-vacancy commits so that one bad vacancy
does not roll back the batch — that becomes a savepoint per vacancy. (3) ~200 backend tests
read rows back through fresh sessions after calling a service; they keep passing only if the
test harness commits for them (an autouse fixture) or every service entry point is wrapped.
Postgres row locks (PAD-261's `SELECT … FOR UPDATE`) would be held for the whole request
instead of one statement, which is correct but changes contention.

**C. One transaction per service operation, opt-in, then default** (recommended). A tiny
`unit_of_work()` context manager and `@transactional` decorator; while one is open the mixin
flushes instead of committing, and the block commits once and rolls back on exception. Each
service entry point (route handler → service function; scheduler runner → job function) is
wrapped one module at a time, tests running after each. Publishes stay where they are for
now because the unit commits at the end of the service call, before the route serialises
the response — the SSE race in B exists only where publish happens before the unit's
commit, which today is the same instant. Cost: half a day of helper (done, §3), then about a
day per large service (notification_service and lesson_service are the two that matter),
an afternoon each for the others. When every entry point is wrapped, B's request-scoped
commit is a two-line change to the decorator's placement, and the mixin's `commit()`
branch can be deleted.

**D. Slim the mixin** (M8b; independent of A–C). `model.py` fuses the ORM mixin with the
admin form DSL (`get_create_form`, `display_all_info`, `update_with_dict`, `page_title`,
GCS image helpers). The editor (PAD-267, `settings.admin-editor`) is the only consumer of
the form DSL; `update_with_dict`'s "relationships only when truthy, columns only when
non-None" rule is the root of PAD-69/93/28. Moving the DSL to an admin registry keyed by
model name and leaving timestamps + `create/save/delete` in the mixin is a mechanical
one-day change with the editor's tests as the net; it is not a prerequisite for C.

## 3. What PAD-272 shipped (the pilot)

- `backend/padel_app/tools/unit_of_work.py`: `unit_of_work()`, `transactional`, `active()`,
  `commit_or_flush()`. Thread-local depth counter; nested blocks join the outer one.
- `padel_app/model.py`: `create()`, `save()` and `delete()` call `commit_or_flush()` — a
  commit outside a unit of work (unchanged for the other 187 sites), a flush inside one.
- Pilot module: `player_service.add_player_service` is `@transactional`. A player whose
  level does not exist now leaves no rows behind (players.create rule 9 and its criterion;
  `test_pad272_unit_of_work.py`).

Nothing else is wrapped. The helper is inert until a service opts in.

## 4. The decision for the owner

1. **Direction:** C (opt-in per service, then default) — recommended; or A (savepoints at
   the known sites only); or straight to B.
2. **If C: order and pace.** Recommended order: `lesson_service` (split, materialise —
   the audit's "two overlapping series" and "instance with no coach link"), then
   `notification_service` (accept, batch send — "accept a player enrolled with the vacancy
   open", "events `sent` with no message"), then the rest by commit count. One PR per
   service, full suite each time; roughly a week of a session's time in total, no
   migration, no client change.
3. **Whether D rides along** (mixin slimming, one day, editor tests as the net) or waits.
4. **Publish/push ordering under B**, when B comes: outbox table vs post-commit hooks. Not
   needed for C.

*Drafted by Session J (PAD-272), 2026-09-11. Pilot in PR of the same ticket.*
