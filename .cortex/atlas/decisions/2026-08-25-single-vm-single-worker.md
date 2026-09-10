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

## Update 2026-09-10 — SSE streams are capped (PAD-277, audit M19)

The single worker stays. What changed is that SSE can no longer take every thread:
at most `SSE_MAX_STREAMS` streams (default 40) are open at once, and a stream over
that cap gets an immediate `503` with `Retry-After: 10`, so 24 of the 64 threads
always stay free for ordinary API requests. Past `SSE_MAX_STREAMS_PER_USER`
(default 4) the user's oldest stream is evicted instead, so a reload always gets
through. A keep-alive every `SSE_KEEPALIVE_SECONDS` (default 5, it was 15) is how a
vanished client is noticed. Clients now share one connection per web tab and per
iOS app, and they reconnect with exponential back-off and jitter. The rules are in
`messaging.sse-realtime` 11–17, which also records why gevent was rejected.

Measured with `backend/scripts/sse_load_test.py` against gunicorn run with the
production flags (`--workers 1 --threads 64 --timeout 3600`). Each run opened N
streams from distinct users, then timed 5 ordinary requests (`GET /api/app/healthz`,
5 s timeout). Machine: 8-core Mac, Python 3.11, local Postgres 14; 2026-09-10. The
"after" runs happened while a full Playwright batch ran on the same machine (load
average about 440–460); the "before" runs' load was not recorded.

| Streams | Before (staging 58e7ab0) | After (PAD-277, final code) |
|---|---|---|
| 20 | 20 accepted; probe median 5.7 ms, max 10.8 ms | 20 accepted; probe median 2.8 ms, max 3.3 ms |
| 70 | 44 answered, 26 never answered; **5 of 5 probes timed out at 5 s** | 40 accepted, 30 refused with 503 at once; probe median 2.3 ms, max 5.1 ms |
| 6 from one user | not measured (no per-user limit existed) | 6 accepted; that user's 2 oldest streams evicted, 4 remain; probe median 1.7 ms |

"Answered" before PAD-277 means a status line within 17 s. Back then a stream
wrote nothing until its first keep-alive, 15 s in; it now writes a `retry:` hint
at once.

To compare, rerun the script with the same flags. Wait at least 15 s between
runs: a client that vanished keeps its slot until a keep-alive write fails, up to
about two keep-alive intervals (5 s each by default). Mint tokens with an explicit
lifetime, as the script's docstring explains.

The ceiling itself is unchanged: 40 concurrent streams is the capacity of this
single worker. Going past it still needs what this decision already names: Redis
pub/sub or a dedicated async SSE service, and the scheduler out of process.
