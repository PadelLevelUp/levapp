---
id: R-027
title: "SSE fan-out across processes needs the Postgres broker; one gunicorn worker until PAD-704"
source:
  - ../../atlas/decisions/2026-09-09-single-worker-until-sse-broker.md
  - ../../atlas/decisions/2026-10-21-gke-readiness.md
governs:
  - backend/Dockerfile
  - backend/scripts/serve.sh
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
- `backend/scripts/serve.sh` (which the image's `CMD` runs, PAD-697) keeps `--workers 1` in every
  branch, and no deploy workflow overrides it. `test_pad697_events_role` (`test_the_api_role_runs_threads`,
  `test_the_events_role_runs_gevent_and_can_fall_back_to_threads`) and `test_pad689_stream_observability`
  pin it.
- The API runs as one container until PAD-704 proves two copies with `SSE_BROKER=postgres` (and the
  scheduler is out of the API process).
- The events container (`ROLE=events`, delivery.events-role) is a second stream-holding process. It is
  allowed because it never serves without the Postgres broker: under `SSE_BROKER=memory` it is never
  ready (events-role rule 4), so no stream can be routed to a process that receives nothing.
- Any environment that runs more than one stream-holding process sets `SSE_BROKER=postgres`.
- The listener's connection never goes through a transaction-mode pooler.

*Surfaced by audit item M19; recorded by PAD-237 (2026-09-09); broker named by PAD-692 (2026-10-21).*

**Check (manual, no automated pattern):** backend/scripts/serve.sh keeps `--workers 1` in both branches
(the cells above); one API container until PAD-704; an events container only with SSE_BROKER=postgres.
