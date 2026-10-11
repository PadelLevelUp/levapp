---
id: decision.2026-10-10-hosting-architecture
title: Hosting architecture — production and staging off the single 1 GB VM, options and a phased plan (PAD-613)
date: 2026-10-10T12:00:00Z
compass_rules: [R-027, R-036]
supersedes: []
sources:
  - ./2026-10-09-app-speed-study.md
  - ../../../backend/padel_app/realtime.py
  - ../../../backend/padel_app/config.py
  - ../../../backend/Dockerfile
  - ../../../frontend/apps/web/src/api/client.ts
---

# Hosting architecture — production and staging off the single 1 GB VM (PAD-613)

Status: DECIDED 2026-10-10 (see Owner decision) · drafted 2026-10-10 · Session E (wave 14) for the owner. Decision document only: nothing
was changed on any server. Production facts are the read-only measurements of 2026-10-09
(PAD-571, `2026-10-09-app-speed-study.md` in this folder). Prices were re-verified on
2026-10-10 against official pages where they show europe-west1; where they do not, the source is
named. The earlier, broader study of 2026-10-01 (local in `docs/plans/`, untracked per R-036) is the starting point; this document narrows it to the owner's question and re-checks its
prices.

## Owner decision (2026-10-10)

1. **No separate staging VM.** Production and staging stay on the one VM (A1 dropped).
2. **No Cloud SQL and no point-in-time recovery.** Postgres stays in its container, and the
   nightly dump remains the backup (B1 dropped).
3. **Yes to `api.levapp.app`.** Filed as PAD-614. The Cloudflare-for-web phase is PAD-615,
   blocked by PAD-614. It still makes sense with one VM, because memory is the binding
   constraint and it takes the web and admin containers off the only machine.

With one shared VM, PAD-589 (staging synced from the nightly dump, rate-limited) and PAD-590
(container memory limits) carry more weight. Phase 4 stays trigger-only. The analysis below is
kept as written, since it records why each option was weighed.

## 0. What decides the answer

1. **The API is one process by design today, and five things live only inside it**: the SSE
   subscriber registry (`backend/padel_app/realtime.py`, per-process dict of queues), the
   APScheduler jobs (`scheduler.py`), the push queue (`utils/push_sender.py`), the auth rate
   limiter (`utils/rate_limit.py`, in-memory), and the filesystem session (`config.py`,
   `SESSION_TYPE = "filesystem"`). Gunicorn runs `--workers 1 --threads 64` for that reason
   (R-027). **Any option that runs two copies of the API — Cloud Run included — needs these five
   moved out first.** That code split is weeks, not hours; every other option below works with
   the API as it is.
2. **Memory, not CPU, is what hurts.** The VM idles at 97 % CPU free with 372 MB of swap in use
   and memory pressure ~2 % (PAD-571). Removing tenants from the VM (staging, Postgres, the web
   containers) helps more than any change to the API's hosting.
3. **The web app talks to the API on the same origin (`/api`, `apps/web/src/api/client.ts`).**
   Serving the web statically from a CDN therefore means either an API subdomain plus CORS, or an
   edge proxy for `/api` and the SSE stream. That is the real cost of the CDN option, not hosting.
4. **The cheapest big win is already in flight and costs nothing**: PAD-584 (compression, cache,
   HTTP/2), PAD-583/586 (fewer statements, a client cache), PAD-588 (no 502 window on deploys),
   PAD-589 (staging stops dumping prod into the shared Postgres). Architecture comes after them.

## 1. Today (measured 2026-10-09)

| Piece | Today |
|---|---|
| Host | One e2-micro (2 shared vCPU, 975 MB RAM, 1 GB swap, 10 GB disk at 72 %), europe-west1 |
| On it | prod API (~175 MB, 1 worker × 64 threads), prod web nginx, prod admin, staging API (400 MB cap) + web + admin, Postgres 15 container (both databases, 22 MB each), issue-bot, host nginx + Certbot |
| Staging data | every push to `staging` stops staging and pipes `pg_dump` of prod into `pg_restore` of staging inside the one Postgres (~30× on a busy day) |
| Backups | nightly `pg_dump` to a GCS bucket (RPO up to 24 h); no point-in-time recovery |
| Deploys | stop → migrate → boot reschedule → serve: a 502 window per deploy (PAD-588) |
| Cost | ≈ **$11/month** (e2-micro $6.73 + 10 GB disk $1.00 + static IP $3.65 + backup bucket cents) |

