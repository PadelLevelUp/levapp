# LevelUp / LevApp — Infrastructure Handoff

Prepared 2026-08-25 for an infrastructure discussion. Facts verified against the repos on this date; items marked **[verify]** are strong evidence but should be confirmed on the VM/console before acting.

---

## 1. System at a glance

Three independent git repos live side by side under the (non-git) umbrella dir `padel_app/levelup/`:

| Repo | What | Runtime | Deploys via |
|---|---|---|---|
| `levelup_backend/` | Flask REST API + background jobs + SSE | Docker on GCE VM, container `padelapp` | GitHub Actions on push to `main` |
| `levelup_frontend/` | npm-workspaces monorepo: web SPA (`apps/web`), Expo iOS app (`apps/mobile`), 5 shared packages | Web: Docker/nginx on same VM (`levelup_frontend`). Mobile: App Store binary + EAS OTA updates | Web: GitHub Actions on push to `main`. Mobile: **fully manual** |
| `levelup_issue_bot/` | Discord → Linear ticket bot (discord.js + Anthropic API) | Docker on same VM (`issue-bot`) | GitHub Actions on push to `main` |

**Everything server-side runs on a single GCE e2-micro VM** (`levelup-instance`, project `padel-levelup-2026`, zone `europe-west1-b`, static IP `34.78.247.45`, ~1 GB RAM, **10 GB disk that has filled up twice**). Postgres runs as a container on the same VM. There is no Cloud SQL, no load balancer, no CDN, no staging environment in the cloud.

```
                         padellevelup.com (TLS on host nginx :443 — config unversioned)
                                        │
       ┌────────────────────────────────┼───────────────────────────┐
       │                    GCE VM levelup-instance                 │
       │                    34.78.247.45 / 10.132.0.2               │
       │                                                            │
       │  host nginx :443 ──► levelup_frontend container (:3000→80) │
       │        │                  nginx serving SPA dist,          │
       │        │                  proxies /api/ → padelapp:80      │
       │        └──── /api ──► padelapp container (:5000→80)        │
       │                        gunicorn 1 worker × 64 threads      │
       │                        + APScheduler + in-proc SSE         │
       │                             │                              │
       │                             ▼ 10.132.0.2:5432              │
       │                     postgres:15 container                  │
       │                     DB padel_app, vol /data/postgres       │
       │                                                            │
       │  issue-bot container (Discord ⇄ Anthropic ⇄ Linear)        │
       └────────────────────────────────────────────────────────────┘

  iOS app (App Store) ──► https://padellevelup.com/api
  EAS Update (OTA JS) ──► u.expo.dev (channel production)
  Push: backend ──► exp.host (Expo relay) ──► APNs   +   pywebpush (VAPID) for web
```

The exact host-nginx routing is an **explicit unknown**: no repo contains the host nginx config or TLS setup (certbot? manual certs?). A 2026-07 observation had host nginx proxying `/api → localhost:5000` directly; the frontend container's own nginx *also* proxies `/api/ → padelapp:80` over the `levelup_net` docker network. Both paths exist; confirm which one production traffic actually takes — it matters for SSE buffering and timeouts. **[verify]**

---

## 2. Backend (`levelup_backend/`)

### Runtime
- Python 3.10 image (`python:3.10-slim`, two-stage Dockerfile), Flask 2.3 / SQLAlchemy **1.4 legacy line** / Flask-SQLAlchemy 2.5, Poetry-managed (PEP 621 `pyproject.toml`).
- **Image build installs from `pyproject.toml`, not `poetry.lock`** — CI validates the lockfile (`poetry check --lock`) but the image resolves transitive deps fresh every build. Non-reproducible builds.
- `scripts/entrypoint.sh` runs `flask db upgrade` on **every container boot**, then execs gunicorn: `--workers 1 --threads 64 --timeout 3600`, bind `:80`.

### Hard architectural constraints (the load-bearing facts)
1. **Must stay at 1 gunicorn worker.** APScheduler `BackgroundScheduler` runs in-process (`padel_app/scheduler.py`), and SSE fan-out is a module-level in-memory list of queues (`padel_app/realtime.py`). A second worker = duplicate scheduled jobs + broken SSE. This is the single biggest scaling ceiling.
2. **Every open SSE connection pins a thread** (hence 64 threads). Post-mortem 2026-06-10/11: `q.get()` without timeout leaked threads on silent disconnects and wedged prod; fixed with 15 s keep-alives. Practical ceiling ~60 concurrent SSE clients before SSE needs an async worker or separate process.
3. **Expo push sends run synchronously in the request path** (`send_expo_push_to_user`, ~10 s/batch) on that same thread pool — a latent repeat of the 2026-06 wedge now that iOS push works.
4. Server-side sessions are `filesystem` type in a `mkdtemp()` dir — wiped every deploy. (JWTs in headers are the real auth; 30-day expiry, rolling refresh via `X-New-Token` response header, SSE authenticates via `?token=` query string.)

