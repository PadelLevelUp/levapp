---
id: R-027
title: "SSE fan-out across processes needs the Postgres broker; one gunicorn worker until PAD-704"
source:
  - ../../atlas/decisions/2026-09-09-single-worker-until-sse-broker.md
  - ../../atlas/decisions/2026-10-21-gke-readiness.md
governs:
  - backend/Dockerfile
  - backend/padel_app/realtime.py
  - .github/workflows/deploy-prod.yaml
  - .github/workflows/deploy-staging.yaml
---

# R-027 — SSE fan-out across processes needs the Postgres broker; one gunicorn worker until PAD-704

`padel_app/realtime.py` keeps the SSE subscriber registry in memory, keyed by user id, in the
process that accepted the connection. With `SSE_BROKER=memory` (the default) `publish(event,
user_ids)` walks only that dict: a second gunicorn worker or container would start with an empty
dict of its own. A message created there is published to its own queues only, and every client
attached to the other process silently misses it. There is no error, just missing live updates and
a stale unread badge.

Since PAD-692 (2026-10-21) the broker is **Postgres LISTEN/NOTIFY**, superseding the 2026-09-09
Redis choice ([GKE readiness](../../atlas/decisions/2026-10-21-gke-readiness.md)): with `SSE_BROKER=postgres` every stream-holding process runs one listener on a
dedicated connection and receives every event (`messaging.sse-realtime` rules 20-24).
APScheduler has the same one-process constraint for a different reason (duplicate jobs); that one
is PAD-695's.

**Must:**
- `backend/Dockerfile` keeps `--workers 1`, and no deploy workflow overrides it or runs a second
  API container, until PAD-704 proves two copies with `SSE_BROKER=postgres` (and the scheduler is
  out of the API process).
- Any environment that runs more than one stream-holding process sets `SSE_BROKER=postgres`.
- The listener's connection never goes through a transaction-mode pooler.

*Surfaced by audit item M19; recorded by PAD-237 (2026-09-09); broker named by PAD-692 (2026-10-21).*

**Check (manual, no automated pattern):** backend/Dockerfile's gunicorn CMD keeps `--workers 1` until
PAD-704; any multi-process setup sets SSE_BROKER=postgres.
