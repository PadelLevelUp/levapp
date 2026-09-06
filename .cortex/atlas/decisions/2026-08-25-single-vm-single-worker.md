---
id: decision.2026-08-25-single-vm-single-worker
title: Run the whole system on one VM at a single gunicorn worker
date: 2026-08-25T00:00:00Z
provenance:
  - derives_from: archive/documents/infra-handoff-2026-08-25/source.md
---

# Run the whole system on one VM at a single gunicorn worker

The API, web SPA, Postgres and the issue bot all share one GCE e2-micro. The API
runs at **exactly one gunicorn worker**, and this is a constraint rather than a
tuning choice: APScheduler's `BackgroundScheduler` runs in-process
(`backend/padel_app/scheduler.py`) and SSE fan-out is a module-level in-memory
list of queues (`backend/padel_app/realtime.py`). A second worker would duplicate
every scheduled job and break SSE delivery for any client not pinned to the right
process.

The consequence is a hard scaling ceiling. Each open SSE connection pins a thread,
putting the practical limit near 60 concurrent clients; the 2026-06-10/11
post-mortem traced a production wedge to `q.get()` without a timeout leaking
threads on silent disconnects, fixed with 15-second keep-alives. Expo push sends
still run synchronously in the request path on the same thread pool.

Escaping the ceiling is not a config change: the scheduler must move to a separate
process or a DB-locked leader, and SSE to Redis pub/sub or a dedicated async
service. Recorded here so the constraint is visible before anyone raises the
worker count to "improve throughput" — which would silently double every
notification the scheduler sends.