### Scheduler jobs (Postgres-backed, table `apscheduler_jobs`)
- `process_batches` every 120 s (invitation batches), `extend_schedule_window` daily (self-heals lesson-reminder jobs over a rolling 60-day horizon), plus dynamic per-lesson `reminder_*` / `invite_start_*` DateTrigger jobs. Reminder times interpreted in `Europe/Lisbon`, stored UTC.
- Operational gotcha: merging multiple backend PRs that each add a migration → multiple Alembic heads → boot-time `flask db upgrade` crashes → API down. Check `flask db heads` before batch merges.

### Config & secrets
- No `DATABASE_URL`; URI assembled from `POSTGRES_HOST/PORT/USER/PW/DB`. `ProdConfig` (selected by `FLASK_ENV=production`) points at `10.132.0.2:5432` — the VM's own internal IP (config comments calling it "Cloud SQL" are wrong; there is no Cloud SQL). A third host in config, `34.77.91.59`, appears in no Terraform state — stale. A migration guard (PAD-95) blocks `flask db` against prod hosts unless `ALLOW_PRODUCTION_MIGRATIONS=1`.
- **Likely live defect [verify]:** CI injects `FLASK_SECRET_KEY`, but the app reads `SECRET_KEY` (fallback `"dev-secret-key"`); `JWT_SECRET_KEY` is read but appears in neither `deploy.yaml`'s env list nor `.env.prod` (fallback `"dev-jwt-secret"`). As deployed, **prod may be signing sessions and JWTs with hardcoded dev fallbacks** — check `docker exec padelapp env` on the VM. If true, fixing it invalidates all live logins.
- External services called: Expo push relay (`exp.host`, raw HTTP, batches of 100, free), Web Push via `pywebpush`/VAPID, Gmail SMTP 465 (Flask-Mail), OpenRouter (Excel/AI import flow, default model `inception/mercury-2`), GCS uploads (`GCS_UPLOADS_BUCKET`, ADC via VM service account). No Redis, no Sentry, no Discord from the backend.
- Health check: `GET /api/app/healthz` (DB `SELECT 1`, 503 on failure). CORS allows only `localhost:8080` and `http://34.78.247.45` — the production domain isn't listed, which only works because prod is same-origin through the proxy. **[verify]** if the domain setup ever changes.

### Terraform (`levelup_backend/terraform/`)
- Manages: the VM, static IP, firewall rules, GCS bucket `padel-levelup-2026-storage`, service account. **State is a local `terraform.tfstate` committed to the repo** (no remote backend) — concurrent applies or drift are invisible.
- **Firewall opens Postgres 5432 to `0.0.0.0/0`** (the restricted source range is commented out) and the GCS bucket grants `objectViewer` to `allUsers` (world-readable uploads). Both worth a decision in the infra discussion.
- The VM startup script (installs docker, runs postgres:15) only runs on instance creation — actual container lifecycle is owned by the deploy workflows, so Terraform and reality drift.

---

## 3. Web frontend (`levelup_frontend/apps/web`)

- React 18 + Vite 5 + Tailwind/shadcn, TanStack Query, axios. Base URL is a hardcoded relative `/api` — the environment difference is entirely *who proxies it*: Vite dev server (`:8080` → `127.0.0.1:${VITE_BACKEND_PORT ?? 5000}`) in dev, container nginx (`/api/ → padelapp:80`) in prod.
- Docker image: node:20-alpine build → nginx:1.27-alpine serving `apps/web/dist` on :80, published on host **:3000**. The container nginx has proper SSE plumbing (`proxy_buffering off`, 3600 s timeouts) and SPA fallback, **no TLS, no gzip, no cache headers**.
- Shared code: five source-consumed workspace packages — `@levelup/types`, `@levelup/api` (axios client + SSE + 20 resource modules; platform storage/navigation injected by each shell), `@levelup/hooks`, `@levelup/validation`, `@levelup/config`. Rule: `packages/*` must be platform-neutral (no DOM/RN/Expo imports); enforced culturally + by a node-env vitest config, not by lint.
- i18n: single locale tree at monorepo root `src/locales/{pt,en}` shared by web (glob import, fallback **pt**) and mobile (static imports, fallback **en**). New namespaces must be hand-wired in mobile's `i18n.ts`.
- Hand-rolled push-only service worker (`public/sw.js`) + web manifest; no offline/PWA precaching.
- Auth tokens: web keeps the JWT in `localStorage`; mobile in expo-secure-store.

