---
id: delivery.events-role
status: implementing
depends_on:
  - delivery.worker-role
  - messaging.sse-realtime
implements: ../../specs-business/delivery/a-release-never-drops-a-request.business.md
governed_by: [R-027]
---

# delivery.events-role

### Intent
The live-update streams move out of the API process into their own process (`ROLE=events`, PAD-697),
so they stop holding API threads (PAD-277's ceiling). The role split fixes the measured problem; the
gevent worker class is an optimisation of the events process, to be measured, with threads as the
live fallback (architecture review, 2026-10-22).

### Rules
1. **One route and two probes.** A process with `ROLE=events` runs the same app and image and answers
   only `/api/app/events`, `/api/app/livez` and `/api/app/healthz`; every other path is
   404 `{"error": "NOT_ON_EVENTS"}`. It runs no scheduler in any `WORKER_SPLIT` mode
   (delivery.worker-role rule 1, B-677) and sends no pushes.
2. **The worker class comes from one place.** `backend/scripts/serve.sh` builds the gunicorn command
   for every role; the image's `CMD` runs it, and the GKE manifests must run it too (no second copy of
   the flags). `ROLE=events` runs `--worker-class gevent --workers 1`, with
   `--worker-connections ${EVENTS_WORKER_CONNECTIONS:-1200}` above the stream cap, so the 503 path
   still answers. `EVENTS_WORKER_CLASS=gthread` runs the same role on threads. The other roles keep
   `--threads ${GUNICORN_THREADS:-64}`.
   - Never `--preload`: it loads the app before gevent patches.
   - No access log with the request line or query (`%(r)s`, `%(q)s`): the stream's token rides in
     the query string (PAD-435).
   - The API role never imports gevent.
3. **psycopg2 is cooperative under gevent.** `backend/gunicorn_events.conf.py`'s `post_fork` calls
   `psycogreen.gevent.patch_psycopg()` in the new worker before the app loads. The listener's
   queries and each stream handshake's JWT blocklist lookup then yield to the hub instead of
   blocking every stream. The config is loaded as a plain file, never as `python:padel_app.…`:
   importing the package there would load the app's network stack (ssl, urllib3, jwt) in the
   arbiter before gevent patches.
4. **The events role needs the Postgres broker (R1).** Under `SSE_BROKER=memory` an events process
   receives nothing the API publishes. At start it logs an ERROR, and `/api/app/healthz` answers 503
   `{"status": "events_needs_postgres_broker"}` forever. The rollout never routes to it and the old
   container keeps serving; there is no exit loop.
5. **Readiness follows the listener; liveness never does.** In the events role the listener starts at
   boot, and `/api/app/healthz` is 503 `{"status": "listener_down"}` while it is not LISTENing.
   `/api/app/livez` never depends on the broker or the listener. The API's readiness never depends on
   the listener (messaging.sse-realtime rule 24).
