# Summary — LevApp Data Model Audit (2026-09-02)

A six-angle audit of the `levelup_backend` data model as it stood at pre-monorepo
commit `98d58ca` (Flask, SQLAlchemy 1.4.52, Alembic 1.13.2, Postgres 15; prod is one
gunicorn worker with 64 threads and an in-process APScheduler on a GCE VM). It read all
46 SQLAlchemy models, all 46 Alembic migrations, and every service that writes to them,
from six briefs run in parallel and then reconciled: physical schema, domain design
against the spec tree, runtime integrity and concurrency, security and privacy,
performance and scale, migrations and maintainability. Items marked **verified** were
reproduced by running code or reading the exact lines; the rest are inferred.

The audit's own durable copy is a Claude artifact linked from Linear **PAD-188**, which
owns the follow-up of turning findings into tickets (due 2026-09-10). This archive entry
is the same document; `extracted/findings.md` holds every finding with its evidence.

Verbatim source: `source.html` (gitignored — schema §4.4).

## Verdict

The domain model is the right shape and does not need redesign: Lesson is a recurring
template, LessonInstance one materialised occurrence, enrolment a junction row,
attendance a Presence, substitution a Vacancy fed by NotificationEvents, and the real
"student record" is the (coach, player) pair. The problems are in three places:

1. **Facts stored twice that drift** (per-occurrence enrolment in three tables, player
   level in four stores, coach ownership in two junctions, per-instance copies of
   template fields).
2. **What the database is not allowed to enforce** — cascades, nullability, indexes,
   uniqueness, authorization. No foreign key is indexed (80 columns). Tests run on
   SQLite with FK enforcement off, so none of this is ever exercised where it runs.
3. **A base mixin that fuses the ORM with an admin form DSL, per-call commits and
   Google Cloud Storage** (188 implicit commits; the transaction unit is one row, not
   one request).

Counts: 3 critical, 13 high, 23 medium findings; 80 unindexed FK columns; 188 implicit
commits via the mixin; 0 tests that run on Postgres.

## The twelve that matter most

| # | Finding | Severity | Fix cost |
|---|---|---|---|
| C1 | Anyone can set any user's password via the unauthenticated activation route | Critical | Small |
| C2 | Deleting a coach level deletes the roster rows at that level, with notes and evaluations | Critical | Small |
| C3 | Class times are Lisbon wall-clock stored as if UTC; every deadline/reminder/quiet-hour calc is 1h off in summer | Critical | Medium |
| H1 | Any coach can read any class with every participant's email and phone | High | Small |
| H2 | Messaging has no participant check; SSE broadcasts every message to every client | High | Small / Medium |
| H5 | Per-occurrence enrolment lives in three tables that demonstrably disagree; capacity under-counts | High | Medium |
| H6 | Deleting a user orphans its player/coach row; a one-participant conversation makes the messages page a permanent 500 | High | Small |
| H8 | Capacity and "one winner per vacancy" are check-then-write with no lock and no unique key | High | Medium |
| H9 | Coach dashboard runs the calendar pipeline twelve times per paint | High | Small |
| H11 | No foreign key is indexed; composite uniques serve only their leading column | High | Small |
| H12 | The scheduler starts inside every production migration (`python -m flask`) | High | Tiny |
| H13 | No CI gate for multiple Alembic heads or drift; autogenerate has already dropped the job table once | High | Small |

## What to leave alone (audit §15)

User/Coach/Player profile split; `coach_in_player` as the student record; lazy
materialisation keyed on `(lesson_id, occurrence_date)`; Vacancy snapshotting side and
level; `ReplacementApprovalPrompt.queue_snapshot`; the `participant_key` trick; reusing
CalendarBlock for student blockers; business rules in services not ORM classes; the
per-vacancy NotificationEvent ledger; secrets in env; werkzeug scrypt; 256-bit invitation
tokens; the explicit allow-list in `update_own_profile_service`.