## 2. Options, one by one

Prices: USD per month, europe-west1, 730 h. Compute Engine from gcloud-compute.com (a mirror of
the billing catalogue, dated 2026-10-04; the official page renders no static prices); disks,
static IP, Cloud Run, Cloud Scheduler, egress from cloud.google.com pricing pages; Cloud SQL from
cloud.google.com/sql/pricing (the page shows us-central1 only; a secondary source lists
db-g1-small at the same rate in Belgium); Cloudflare from developers.cloudflare.com.

### A. Staging off the production VM

| Variant | Cost / month | Effort | Risk | What users feel |
|---|---|---|---|---|
| **A1. Its own e2-micro, its own Postgres container, restored from the nightly prod dump in GCS** | **+≈ $11** (VM 6.73 + disk 1.00 + static IP 3.65) | 1–2 days: Terraform (or console) VM, DNS for `staging` and `admin.staging`, Certbot, deploy-staging.yaml host + secrets, sync script reads the GCS dump instead of live prod | Low; staging only | Prod stops sharing RAM, CPU, disk and Postgres with every staging push: the "sometimes slow in the evening" cause disappears |
| A2. Staging stopped when idle (same VM as A1, started on demand) | ≈ $1 disk + reserved static IP while stopped (≈ $7) | A1 + a start/stop step in the workflow | Slower first deploy of the day | Same as A1 when running |
| A3. Staging on Cloud Run | needs the code split (§0.1) | weeks | — | — |

### B. Postgres: managed (Cloud SQL) vs container

| Variant | Cost / month | Effort | Risk | What it buys |
|---|---|---|---|---|
| Keep the container (today) | $0 | — | Data on the VM's boot disk; one nightly dump | — |
| **B1. Cloud SQL db-g1-small (1.7 GB, shared core) + 10 GB SSD + backups** | **≈ $28** (instance $25.55 + storage ≈ $1.70 + backups < $1) | 2–4 days: instance, Auth Proxy or connector on the VM, cutover with a 10–20 min write freeze (22 MB database), backup and restore-check scripts rewritten | Medium at cutover; shared-core has **no SLA**, maintenance drops connections briefly | Point-in-time recovery, automated backups off the VM, ~80 MB + page cache freed on the VM; same region, ~1 ms latency |
| B2. Cloud SQL db-f1-micro (0.6 GB) | ≈ $10 | same | 0.6 GB is tight for 2 databases | as B1, less headroom |
| B3. Dedicated core (1 vCPU / 3.75 GB) | ≈ $50 + storage | same | SLA-covered | for when an SLA is promised to clubs |

### C. API on Cloud Run vs the VM

| | Cost / month | Effort | Risk |
|---|---|---|---|
| Cloud Run, min 1 instance (1 vCPU / 512 MiB) so SSE and the scheduler have a home | ≈ $10 idle-billed (request-based) to ≈ $50 (instance-based), before free tier, plus a load balancer or domain mapping | **The code split first** (§0.1: worker process, Postgres LISTEN/NOTIFY for SSE fan-out, rate limiter in Postgres, push outbox, DB sessions, migrations out of the entrypoint) — 3–5 weeks — then 1–2 weeks of platform work | SSE streams are capped at 60 min per request (clients already reconnect with back-off; a refetch on reconnect is needed); cold starts if scaled to zero |
| VM (today) | — | — | single point of failure |

Scale-to-zero does not fit while the scheduler and the SSE registry live in the API. Cloud Run is a
target for when **availability** (not speed) becomes the requirement.

### D. Static web on a CDN instead of the VM's nginx

| Variant | Cost / month | Effort | Risk |
|---|---|---|---|
| **D1. Cloudflare Pages for the web (and the admin console)** | **$0** (free plan: static requests unlimited, 500 builds/month) | 2–3 days: build on Pages from the repo; `_headers` for the AASA content type and `Referrer-Policy` on `/register/*`; **API moves to `api.levapp.app`** with CORS for the web origin, or a Pages Function proxies `/api` (Workers free quota 100 k requests/day; the SSE stream through a Function is not advisable) | Medium: the API origin change touches the web client, CORS and the SSE URL. Auth survives the move: the web and the admin console both send a Bearer token (`apps/admin/src/lib/api.ts`), and the Flask cookie session serves only the legacy server-rendered pages; the iOS app is unaffected (it already uses an absolute URL) |
| D2. Cloudflare proxy ("orange cloud") in front of the VM, caching `/assets/` | $0 | ½ day; no code change | Cloudflare's proxy read timeout is 125 s (no per-plan value documented); the SSE stream sends a keep-alive comment every 5 s (`DEFAULT_SSE_KEEPALIVE_SECONDS`, `config.py`), which should keep it open — **test on staging first**; the real-IP config already exists (`levapp-cloudflare-real-ip.conf`) |
| D3. GCS + Cloud CDN | ≈ $18 load balancer + egress | 2 days | — |

