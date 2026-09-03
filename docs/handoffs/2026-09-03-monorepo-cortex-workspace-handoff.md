# Handoff — monorepo cutover, Cortex adoption, Google Workspace (2026-09-02 → 03)

Written by the Claude Code session that executed the migration plan (`plans/2026-09-02-levapp-monorepo-cortex-migration.md`). **Session (resume here for context): https://claude.ai/code/session_0198iAmzyjfYiqu3DJSzaLLC** — id `session_0198iAmzyjfYiqu3DJSzaLLC`. Everything below was verified as of 2026-09-03 ~18:00 UTC. Items marked **[owner]** are waiting on Pedro; items marked **[72h]** are gated by Google and belong to the follow-up ticket.

## 1. What changed, in one screen

| Area | Before | After |
|---|---|---|
| Repos | `levelup_backend`, `levelup_frontend`, `levelup_issue_bot` (3 repos; specs unversioned) | **`PadelLevelUp/levapp`** monorepo (`backend/`, `frontend/`, `.specflow/`, `.cortex/`), public, 780 commits with history; issue bot stays separate; old repos archived read-only |
| Release flow | push to `main` → deploy | **feature → PR → `staging` → PR → `main`**; rulesets block direct pushes; `guard-main-source` only admits PRs whose head is `staging` |
| Environments | prod only | prod `levapp.app` (+ `padellevelup.com`), **staging `staging.levapp.app`** on the same VM (own containers, own DB `padel_app_staging`, memory-capped, no push/AI/GCS/mail credentials) |
| Deploys | one workflow per repo, racing | `deploy-prod.yaml` / `deploy-staging.yaml`: `changes → backend → frontend`, ordered; `target` input for frontend-first releases |
| Specs | `specs/<domain>/spec.md` (15 files, 85 leaves), no business layer | `.specflow/specs/<domain>/<leaf>.spec.md` + **33 persona-journey business outcomes**, bidirectionally linked; `cortex validate .` 0/0 |
| Knowledge | memory files + CLAUDE.md | Cortex 3.3: compass (R-001…R-024, B-001…B-014), atlas decisions, insight (679 file entries, 26 concepts), 10 scheduled `levapp-*` routines registered |
| Secrets | prod signed JWTs with a committed dev fallback (B-003) | `config.py` refuses production without real `SECRET_KEY`/`JWT_SECRET_KEY`; fresh secrets for prod and staging; all live sessions rotated once |
| Identity | `padellevelup2026@gmail.com` (Google), `padelapp2025@gmail.com` (GitHub billing, app mail), Docker `padelapp` | **`admin@levapp.app`** = the upgraded padellevelup2026 account (Google Workspace Business Starter, 1 seat); aliases `noreply@`, `hello@`; GCP owner already `admin@levapp.app` |

## 2. Infrastructure facts that live nowhere else

- **Host nginx on the VM** (`levelup-instance`, `34.78.247.45`, `europe-west1-b`): `/etc/nginx/sites-available/{padellevelup,levapp,levapp-staging}`. Each: `/api/app/events` (SSE) and `/api/` → backend port, `/` → frontend port. Prod = `:5000`/`:3000`, staging = `:5100`/`:3100`. Certbot per vhost; `certbot.timer` renews. **Prod hits the backend container directly** — the frontend image's own `/api/` proxy is dead code in prod.
- **Containers**: `padelapp`, `levelup_frontend`, `padelapp_staging`, `levelup_frontend_staging`, `postgres`, `issue-bot`; all `--restart unless-stopped` (prod ones had none before 2026-09-02). Image names unchanged (`padelapp/levelup_backend`, `padelapp/levelup_frontend`, tags `latest`/`staging`).
- **VM resources**: 975 MB RAM, 1 GB swapfile added 2026-09-02, disk ~74% (9.7 GB). Watch disk when staging images pull.
- **DNS (Cloudflare, DNS-only/grey cloud)**: `levapp.app`, `www`, `staging` → `34.78.247.45`; MX `smtp.google.com`; SPF `v=spf1 include:_spf.google.com ~all`; DMARC `p=none; rua=mailto:admin@levapp.app`; Google site-verification TXT. **No DKIM yet** [72h].
- **Firewall**: `levelup-allow-postgres` still opens 5432 to `0.0.0.0/0`; only the Docker bridge connects. Closing it is a pending owner decision.
- **Deploy key**: a dedicated ed25519 key for GitHub Actions is installed for VM user `padellevelup2026` (`authorized_keys`, comment `levapp-deploy@github-actions`); private half is the repo secret `GCE_SSH_PRIVATE_KEY`.