## Recommended sequence (audit §16)

**This week — stop the bleeding:** remove or token-gate `/activate/user/<id>` and
`/register/user/<id>` (C1); drop the CoachLevel cascade and SET NULL on the level and
`invited_by_coach_id` FKs (C2, H7); ownership checks on class/instance/presence routes,
participant check in message and reaction services, enrolment check in
`respond_to_reminder`, scope `/users` (H1–H4); `current_club` → `clubs[0]` (M3); scheduler
skip via `is_migration_invocation()` (H12); index migration incl. unique
`players(user_id)`, `coaches(user_id)` and the occurrence key (H11, H8, H6, M14); CI job
for one head + `flask db check` (H13).

**This month — make the DB tell the truth:** decide what stored times mean, then convert
at the edge or model the timezone, before PAD-129/130 (C3); one `enrol_in_instance`
writer and reconcile links vs presences (H5); nullability hygiene migration and
`onupdate` on the mixin (M12, M13); vacancy reconciliation on the two-minute tick,
`with_for_update` on accept and materialise (M4, H8); calendar coach filter in SQL,
dashboard loads events once, conversation denormalisation and pagination, retention job
(H9, H10, M16); editor env-gate and redaction (M9); deletion completeness and private
GCS (M10); JWT hygiene (M11); scoped SSE with a per-user queue map (H2, M19).

**This quarter — pay down design debt:** presence response enum (M5); reminder table out
of `msg_metadata` (M6); `series_id` / `excluded_dates` (M7); level history on edit and
derive instance coaches from the lesson (M1, M2); split the editor out of the ORM, slim
mixin, explicit commits starting with the engine (M8); batch engine queries, push HTTP
off-thread (M17); scheduler by id, then a single interval job (M18); promote typed config
settings to columns (M21); Postgres in tests plus authz and registry iteration tests
(M20).

**Defer:** SQLAlchemy 2.0 typed mappings, club as tenant, collapsing Coach and Player,
virtual-occurrence recurrence.

## Alternatives on record (audit §14)

Recommended: Presence as the only per-occurrence enrolment (drop
`player_in_lesson_instance`, add `enrolment_source`); derive instance coaches from the
lesson with an optional `coach_override_id`; level history as source with the junction
column as cache; a real timezone model (`Lesson.timezone`, Time columns, aware
expansion, true-UTC instances) before PAD-129/130, with edge conversion as an acceptable
interim; presence response enum + `recorded_by`; reminder table instead of
`msg_metadata` (after the engine refactor); editor split out of the ORM; coach as the
stated tenant; index migration + retention job first; single interval scheduler job
after the cheap fixes; Postgres in tests; CI heads/check + generated revision ids +
separate migration container; a native-enum-vs-CHECK policy; promote typed
NotificationConfig settings; scoped SSE (per-user map first, Redis pub/sub before any
multi-academy rollout).

Rejected: virtual occurrences plus an exceptions table (add `series_id` and
`excluded_dates` instead); collapsing Coach and Player into User (let `/auth/me` return
both roles instead); club as tenant (only if academies share rosters).

## What was and was not verified (audit §17)

Executed: level-delete cascade and user-delete orphan probes; lesson-delete statement
count; live dev DB introspection at head; `argv[0]` under `python -m`. Read line by
line: the activation route and its allow-list test, the calendar instance query, the SSE
bus, the date builder and the web client's time submission, the scheduler skip guard and
entrypoint, the registry typo, `current_club` ordering, the double `__table_args__`.

Not verified: prod row counts beyond the 3,117 presences in the PAD-93 migration; whether
any prod user has duplicate profile rows; the prod VM timezone; whether a coach who typed
10:00 sees 10:00 in prod today (the deciding check for C3).

Corrected during review: the briefing assumed a Redis-backed SSE bus (it is an
in-process list) and that the presences unique constraint might be missing from
migrations (it is present).