With PAD-584 the VM already serves the bundle compressed and immutable-cached, so D's speed gain
is mainly for users far from Belgium and for the first load; its bigger value is taking three
nginx containers (prod web, staging web, admin) off the VM.

### E. Scheduler and notification engine out of the API process

| | Cost | Effort | What it unlocks |
|---|---|---|---|
| A second container on the same VM running only the scheduler (and the push sender) | $0 | 1–2 weeks: the scheduler publishes SSE events today, so fan-out across processes needs Postgres `LISTEN/NOTIFY`; an advisory lock so two schedulers never run; boot reschedule leaves the API's boot path (shared with PAD-588) | API restarts no longer re-arm every reminder job; the API can later run as more than one copy (C) |
| Cloud Scheduler + Cloud Run jobs | ≈ $0–1 | the same code work + a job per periodic task | same, without a long-lived worker |

## 3. Costs side by side (per month)

| Architecture | Monthly | vs today |
|---|---|---|
| Today | ≈ $11 | — |
| A1 (staging VM) | ≈ $22 | +$11 |
| A1 + D1 (web on Pages) | ≈ $22 | +$11 |
| A1 + D1 + B1 (Cloud SQL g1-small) | ≈ $50 | +$39 |
| A1 + D1 + B1 + E + C (Cloud Run, min 1; prod VM retired, staging VM kept) | ≈ $50–90 + domain mapping | +$39–80 |

## 4. Recommendation

**Target for the next three months: A1 → D2 (test) / D1 → B1, keeping the API on the VM.**

- **A1 first** (+$11/month): it removes the single largest source of "sometimes", the staging
  stack and its dump/restore competing with prod for 975 MB, and it is fully reversible (point the
  DNS back). It also lets PAD-589 become "restore the nightly dump on the staging VM".
- **D2 on staging, then D1**: orange-cloud staging to prove SSE through Cloudflare (½ day, $0);
  if it holds, move the web and admin to Cloudflare Pages behind an `api.` subdomain ($0). Prod VM
  sheds three containers.
- **B1 when the owner wants point-in-time recovery** (+$28/month): the database leaves the VM's
  boot disk, backups become automatic, RPO drops from 24 h to minutes. The VM then runs the API,
  the issue-bot and nginx only — comfortably inside 1 GB.
- **E and C only on a trigger**: a promise of uptime to clubs, a deploy outage a customer notices
  after PAD-588, or growth past one VM. E comes first (it is the prerequisite for C) and costs no
  money, only the code split.

I would choose differently if: the owner wants one migration rather than three (then A1 + B1
together, D later), data must leave Google (then D1 + a managed Postgres elsewhere), or uptime is
promised within months (then start E now).

## 5. Phased plan (every step reversible, no perceptible downtime)

| Phase | Do | Reversible by | Downtime |
|---|---|---|---|
| 0 (in flight) | PAD-584, 583, 586, 590, 594, 588, 589 | each ticket's rollback | none / seconds (one Postgres restart, PAD-590/594) |
| 1 | A1: staging VM, its Postgres restored nightly from GCS, DNS + Certbot for `staging`/`admin.staging`, deploy-staging.yaml re-pointed | DNS back to the prod VM; the old staging containers kept stopped for two weeks | staging only |
| 2 | D2 on staging (Cloudflare proxy), verify SSE ≥ 1 h and the AASA file; then D1: Pages for staging web + admin, `api.staging` + CORS; then prod | turn the proxy off / point DNS back at the VM; the web containers kept for two weeks | none (DNS) |
| 3 | B1: Cloud SQL, Auth Proxy on the VM, cutover in a 10–20 min write freeze at a quiet hour, nightly logical dump kept as a second copy | `POSTGRES_HOST` back to the untouched container (writes made after cutover dumped back) | 10–20 min writes frozen, reads served |
| 4 (trigger) | E: worker process + LISTEN/NOTIFY + lock + outbox + DB rate limiter/sessions + migrations as a step; then C if needed | feature flag: the API keeps its in-process scheduler until the worker is proven | none |

