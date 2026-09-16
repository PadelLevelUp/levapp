---
id: decision.2026-09-09-single-worker-until-sse-broker
title: Production stays on one gunicorn worker until SSE has a shared broker
date: 2026-09-09T23:30:00Z
compass_rules: [R-027]
supersedes: []
sources: []
---

# Production stays on one gunicorn worker until SSE has a shared broker

The messaging and notification live updates ride on an in-memory, per-process SSE registry
(`padel_app/realtime.py`, PAD-206 made it per-user). Audit item M19 flagged the consequence:
a second gunicorn worker cannot see the first worker's connections, so live events would
reach only a fraction of clients, with no error to notice. The Dockerfile already ran a single
worker for APScheduler's sake; this decision makes the SSE constraint explicit so nobody adds
workers to "fix" load and quietly breaks realtime.

**Decided:** one worker, many threads (`--workers 1 --threads 64`) is the deployment shape.
Horizontal scaling is a feature: a shared broker (Redis pub/sub) behind `publish`/`subscribe`,
then this decision is superseded.

**Why not fix it now:** current load fits one process comfortably; the broker is an
infrastructure change (a Redis instance in Cloud Run's network, config, failover) that belongs
to its own ticket, not to a messaging follow-up.

Recorded by PAD-237 (Session A, overnight wave 2).