---

## 4. iOS app (`levelup_frontend/apps/mobile`)

- Expo SDK 54 / React Native 0.81 / React 19 / expo-router / NativeWind. App **LevApp**, bundle `com.padellevelup.app`, Apple team `9K2J8D2ARR` (**Individual** account — the APNs key does not transfer if the app ever moves to an Org team). Currently: store version 1.0 live (approved 2026-08-04); `app.json` at version 1.1.0 / buildNumber 4.
- API base: `EXPO_PUBLIC_API_URL ?? (__DEV__ ? "http://localhost:5001/api" : "https://padellevelup.com/api")`. Prod URL is deliberately hardcoded (a localhost fallback caused the first App Store rejection). Note the dev default is the **E2E backend port 5001**, not the normal dev server on 5000.
- **Releases are fully manual, no CI**: Xcode archive from main → Organizer → upload → ASC → submit. `apps/mobile/ios/` is **gitignored and regenerated by `npx expo prebuild --clean`**, which is the only way `app.json` config reaches the native project — and which silently overwrites version/build numbers set in Xcode. Before archiving, verify `EXUpdatesEnabled=true` in the regenerated `Expo.plist`. An ASC API key (`79ZZ536G63`, Admin) exists in `~/.appstoreconnect/private_keys/` — upload, metadata, and screenshots are all scriptable; only legal agreements and the Submit button need a human.
- **EAS Update (OTA)** for JS-only fixes: channel `production`, `runtimeVersion.policy: appVersion` (so bump the app version whenever native changes, or OTA can pair mismatched JS with old native). EAS **Build** is not used — archives are raw Xcode. Free tier: 1,000 MAU.
- **Push chain**: app registers `ExponentPushToken` → `POST /api/notifications/device` → backend `device_tokens` table → backend posts to `exp.host` → APNs. Broken until 2026-08-06 (missing EAS projectId — now `dc8bbf5f-…` in `app.json`); confirmed working end-to-end since. Checked-in entitlements say `aps-environment: development` only — Xcode automatic signing reconciles this to `production` at archive time, but it's a recurring source of false alarm.
- Mobile E2E: Maestro workspace (`.maestro/`, 19 flows, pinned order) driven by `scripts/e2e.sh` against the :5001 test backend; sim app must be code-signed or Keychain/login silently fails.

---

## 5. Issue bot (`levelup_issue_bot/`)

- Node 22 / TypeScript / discord.js gateway bot: `#issues` channel → Claude (`ANTHROPIC_MODEL ?? "claude-sonnet-5"`) → Linear tickets, with duplicate detection, image handling, and a resolution-confirmation poll loop. Ticket-prompt opener strings ("Implement the following ticket." etc.) are a **contract** with the local Claude Code skills — changing them breaks the ticket workflow.
- Deploy: push to main → Docker Hub `issue-bot:latest` → SSH → `docker run --restart unless-stopped` on `levelup_net`, state at `/opt/issue-bot/data` (host volume). Notably it's the **only container with a restart policy**.
- Failure history: retired hardcoded model ID (silent 404s) and exhausted Anthropic credit — both present as "Sorry, something went wrong"; `docker logs issue-bot` always has the real error.

---

## 6. CI/CD summary

All three repos follow the same shape: push to `main` → build `linux/amd64` image → push to **Docker Hub as `:latest` only** → `appleboy/ssh-action` into the VM → `docker rm -f` + `docker run`. Consequences:

- **No CI tests, lint, or typecheck anywhere** — the only gate is `poetry check --lock` (backend). The full test story (vitest, Playwright E2E, pytest, Maestro) runs locally only.
- **No rollback artifact** — `:latest` is mutable and old images are pruned on the VM (prune was added after disk-full outages). Rolling back means reverting the commit and redeploying.
- **`padelapp` and `levelup_frontend` containers have no restart policy** — a VM reboot leaves the product down until a redeploy or manual `docker start`. **[verify current state]**
- The two app repos deploy independently → a several-minute skew window on every release. Deploy order must be chosen per release by asking which side's new version tolerates the other's *old* version (backend-first is a default, not a rule — it has broken prod once).
- Backend deploy also scps `.env.prod` and installs a 03:00 cron running `scripts/backup.sh` — but **the committed script has `BUCKET=""`**, so the nightly pg_dump likely uploads nowhere and just writes/deletes a gzip in `/tmp`. **[verify on VM — if true, there are effectively no DB backups beyond the docker volume on a 10 GB disk.]**
- Emergency access: `levelup_backend/.github/workflows/repair.yaml` (workflow_dispatch) runs diagnostics on the VM via the deploy key — the escape hatch when SSH is broken (which has happened: dead guest agent; and `gcloud compute ssh` hangs when the disk is 100% full).

Accounts involved: GitHub org **PadelLevelUp** (use the `pedropacheco95` account), GCP console **padellevelup2026@gmail.com**, Docker Hub (via CI secrets), Expo owner **levapps-team**, Apple Individual team `9K2J8D2ARR`, Linear, Anthropic API org (shared by bot prod + local).

---

## 7. Environments & ports matrix

| Environment | Backend | Postgres | Frontend | Notes |
|---|---|---|---|---|
| Dev | Flask `:5000` | `padel_app` @ localhost:**5433** | Vite `:8080` → proxy :5000 | 5432's `levelup` DB is a stale lookalike; port 5000 conflicts with macOS AirPlay |
| E2E (Playwright) | Flask `:5001`, `TEST_MODE=true` | `levelup_test` @ localhost:5432 | Vite `:8080` → proxy :5001 | Playwright boots both servers; DB dropped/reseeded per run; run from `apps/web` on Node 24 |
| QA (weekly) | `:5003` | `levelup_qa` @ :5002 | — | :5002 is a foreign Docker postgres |
| Prod | container `:80` → host `:5000` | `padel_app` container @ 10.132.0.2:5432, vol `/data/postgres` | container `:80` → host `:3000`, behind host nginx :443 | Secrets in GitHub Actions + `~/.env.prod` on VM |

Local secrets: `levelup/.claude/secrets.env` (`POSTGRES_PW`, `DISCORD_WEBHOOK_URL`). Node versions drift by context (docs say 24 via nvm, Docker builds on 20, no `.nvmrc`/`engines` anywhere).

---

## 8. Risk register (the agenda for the infra conversation)

**Single points of failure / capacity**
1. One e2-micro VM (~1 GB RAM, 10 GB disk) runs API, web, DB, and bot. Disk has hit 100% twice (docker layer accumulation) — prune now in deploys, but the durable fix (bigger disk, or log rotation + scheduled prune) is still open.
2. 1-gunicorn-worker ceiling (APScheduler + in-memory SSE). Any horizontal scaling requires: scheduler → separate process or DB-locked leader; SSE → Redis pub/sub or dedicated async service. ~60 concurrent SSE clients is the wall.
3. Postgres is a container with a host bind mount and — pending [verify] — **no working offsite backup**.
4. App containers likely lack restart policies → VM reboot = outage.

**Security items to decide on**
5. Firewall: Postgres 5432 open to the internet (Terraform, restricted range commented out).
6. GCS uploads bucket world-readable by design — confirm that's intended for player photos etc.
7. Possible dev-fallback `SECRET_KEY`/`JWT_SECRET_KEY` in prod (env-var name mismatch) — check and rotate carefully.
8. Terraform state committed to the repo; JWTs valid 30 days in `localStorage` (web).

**Delivery / reproducibility**
9. No tests in CI; mutable `:latest` images; lockfile not used in backend image builds; Node version unpinned.
10. Host nginx + TLS entirely unversioned/undocumented — the most load-bearing unmanaged config in the system.
11. iOS release is manual and prebuild-driven with several silent-overwrite traps (versions, `Expo.plist`); OTA runtimeVersion policy relies on disciplined version bumps.
12. Alembic multiple-heads risk on batch merges (boot-time migration = deploy-time outage).

**Cost profile (roughly zero-marginal today)**: one e2-micro + static IP + NEARLINE bucket, Docker Hub free, Expo push/OTA free tier, Apple $99/yr, OpenRouter + Anthropic usage-billed. Prod data is tiny (3 coaches, 1 season, ~38 lessons) — the risks above are about fragility, not load.