6. **A role-aware stream cap.** The events role's default `SSE_MAX_STREAMS` is 1000 (memory-bound,
   to be measured), set in code by role, not by an env override (PAD-702's "default is the deployed
   value" class). An explicit `SSE_MAX_STREAMS` still wins.
7. **The API answers 410 once the path has moved.** With `EVENTS_SPLIT=on` the API process answers
   `/api/app/events` with 410 `{"error": "EVENTS_MOVED"}`, so a misrouted request is loud. Off
   (default) means the API serves the stream as before.
8. **Deploy order; the 410 comes last (R3).** Per environment:
   1. the events container comes up healthy with `EVENTS_SPLIT` off (`EVENTS_ROLE=on` in the env
      file; the staging workflow runs `rollout.sh` a second time: `--name <api>_events`, its own
      loopback pair, its own upstream, no `--migrate`, `--worker` or `--probe-host`, with
      `NGINX_UPSTREAM_CONF` pointing at the events upstream for B-664's wait);
   2. the owner's host apply switches `location /api/app/events` on every host of that environment
      to the events upstream, in one `nginx -t` (R2);
   3. a later deploy sets `EVENTS_SPLIT=on`.

   Rollback is the reverse. Turning `EVENTS_ROLE` off removes the container, so the host must route
   the path back first.
9. **Staging only in this ticket.** Prod's events role waits for PAD-704's two-copies proof and for
   PAD-692's prod `SSE_BROKER=postgres` (rule 4).

### Acceptance Criteria

#### The events role serves only its route and probes (rule 1)
- **Given** `ROLE=events`
- **When** a client asks for `/api/app/messages/unread_count`, `/api/app/livez`, `/api/app/events` (no token)
- **Then** the answers are 404 `NOT_ON_EVENTS`, 200, and 401 (the JWT layer, not the guard)

#### The API answers 410 on the moved path only when split (rule 7)
- **Given** `ROLE=api`
- **When** `/api/app/events` is requested with `EVENTS_SPLIT=on`, and without it
- **Then** 410 `{"error": "EVENTS_MOVED"}`, and 401 (served as before)

#### The events role is never ready on the memory broker (rule 4)
- **Given** `ROLE=events` and `SSE_BROKER=memory`
- **When** the app starts and `/api/app/healthz` and `/api/app/livez` are asked
- **Then** an ERROR names the missing Postgres broker, healthz is 503
  `events_needs_postgres_broker`, and livez is 200

#### Readiness follows the listener in the events role only (rule 5)
- **Given** the Postgres broker
- **When** the listener is down / up
- **Then** the events role's healthz is 503 `listener_down` / 200; the API's healthz is 200 either way

#### The stream cap default is role-aware (rule 6)
- **Given** no `SSE_MAX_STREAMS`
- **When** the caps are read for `ROLE=events` and for `ROLE=api`
- **Then** they are (1000, 4) and (40, 4); `SSE_MAX_STREAMS=300` gives (300, 4) for events

#### One serve script picks the worker class (rule 2)
- **Given** the image's `CMD` and `scripts/serve.sh`
- **When** the script runs for the api role, the events role, and the events role with `EVENTS_WORKER_CLASS=gthread`
- **Then** it execs gunicorn with `--workers 1 --threads 64`, with `--worker-class gevent --config /app/gunicorn_events.conf.py`, and with threads; neither file uses `--preload`, `%(r)s` or `%(q)s`; the api role never has gevent in `sys.modules`

#### An API publish reaches a stream held by the gevent events process (rules 2–5)
- **Given** an API process and an events process under `gunicorn -k gevent` with psycogreen, on one Postgres
- **When** the API publishes to a user with a stream on the events process
- **Then** the event arrives within 1 s, byte-identical; a non-stream path on the events process is 404

#### A listener drop unreadies the events process, then it recovers (rule 5)
- **Given** the events process ready with a stream open
- **When** its listener connection is terminated
- **Then** healthz turns 503, then 200 again after the reconnect, and the open stream gets a resync

#### 300 streams ride greenlets (rule 2)
- **Given** the events process under gevent
- **When** 300 streams are open (75 users × 4) and one event is published to all 75 users
- **Then** all 300 receive it, and the process's OS thread count rises by fewer than 20

#### The staging deploy rolls the events container on its own pair (rule 8)
- **Given** `deploy-staging.yaml` and `EVENTS_ROLE=on`
- **When** the deploy step runs
- **Then** `rollout.sh` runs a second time with `--name padelapp_staging_events --ports 5104,5106 --upstream levapp_events_staging`, `-e ROLE=events` and `NGINX_UPSTREAM_CONF` set to the events upstream, without `--migrate`, `--worker`, `--probe-host` or the API's third-party secrets; with the flag off, a leftover `padelapp_staging_events` is removed; both staging vhosts route `location /api/app/events` to `levapp_events_staging` with B-182's `error_log … crit`
