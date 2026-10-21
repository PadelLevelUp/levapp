---
id: decision.2026-10-21-gke-readiness
title: Ready to move to GKE Autopilot in one day — Postgres in the cluster, LISTEN/NOTIFY broker, code split now, no ArgoCD, no FastAPI (PAD-694)
date: 2026-10-21T20:00:00Z
compass_rules: [R-027, R-036]
supersedes:
  - decision.2026-09-09-single-worker-until-sse-broker
  - decision.2026-10-10-hosting-architecture
sources:
  - ./2026-10-10-hosting-architecture.md
  - ./2026-09-09-single-worker-until-sse-broker.md
  - ./2026-10-10-deploy-overlap-and-scheduler-leader.md
  - ./2026-10-09-app-speed-study.md
  - ../../../backend/padel_app/realtime.py
  - ../../../backend/scripts/rollout.sh
  - ../../../backend/Dockerfile
---

# Ready to move to GKE Autopilot in one day (PAD-694)

Status: DECIDED by the owner in the "architecture" session, 2026-10-19 → 2026-10-21. Recorded
2026-10-21 by la-2110-SessionF (wave 16). Parent ticket PAD-686; the phased plan and its
tickets (PAD-687 … PAD-709) live there. Nothing in this record changed a server.

**Supersedes in part** (the rest of each stands):
- [2026-10-10 hosting architecture](2026-10-10-hosting-architecture.md): the host size (it was an
  e2-micro; resized, see §2) and the "Cloud Run only after the code split" platform line (the
  target is now GKE Autopilot). Its owner decisions 2 (no Cloud SQL) and 3 (`api.levapp.app`)
  stand; decision 1 (no separate staging VM) stands while we are on the VM.
- [2026-09-09 single worker until SSE broker](2026-09-09-single-worker-until-sse-broker.md): the
  broker is **Postgres LISTEN/NOTIFY**, not Redis pub/sub. The single-worker rule itself (R-027)
  stands until its exit condition below is met.

## What would change each answer

| Decision | Would change if |
|---|---|
| GKE Autopilot, not Cloud Run | The owner stops wanting to run and understand the plumbing, or Cloud Run's 60-min request cap stops mattering (SSE moved off long-lived requests); prices are within 4 % either way |
| Stay on the VM, ready in one day | The VM stops fitting (memory pressure back after the resize, a second host needed for any reason) — then the rehearsed runbook is executed instead of kept warm |
| Postgres in the cluster | Autopilot node maintenance restarts of the single Postgres pod become user-visible often enough to matter; then a second replica or Cloud SQL (both reversible later) |
| LISTEN/NOTIFY broker | Event payloads must exceed 8 KB, or fan-out volume outgrows one dedicated LISTEN connection per stream-holding process |
| Code split now | Nothing: it is needed for more than one API copy on any platform and is the longest item |
| No ArgoCD now | A third environment, or drift between the manifests and the clusters that `kubectl apply -k` from Actions does not catch |
| No FastAPI | A measured slowness traced to the sync request model (none so far: requests are ms-scale on a ~22 MB DB) |

## The decisions (plan §0, reproduced verbatim)

| Decision | Choice | Why |
|---|---|---|
| Host size | **e2-small, done 2026-10-19** (was e2-micro) | 975 MB with 409 MB on swap and memory pressure at idle; after: 2 GB, swap 0, pressure 0, health TTFB 0.5–2.5 s → 0.13–0.23 s |
| Target platform | **GKE Autopilot** (not Cloud Run) | Owner wants to understand and control the plumbing; price within 4 % either way |
| Timing | **Stay on the VM; be ready to cut over in one day** | Nothing forces the move today; readiness is rehearsed on staging |
| Database on GKE | **Postgres in the cluster** (StatefulSet on a persistent disk) | No Cloud SQL (10-10 stands); snapshots + nightly dump cover backup |
| Stream broker | **Postgres LISTEN/NOTIFY** | Postgres is already there; Redis would be a second service to run. Supersedes 09-09 |
| Code split (phase 4a) | **Go ahead now**, on the VM | Needed for >1 API copy on any platform; also removes the SSE thread cap |
| GitOps (ArgoCD) | **Not now** | ~1 vCPU / 1 GB always-on on Autopilot ($30–50/month) plus one more system to upgrade; `kubectl apply -k` from Actions is enough for two environments; manifests are in the repo either way, so ArgoCD can be added later with no rework |
| Flask → FastAPI | **No** | Not a cause of any measured slowness; 157 routes, 7 extensions, 24 test files on the Flask client; the only async-worthy piece is the events service (B5), which may use gevent or an ASGI micro-service |
| API async | **No for the API; yes for streams** | Request handling is ms-scale on a 22 MB DB; streams hold threads, so they move to their own process |

