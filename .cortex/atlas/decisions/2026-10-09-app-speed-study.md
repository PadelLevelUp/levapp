---
id: decision.2026-10-09-app-speed-study
title: Why LevApp sometimes feels slow — measured causes, ranked, and the follow-up tickets (PAD-571)
date: 2026-10-09T20:30:00Z
compass_rules: [R-027, R-036, R-014]
supersedes: []
sources:
  - ../../../backend/scripts/perf_baseline.py
  - ../../../backend/scripts/perf_budgets.json
  - ../../../infra/nginx/nginx.conf
  - ../../../infra/nginx/conf.d/levapp-log-redaction.conf
---

# Why LevApp sometimes feels slow — measured causes, ranked (PAD-571)

**Status: STUDY, draft 1 (2026-10-09).** Nothing here was changed on production. The full study,
with the raw survey outputs and every `file:line` citation, is local in `docs/plans/pad-571/` (R-036:
`docs/` is untracked); this entry carries the facts that must outlive the machine. Code is
`origin/staging` 4757c13d9; production ran ae03093c8 during the probes. Operational identifiers are
deliberately absent (R-036): "the VM" is the production host, reached as in the local environment map.

## What changes the answer

1. **The biggest, cheapest fix is on the wire.** The web app is one 2.4 MB JavaScript file served
   uncompressed, with no `Cache-Control`, over HTTP/1.1. Gzip makes it 666 KB (measured by `vite build`);
   an `immutable` cache header makes the second visit free. Host `infra/nginx/nginx.conf` has `gzip on`
   with `gzip_types` commented out (nginx's default compresses `text/html` only) and `gzip_proxied` off;
   the web container's `frontend/apps/web/nginx.conf` has no `gzip` and no `/assets/` cache rule; no
   `listen 443 ssl` line has `http2`. Cloudflare is DNS-only, so nothing compresses on the way. The
   admin console's container (`frontend/apps/admin/nginx.conf`) already does it right.
2. **Every screen is a cold fetch.** Web: `new QueryClient()` with no defaults (`apps/web/src/App.tsx:50`)
   and the five big pages (dashboard, calendar, players, messages, presences) fetch with
   `useEffect`/`useState`, so nothing is cached or reused and `AppLayout` remounts per page. iOS: no
   persisted cache, `staleTime` 30 s, and `useAppStateFocus` refetches every mounted query on every
   AppState change including `inactive → active`.
3. **iOS is non-interactive for ~3.3 s by design**: `LaunchAnimation` (`TOTAL_MS = 2400 + 900`) runs a
   `requestAnimationFrame` + `setState` loop over an SVG tree on the JS thread, on top of a strictly
   sequential cold start (fonts gate the root render → keychain → `/auth/me` → redirect → tabs → first
   queries).
4. **"Sometimes" has three measurable sources on the shared host, none of them CPU** (97 % idle):
   (a) every prod deploy stops the API container and restarts it behind `flask db upgrade` plus the
   boot-time reschedule of every coach's reminder jobs (`scheduler.py:806-843`), while host nginx has
   no fallback upstream → 502; (b) every push to `staging` restarts the staging API on the same host
   AND runs `pg_dump` of prod piped into `pg_restore` of staging inside the one Postgres container
   (`backend/scripts/sync-staging-db.sh:108-109`): ~30 times on 2026-10-08; (c) the host has 975 MB of
   RAM with 372 MB of swap in use and memory/io pressure (`/proc/pressure`, `full` ≈ 2 %) at idle, and
   prod containers run with no memory limit.
5. **Postgres is not the bottleneck today, the query shapes are.** The database is 22 MB with a
   99.99 % buffer-hit rate. The local baseline (`backend/scripts/perf_baseline.py`) measures the
   **student dashboard at 221 SQL statements per request vs 46 for the coach dashboard**: the event
   pipeline runs three times (`helpers/dashboard/player_home.py:106,299,304,325`) and the player
   loader lazy-loads `presences` per instance where the coach loader uses `selectinload`
   (`helpers/calendar_helpers.py:38-71` vs `:111-151`). Coach calendar and dashboard pay one
   `players_relations` lazy load per lesson (`serializers/calendar_event.py:132`: 21 statements for
   20 lessons). Class detail issues the `NotificationConfig` lookup 6 times
   (`serializers/lesson.py:301,327,420`, `services/notification_service.py:411,477`). The calendar's
   one-off lesson loader has no lower date bound (`calendar_helpers.py:20-35`).
6. **Observability cannot answer the ticket's own question.** The `redacted` nginx log format
   (`infra/nginx/conf.d/levapp-log-redaction.conf:28-30`) logs the combined fields only — no
   `$request_time` / `$upstream_response_time` — so per-endpoint latency history does not exist.
   `pg_stat_statements` is available on the host's Postgres 15 but not in `shared_preload_libraries`.
   Container logs reset on every deploy.

## Measured, 2026-10-09

| What | Value | How |
|---|---|---|
| Main JS asset on the wire | 2,424,431 B, no `Content-Encoding`, no `Cache-Control`, HTTP/1.1; 0.49 s on a fast home link from Lisbon | `curl -w` with `--compressed`; `curl --http2` negotiates 1.1 |
| Same asset built locally | 2,403,538 B raw, 666,396 B gzip; one chunk; 0 `React.lazy`; locales bundled eagerly | `vite build`, Node 24 |
| RTT Lisbon → host | 37 / 52 / 110 ms min/avg/max; TLS ≈ 80 ms; a 404 API GET 128–221 ms end to end | `ping`, `curl -w` |
| Host at idle | load 0.05, CPU 97 % idle, 546 MB used + 372 MB swap, PSI memory `full` 1.8 %, io `full` 2.4 %, 0 OOM kills in 30 days, disk 72 % | read-only ssh |
| Containers | prod API 173 MB RSS / 34 threads, no memory limit; staging API capped 400 MB; Postgres 78 MB | `docker stats`, `docker inspect` |
| Postgres | 15.15; `shared_buffers` 128 MB; `effective_cache_size` 4 GB (default; host has 1 GB); `work_mem` 4 MB; `pg_stat_statements` not loaded; prod DB 22 MB; hit 99.99 %; `messages` seq-scanned 39,657 times for 288 M tuples; 68 FK columns without an index | `pg_settings`, `pg_stat_*`, catalog query, read-only |
| Deploy cadence | prod: 30 deploys 09-07→10-09; staging: ~30 on 2026-10-08 alone, 4 on 10-09 | `gh run list` per workflow |
| Backend baseline | student dashboard 221 stmts; coach dashboard 46; coach 6-week calendar 34 stmts / 35 KB; class detail 33; `/api/auth/me` 8–9; cheapest authenticated call 4 | `perf_baseline.py`, local throwaway DB |

Not measured yet (needs a Playwright or simulator slot, or the owner's config change): screen
timings per screen on web desktop/phone and iOS; the per-minute 5xx series around deploys from the
access log; wake-up latency after an idle spell.

## Causes ranked by user impact, with the fix, gain and cost

| # | Cause | Fix | Gain | Cost | Ticket |
|---|---|---|---|---|---|
| 1 | 2.4 MB uncompressed, uncacheable, HTTP/1.1 bundle | nginx `gzip_types`/`gzip_proxied any`, `/assets/` `immutable` cache, `http2` (owner config); route-level `React.lazy` + `manualChunks` (code) | 2.4 → 0.67 MB now (measured), ~0.2 MB first route after splitting (estimated); repeat visits free | 1 h config; 1–2 d code | PAD-584, PAD-585 |
| 2 | Web has no query cache; pages refetch on every navigation | `QueryClient` defaults; big pages onto the existing `@levelup/hooks` queries; `AppLayout` mounted once | navigations inside the stale window become instant | 2–3 d | PAD-586 |
| 3 | iOS launch overlay + sequential cold start + no persisted cache | overlay ends at first-screen-ready; persist the query cache; `getMe` in parallel with fonts | first interactive frame ~3.3 s + network → ~1 s (estimated; measure on the simulator) | 1–2 d | PAD-587 |
| 4 | Deploy window: API stopped, migrations + boot reschedule before serving, 502 | reschedule off the request path; start-before-stop; readiness on `/healthz` | outage ~15 s + boot → ~0 | 1 d | PAD-588 |
| 5 | Staging deploy = prod `pg_dump` → staging `pg_restore` on the same host, per push | sync from the nightly GCS dump, at most hourly; or staging off the host | removes a dump+restore from prod's Postgres per push | 0.5 d; owner for the move | PAD-589 |
| 6 | Host memory: 975 MB, swap in use at idle, no container limits | resize (owner), `--memory` on every container, true `effective_cache_size` | no swap-in on wake-up | owner 5 min outage; 1 h code | PAD-590 |
| 7 | Backend request path: 4-statement floor, unbounded one-off lessons, student pipeline ×3, config lookup ×6, lazy roster | bound by date, eager-load, single pipeline, pass `config` down, `selectinload` the roster; index `messages.message_type`, `conversations.last_message_at`, `lessons.start_datetime` | student dashboard 221 → ~50 statements (estimated); checked by `perf_budgets.json` | 1–2 d | PAD-591 |
| 8 | iOS re-render hot spots (chat keystroke re-renders every bubble; week grid per drag frame; foreground refetch storm; duplicate SSE invalidation) | composer out of the list screen; memoised bubbles/grids; ignore `inactive → active`; one invalidation per event | smooth typing/drag (verify with the perf monitor) | 1–2 d | PAD-592 |
| 9 | Signed avatar URLs: one IAM `signBlob` call per avatar per response, URL differs per response so clients never cache | cache the signed URL per object for ~50 min, or `/image/<id>` with a cache header | N Google round trips per class open removed | 0.5 d | PAD-593 |
| 10 | No timing data anywhere | `$request_time $upstream_response_time` in the log format; `pg_stat_statements` preloaded; logs shipped off the host | the next study is a query | owner 1 h | PAD-594 |

Fine today, by measurement: Postgres I/O, CPU, the Portugal→Belgium RTT, the students list and
messaging endpoints (PAD-204/208/263), the invitation engine (2026-09-11 decision).

## What was decided here

- The study is the deliverable; **no fix ships from PAD-571**. Each cause is a ticket (PAD-594–PAD-593, filed
  2026-10-09, ids recorded in the Linear issue PAD-571 and in the local study).
- `backend/scripts/perf_baseline.py` + `perf_budgets.json` are the baseline. A ticket that claims a
  backend gain reruns the script on a quiet machine and shows the statement delta; the budgets file is
  the ratchet (`--check-budgets`, +10 %).
- The 2026-10-01 infrastructure study (local only, never tracked) measured the same host facts; its
  stage 0/1 items were never ticketed. PAD-594, PAD-588 and PAD-590 carry them, so this entry supersedes nothing but
  records that lineage.
- Owner decisions (config on the host): PAD-594, PAD-584, PAD-590. Everything else is code.
