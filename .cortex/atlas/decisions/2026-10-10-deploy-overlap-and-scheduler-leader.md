---
id: decision.2026-10-10-deploy-overlap-and-scheduler-leader
title: Deploys overlap two API processes for seconds; one scheduler leader by advisory lock (PAD-588)
date: 2026-10-10T14:00:00Z
compass_rules: [R-027]
supersedes: []
sources:
  - ../../../backend/padel_app/scheduler_leadership.py
  - ../../../backend/padel_app/scheduler.py
  - ../../../backend/padel_app/worker.py
---

# Deploys overlap two API processes for seconds; one scheduler leader by advisory lock

**Decision (2026-10-10, PAD-588).** A zero-downtime deploy starts the new API container before the
old one stops, so for a few seconds two processes serve. R-027 stays as written (`--workers 1` in
each container). Its second constraint, that APScheduler must not run twice against the shared
Postgres job store, is kept by a Postgres session advisory lock: every process starts its
scheduler paused and only the lock holder resumes it.

**Why a lock rather than a stop-first deploy.** Stop-first is the 502 window the ticket removes.
Why not a flag passed by the deploy: the lock also covers a Postgres restart (the session and its
lock die together, and the holder pauses until it reacquires) and a crashed container (the lock
frees itself with the session), with no coordination in the workflow.

**Migrations (PAD-691, 2026-10-21).** The overlap now also covers the migration: the deploy's
migrate step (`scripts/migrate.sh`, one-shot container, advisory lock `MIGRATE_LOCK_KEY` distinct
from the scheduler's) runs while the old container serves, then the new container starts. The new
container no longer migrates and refuses to boot behind its head; `/healthz` is readiness (not
behind head) and `/livez` liveness. Expand/contract (spec rule 12) is what keeps the old container
correct on the new schema. The migrate step serialises concurrent runs; it does not change the
scheduler lock.

**Worker role (PAD-695, 2026-10-22).** With `WORKER_SPLIT` on (staging now, prod after B8),
only `ROLE=worker` processes compete for the lock; the API starts its scheduler paused and never
resumes it, as a job-store client that registers no recurring jobs (spec `delivery.worker-role`).
The lock is unchanged and still covers every transition: turning the flag on, the old API holds it
until it stops and the waiting worker takes over; turning it off, the API competes again and the
worker is removed. Because the API now adds jobs the leader did not add, the worker wakes its
scheduler every 5 s while it leads (this replaces the "picked up when the leader next wakes" cost
below for the split). The deploy checks that the new worker actually leads, since with the flag on
nothing else would run the jobs.

**Accepted cost.** During the overlap an SSE event published in one process does not reach streams
attached to the other until they reconnect; the old container stopping closes its streams within
seconds. Jobs added by the non-leader during the overlap are picked up when the leader next wakes
or when the new process takes over (APScheduler re-reads due jobs on resume).

**Revisit when** a shared broker replaces the in-process SSE registry (R-027's own "until"), at
which point permanent multi-process serving becomes possible and leadership stays as the
scheduler's guard.