## 3. Accounts and where each secret lives

| Service | Identity | Notes |
|---|---|---|
| Google (Workspace, GCP, Cloudflare login) | `admin@levapp.app` (same account as `padellevelup2026@gmail.com`; old address stays as alias) | GCP project `padel-levelup-2026` owner; second owner invite pending for `pedropachecocontas@gmail.com` [owner] |
| GitHub org `PadelLevelUp` | owner `pedropacheco95`; billing email still `padelapp2025@gmail.com` [owner] | repo secrets: `DOCKERHUB_*`, `GCE_*`, `POSTGRES_PW`, `FLASK_SECRET_KEY`, `JWT_SECRET_KEY`, `STAGING_FLASK_SECRET_KEY`, `STAGING_JWT_SECRET_KEY`, `MAIL_PASSWORD`, `GCS_UPLOADS_BUCKET`, `OPENROUTER_API_KEY`, `VAPID_*` |
| Docker Hub | `padelapp`; email change to `admin@` pending [owner] | |
| Cloudflare | profile still `padellevelup2026@gmail.com`; change needs the account password [owner] | Registrar for both domains; `padellevelup.com` auto-renew OFF (expires 2027-03-06) |
| Apple Developer | Individual team `9K2J8D2ARR`; ASC key `AuthKey_79ZZ536G63.p8` in `~/.appstoreconnect/private_keys/` | do not move to an Organization team without a legal entity |
| Expo | owner `levapps-team`, project `dc8bbf5f-…` | OTA channel `production` |
| App mail | still `padelapp2025@gmail.com` via Gmail SMTP | switch to `admin@levapp.app` + app password, sender `noreply@levapp.app` [owner then session] |

## 4. Working in the monorepo

- Open Claude Code sessions at `~/Documents/Projetos/padel_app/levapp` — the Cortex skills and `specflow-entry` are listed only there. `~/Documents/Projetos/padel_app/levelup/` is the archived old layout; other sessions may still be parked in it.
- Tickets: `autonomously-implement-ticket` orchestrates `specflow-entry → spec-editor/bugs → tests → plan → develop → verification → PR into staging`. Releases: `/batch-merge-prs` (batch branch → PR into staging → PR staging → main).
- Backend `.venv` at `backend/.venv` is a symlink into the old `levelup_backend` checkout; recreate with Poetry if that directory is ever deleted.
- `cortex` CLI: run only documented commands inside the repo; an unknown argument (e.g. `--version`) falls through to `init`.
- Scheduled routines (Claude Desktop): `levapp-daily` 02:00, `-daily-change-report` 08:00, `-implement-tickets` 03:00 (worktree), `-linear-report` 19:00, `-test-health` 01:00, `-weekly-qa` Sun 20:00, `-weekly-curation` Sat 04:00, `-weekly-quality` Sun 04:00, `-test-runner` Sun 06:00 (worktree), `-monthly-review` 1st 06:00. Mac must be awake on AC power.

## 5. Open items

**[owner]** Cloudflare + Docker Hub + GitHub-billing email → `admin@levapp.app` · accept the GCP owner invite · decide on closing port 5432 · generate a Google app password on `admin@levapp.app` and set `MAIL_USERNAME`/`MAIL_PASSWORD` repo secrets · review the `OPEN:` notes in `.specflow/specs-business/**`.

**[72h — follow-up ticket]** DKIM (Admin → Apps → Gmail → Authenticate email; unlocks 24–72 h after 2026-09-03 ~15:30 UTC) → add the TXT in Cloudflare → Start authentication · after a week of DKIM, DMARC `p=quarantine` · switch Flask-Mail to `noreply@levapp.app` and ship via staging → main · confirm the first Linear linkback on a `pad-NNN` PR in the new repo.

**Ledger** (`.cortex/compass/bugs/`): B-003 resolved; B-008…B-014 filed as PAD-173…PAD-179. PAD-133 and PAD-147 reopened as partials.