**Moving and scaling are separate.** A first GKE deployment with one API replica and
`strategy: Recreate` behaves exactly like today's container, in-process state included, so
readiness to *move* does not wait on the code split. The split is what allows two copies
(rolling updates, autoscaling) and removes the stream cap; it is the same work on any platform.

**Budget:** one VM is what is paid for today; GKE is readiness, not a second running
environment, until the owner triggers the move (staging on Autopilot, PAD-705, is the first
recurring cost, ~$20–30/month for the pods).

## Measured facts behind it (dated)

- **2026-10-15, prod probes:** gzip on, `immutable` cache on assets, code-split bundle (main chunk
  399 KB raw / 145 KB gzipped, was 2.4 MB uncompressed). HTTP/2 **not** applied. `api.levapp.app`
  had **no DNS record** although PAD-614 was in prod.
- **2026-10-19, host resize** e2-micro → e2-small (a disk snapshot first): stopped 14:52 UTC, prod
  back 14:57 UTC. After boot 1,982 MB total, swap 0, memory PSI 0, 1.2 GB available. Seven of
  eight containers restarted alone; the issue bot did not (restart policy `unless-stopped`) and
  was started by hand on 2026-10-20. Terraform state still said e2-micro (PAD-688).
- **2026-10-19, host nginx:** no `levapp-api-upstream.conf` in `conf.d/`, so `rollout.sh` fell back
  to stop-then-start on every deploy (a 502 window each time). Applied by the owner on
  2026-10-21 (PAD-688), with HTTP/2 and the `rt=`/`urt=` log timings.
- **2026-10-21, access log, 7 days (read-only):** no request timings existed (PAD-594's format was
  never applied); `pg_stat_statements` not installed. 5xx only around the 10-15 deploy and the
  10-19 resize. 499s led by `dashboard` (24) and `calendar` (14). `coach_players` (unpaginated)
  averages 133 KB × 506 calls; `unread_count` 4,204 calls (polling).
- **2026-10-21, App Store Connect:** live iOS 1.2.0 = build 27 (2026-09-30); 1.3.0 = build 32
  (2026-10-10) approved, not released. PAD-587 and PAD-592 merged after build 32, so **no uploaded
  build had the iOS speed fixes**; the 7-day log shows every iOS request as build 27. PAD-690
  ships build 33 as 1.3.1.

## What this changes in the knowledge layer

- **R-027** gains its exit condition: the single-worker rule ends when SSE fan-out goes through
  LISTEN/NOTIFY (PAD-692) **and** two API copies have been proven on the VM (PAD-704); its
  "Redis pub/sub or equivalent" now names LISTEN/NOTIFY.
- [2026-10-10 deploy overlap](2026-10-10-deploy-overlap-and-scheduler-leader.md) stays; PAD-691
  (migrations out of the entrypoint) will update it when it lands.
- Phase order (PAD-686): B code split (691 → 695 → 699; 692 → 697; 693; 696; 704 proof) and C
  GKE readiness (698 manifests → 700 Postgres StatefulSet, 701, 702, 703 → 705 staging on
  Autopilot → 706 DNS/TLS → 707 cutover runbook rehearsed twice), then D (708 cutover, 709 retire
  the VM) on the owner's trigger.
