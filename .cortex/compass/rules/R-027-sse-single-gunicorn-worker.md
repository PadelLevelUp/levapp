---
id: R-027
title: "SSE fan-out is per-process: one gunicorn worker until a shared broker exists"
source:
  - ../../atlas/decisions/2026-09-09-single-worker-until-sse-broker.md
governs:
  - backend/Dockerfile
  - backend/padel_app/realtime.py
  - .github/workflows/deploy-prod.yaml
  - .github/workflows/deploy-staging.yaml
---

# R-027 — SSE fan-out is per-process: one gunicorn worker until a shared broker exists

`padel_app/realtime.py` keeps the SSE subscriber registry in memory, keyed by user id, in the
process that accepted the connection. `publish(event, user_ids)` walks that dict. A second
gunicorn worker would start with an empty dict of its own: a message created in worker B is
published to worker B's queues only, and every client attached to worker A silently misses it
— no error, just missing live updates and a stale unread badge. APScheduler has the same
one-process constraint for a different reason (duplicate jobs).

**Must:** `backend/Dockerfile` keeps `--workers 1` (raise `--threads`, never workers) and no
deploy workflow overrides it. Nobody "scales" prod by adding workers.

**Until:** `publish`/`subscribe` are backed by a shared broker (Redis pub/sub or equivalent),
at which point this rule is replaced by one that names the broker as the requirement.

*Surfaced by audit item M19; recorded by PAD-237 (2026-09-09).*

**Check (manual, no automated pattern):** backend/Dockerfile's gunicorn CMD keeps `--workers 1` until realtime.publish is backed by a shared broker.
