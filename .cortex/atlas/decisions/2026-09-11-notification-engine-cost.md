---
id: decision.2026-09-11-notification-engine-cost
title: Notification engine cost (audit M17/M18) — measured; the cheap engine fixes shipped, push and the job store need an owner decision
date: 2026-09-11T14:00:00Z
compass_rules: [R-010, R-027]
supersedes: []
sources:
  - ../../archive/documents/data-model-audit-2026-09-02/extracted/findings.md
  - ../../../backend/scripts/notification_cost_probe.py
---

# Notification engine cost — measured; cheap fixes shipped; two decisions for the owner

**Status: DRAFT.** Sections 1–3 are measurements and what PAD-276 shipped. Section 4 is
the decision the owner has to take; the coordinator carries it. Nothing in section 4 is
implemented.

PAD-276 groups audit findings M17 (the invitation engine costs 6–12 queries per
candidate; Expo push blocks the scheduler thread) and M18 (the reminder job store is
rewritten daily and at every boot). The audit estimated; the ticket asked for a
measurement first. This entry records the numbers so the decision is taken on them.

## 1. How it was measured

`backend/scripts/notification_cost_probe.py` (same shape as the PAD-277 SSE load test)
builds a throwaway Postgres database with the real migrations, seeds it, and runs the
real code paths with a statement counter on the engine and a stub in place of the Expo
HTTP call. Nothing touches staging or prod; no network. Seed, chosen to look like a
small academy on the current app (the audit's "300 candidates"):

| Dimension | Size |
|---|---|
| Coaches | 3 |
| Roster students per coach | 300 (each with an iOS device token; 10 % with a weekly availability blocker) |
| Weekly recurring lessons per coach | 30 (60-day horizon → 747 reminder occurrences) |
| Materialised future instances per coach | 60 (first one has 3 enrolled players and 1 open vacancy) |
| Presence history | 8 past classes per coach, one presence per student (7,209 rows) |
| Engine config | defaults: 3 invitation groups, 3 per batch, 10 per class, 120 min inactivity |
| Expo stub latency | 150 ms per call (worst case in prod: the 10 s timeout) |

Everything below is one run on the developer Mac with Postgres 15 on localhost; the
statement counts are exact, the milliseconds are indicative.

## 2. What was found

### M17 — the engine (before PAD-276's fix)

| Path | Statements | Time |
|---|---|---|
| `evaluate_candidates`, one wave, 300 roster | 898 = **3 per candidate** (lazy-load `players`, lazy-load `users`, one `calendar_blocks` query each) | 0.7–0.9 s |
| `_rank_invited`, 296 survivors | 296 = **1 per survivor** (`presences` for the attendance stats) | 0.4 s |
| `_send_invitation_batch`, 3 invited | 1,090–1,275 in total; **≈30 statements, 6 commits and 2 blocking HTTP calls (web push + Expo) per invitation sent** | 1.5–2.0 s (0.46 s of it on the wire) |
| `process_invitation_batches`, 3 fresh vacancies | 3,250 statements, 57 commits | 4.8 s (1.4 s on the wire) |
| idle tick (no open vacancy, every 2 min) | 5 | 13 ms |
| standing waiting-list fan-out, 60 instances | 249 = 4 per instance | 0.35 s |

The audit's "6–12 per candidate, 2,000–3,500 per batch" was 2–3× too high, but the shape
was right: cost is linear in the roster, and it is paid again on every batch, every
2-minute tick that finds a vacancy past its inactivity timer, and every decline
(`_send_next_on_decline`).

### M17 — after PAD-276's fix

Three behaviour-preserving changes: the roster query eager-loads player and user; one
`calendar_blocks` query per wave (`blocked_user_ids_for_window`, the per-user function
now delegates to it); one `presences` query per ranking (`_attendance_stats_for`).

| Path | Before | After |
|---|---|---|
| one wave, 300 roster | 898 stmts / 0.8 s | **13 stmts / 35 ms** |
| ranking 296 survivors | 296 stmts / 0.4 s | **4 stmts / 19 ms** |
| one batch (3 invited) | 1,090 stmts / 1.5 s | **111 stmts / 0.7 s** (0.46 s is the stubbed push) |
| one tick, 3 vacancies | 3,250 stmts / 4.8 s | **334 stmts / 1.85 s** (1.4 s is the stubbed push) |

The wave cost no longer depends on the roster size (guarded by
`test_pad276_engine_query_cost.py`, which runs the same wave at 6 and at 60 students).
What remains per batch is the send path: ~30 statements and 6 commits per invitation
sent, which is the per-call-commit pattern PAD-272 owns, and the push calls (§4.1).

### Push — blocking, in the scheduler thread, holding a connection

`_send_system_message` calls web push and then Expo push synchronously. During the
stubbed call the engine's pool showed one connection checked out: the worker holds
its DB connection for the whole HTTP round trip. Every automatic send runs inside an
APScheduler job (`process_batches`, `invite_start_*`, `reminder_*`), so the wait is
paid in the scheduler's `ThreadPoolExecutor(max_workers=10)`, which shares the app's
connection pool. Worst case per invitation at the 10 s timeout, two channels: 20 s;
per batch of 3: 60 s; a reminder job for a full class of 4: 80 s. `process_batches`
has `max_instances=1` and `coalesce=True`, so a slow tick makes the next tick skip
rather than pile up — invitations are delayed, not duplicated.

### M18 — the job store (unchanged by PAD-276)

| Operation | Statements | Time |
|---|---|---|
| `_startup_reschedule` inside `create_app` (every deploy) | 1,092 INSERTs, 1,092 commits → 1,092 jobs (747 `reminder_lesson_*`, 180 `invite_start_*`, 165 `reminder_*`); table 754 KB | **1.0–1.9 s** |
| `extend_schedule_window` (daily) | 747 failed INSERTs + 747 UPDATEs + 747 commits (APScheduler's `replace_existing` tries the insert first) | **1.2–2.4 s** |
| `get_jobs()` (unpickle all 1,092) | 1 | 12 ms |
| `cancel_lesson_reminder_jobs` (one lesson) | 9 | 16 ms |
| `schedule_lesson_reminder_jobs` (one lesson) | 8 | 8 ms |

The audit's "700–1,000 job-store writes at boot" is confirmed (1,092 here). What it
implies is not: at this size the boot cost is about two seconds once per deploy, the
daily rewrite about two seconds once per day, and the per-edit unpickle is 12 ms. None
of these is a problem now. They grow linearly with coaches × lessons: ten times the
academies is ~20 s of boot inside `create_app`, which is when the boot work should move
out of the request path (§4.2), still without redesigning the job model.

## 3. What PAD-276 shipped

- The three batched stages above (backend only; no API, web or iOS change).
- `backend/scripts/notification_cost_probe.py` so the numbers can be reproduced after
  any engine change.
- `notifications.invitations`: a non-functional rule that a wave costs a bounded number
  of statements independent of roster size, with the test as its criterion.

Not shipped, deliberately: anything that changes when a push is sent, how jobs are
stored, or transaction boundaries. Those are the owner's decisions below.

## 4. Decisions for the owner

### 4.1 Push off the calling thread — recommended, next ticket

**Option A (recommended): a small in-process sender.** `send_expo_push` and
`send_push_notification` do the DB lookups (device tokens, subscriptions, the unread
badge) on the caller's thread as today, then hand the HTTP call to a bounded
`ThreadPoolExecutor(2)`. The `DeviceNotRegistered` cleanup runs in the worker under its
own app context and session. Cost: about one day including the tests that patch
`requests.post`/`webpush` (they must patch the worker's call or run it inline via a
test flag). Behaviour change: a push may arrive a few hundred milliseconds later than the
in-app message and is dropped if the process exits with the queue non-empty — both
already true in spirit (best-effort, logs-and-swallows). Keeps R-027's single worker.

**Option B: leave it.** Only justified if the academies stay at today's size and Expo
stays healthy; a 10 s Expo outage today turns one reminder job into an 80 s stall of
one of ten executor threads and one of fifteen pool connections. Cheap to live with
now, expensive on the day it matters.

**Option C: a queue table + a worker job**, i.e. an outbox. Right long-term shape if
push ever needs retries or delivery receipts; a week, and it wants the shared broker
question (R-027) answered first. Not now.

### 4.2 Scheduler job model — recommended: keep it, two cheap tweaks when needed

**Option A (recommended): keep one DateTrigger job per occurrence.** Measured cost is
two seconds per deploy and two seconds per day. R-010's job-id scheme and the PAD-121
self-heal keep working. Two cheap follow-ups, each a few lines, to schedule when the
numbers say so (a boot over ~5 s, i.e. roughly 3,000 jobs): (i) run `_startup_reschedule`
as a one-shot scheduler job a few seconds after `sched.start()` instead of inline in
`create_app`, so a deploy serves requests immediately; (ii) in
`schedule_lesson_reminder_jobs`, skip `add_job` when the job exists with the same
`next_run_time`, which turns the daily rewrite into one `get_jobs()` plus the new
occurrences.

**Option B: the audit's single interval job** (one `due_reminders` job that reads
what is due from the lessons themselves). Removes the job store's growth entirely but
replaces R-010, the self-heal, misfire handling and the per-occurrence cancel semantics
with new code; about a week plus the reminder specs' rewrite. The measurement does not
justify it at this or ten times this size.

### 4.3 Out of scope here, already ticketed

- ~30 statements and 6 commits per invitation sent, and every `.create()`/`.save()`
  being its own transaction: PAD-272 (request-scoped transactions).
- The standing waiting-list fan-out at 4 statements per future instance: a coach
  action, rare, bounded by the instance count; batching it is a ten-line change that
  can ride on PAD-271's vacancy work.

*Measured and drafted by Session J (PAD-276), 2026-09-11. The audit findings are in the
archive above; the ticket is https://linear.app/padellevelup/issue/PAD-276.*