The 2026-09-09 decision (one gunicorn worker until SSE has a shared broker) names Redis pub/sub
as that broker. Postgres `LISTEN/NOTIFY` is proposed here because it adds no new service to run or
pay for; the choice between the two is made when phase 4 is ticketed, and that decision stands
until then.

## 6. What happens to …

- **Deploys (PAD-588):** unchanged by A1/D/B; the 502 window is fixed in PAD-588 itself. Under C,
  revisions roll without a window.
- **Backups:** today's nightly dump stays through phase 3 as the off-instance copy; B1 adds
  Cloud SQL backups + PITR.
- **Staging sync (PAD-589):** A1 turns it into "restore last night's prod dump on the staging
  VM" — prod's Postgres is never read by staging again.
- **Observability (PAD-594):** nginx timings and pg_stat_statements work the same on the VM; on
  Cloud SQL, Query Insights replaces pg_stat_statements; under C, request logs come from Cloud
  Logging.
- **Certificates:** A1 needs Certbot on the new VM for `staging` and `admin.staging`; D1 moves
  web certificates to Cloudflare; the `api.` hosts keep Certbot on the VM.
- **AASA and domains (PAD-595):** the AASA file must keep `application/json` with no redirect;
  on Pages that is a `_headers` rule, verified with the existing curl check before any DNS change.
  Invite links already move to `levapp.app` in PAD-595; an `api.` subdomain does not affect them.

## 7. Tickets per phase (not filed; filed only after the owner decides)

| Phase | Ticket |
|---|---|
| 1 | Staging VM: create the e2-micro, disk, static IP (Terraform) |
| 1 | Staging DNS and certificates for `staging` and `admin.staging` on the new VM |
| 1 | deploy-staging.yaml targets the staging VM (host, secrets, health check) |
| 1 | PAD-589 re-shaped: staging restores last night's prod dump from GCS on its own VM |
| 1 | Retire the staging containers and the staging database from the prod VM |
| 2 | Cloudflare proxy trial on staging: SSE held ≥ 1 h, AASA served as JSON, real client IP in logs |
| 2 | API on an `api.` subdomain with CORS for the web and admin origins (staging, then prod) |
| 2 | Web and admin console on Cloudflare Pages, `_headers` for AASA and Referrer-Policy |
| 2 | Retire the web and admin nginx containers from the VM |
| 3 | Cloud SQL instance, Auth Proxy on the VM, backup and restore-check scripts rewritten |
| 3 | Cloud SQL cutover runbook with write freeze and rollback, rehearsed on staging |
| 4 | Scheduler and push sender in a worker process, advisory lock, feature flag |
| 4 | SSE fan-out through Postgres LISTEN/NOTIFY |
| 4 | Rate limiter and sessions out of process memory; migrations as a deploy step |
| 4 | API on Cloud Run (only if the trigger fires) |

## 8. Open questions for the owner

1. A1 now (+$11/month)? Default: yes.
2. Point-in-time recovery worth +$28/month (B1) this quarter? Default: after phase 2.
3. An `api.levapp.app` subdomain acceptable (needed for D1)? Default: yes, staging first.

## Sources (read 2026-10-10)

Compute Engine: gcloud-compute.com/e2-micro.html, e2-small.html, e2-medium.html (catalogue mirror,
2026-10-04). Disks: cloud.google.com/compute/disks-image-pricing. Static IP and egress:
cloud.google.com/vpc/network-pricing. Free tier (US regions only):
docs.cloud.google.com/free/docs/free-cloud-features. Cloud SQL: cloud.google.com/sql/pricing
(us-central1 shown; shared-core not under SLA). Cloud Run: cloud.google.com/run/pricing
(europe-west1 is Tier 1), docs.cloud.google.com/run/docs/configuring/request-timeout (60 min).
Cloud Scheduler: cloud.google.com/scheduler/pricing. Cloudflare Pages:
developers.cloudflare.com/pages/platform/limits/; proxy timeouts:
developers.cloudflare.com/fundamentals/reference/connection-limits/. Earlier study:
`docs/plans/2026-10-01-infrastructure-architecture-study.md` (its 1.10 Belgium uplift for Cloud
SQL is not confirmed; its 100 s Cloudflare timeout is 125 s in the current docs).
