---
id: decision.2026-10-10-deploy-overlap-and-scheduler-leader
title: Deploys overlap two API processes for seconds; one scheduler leader by advisory lock (PAD-588)
date: 2026-10-10T14:00:00Z
compass_rules: [R-027]
supersedes: []
sources:
  - ../../../backend/padel_app/scheduler_leadership.py
  - ../../../backend/padel_app/scheduler.py
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

**Accepted cost.** During the overlap an SSE event published in one process does not reach streams
attached to the other until they reconnect; the old container stopping closes its streams within
seconds. Jobs added by the non-leader during the overlap are picked up when the leader next wakes
or when the new process takes over (APScheduler re-reads due jobs on resume).

**Revisit when** a shared broker replaces the in-process SSE registry (R-027's own "until"), at
which point permanent multi-process serving becomes possible and leadership stays as the
scheduler's guard.
