# Environment

Operational pointers only — aliases, profile names, tool locations. **Never secrets.**

- **Repo**: `PadelLevelUp/levapp` (public). Local checkout `~/Documents/Projetos/padel_app/levapp` — open sessions HERE. `~/Documents/Projetos/padel_app/levelup/` is the archived pre-monorepo layout.
- **Branches**: `staging` → staging.levapp.app · `main` → levapp.app + padellevelup.com. Both ruleset-protected; PRs only; `main` only from `staging`.
- **Canonical domain**: `levapp.app` (2026-09). The product is LevApp, so every new
  reference — app config, links, mail, docs — points there. `padellevelup.com` is
  **legacy but fully live**: it still serves prod and is still claimed for universal
  links, because App Store binaries already shipped hardcode it. Do not repoint or
  retire it, and never make it a staging hostname (see the staging-gated-release-flow
  decision). Retiring it would need an iOS release plus a deprecation window.
- **Prod VM**: one GCE instance runs everything — a host nginx in front of the prod and staging container pairs and one Postgres container, every container published on 127.0.0.1 (PAD-229). Its name, project, zone, addresses, the SSH command, the container/port map and the bucket names live in the **local, gitignored** `docs/infra/environment.md` — never here: this file is public (PAD-344, R-036). If your checkout lacks that file, ask the owner or the coordinator.
- **Staging data (PAD-200)**: every staging deploy refreshes `padel_app_staging` from production via `backend/scripts/sync-staging-db.sh` on the VM, best-effort — a failed copy never fails the deploy — and then scrubs every outbound channel (push subscriptions, device tokens, e-mail addresses), so staging can never push or mail a real person even if it later gains the credentials. Anything created on staging is lost at the next deploy. What the copy implies for accounts on staging is in the local map.
- **Health**: `https://levapp.app/api/app/healthz`, `https://staging.levapp.app/api/app/healthz`. Deploy watcher: `.claude/skills/batch-merge-prs/scripts/watch_deploy.sh <prod|staging> <sha>`.
- **iOS universal links** (PAD-184): the app claims `levapp.app` + `padellevelup.com` (`apps/mobile/app.json` → `ios.associatedDomains`). Both must serve `/.well-known/apple-app-site-association` as `application/json`, 200, **no redirect** — the container half is `apps/web/nginx.conf` (exact-match `location =`, `types { }` + `default_type`), the host-vhost half is manual and unversioned. Verify: `curl -sSI https://levapp.app/.well-known/apple-app-site-association` (a `text/html` body means the SPA fallback swallowed it). Runbook + device test steps: `docs/infra/universal-links.md` (local-only, `docs/` is gitignored) and the PAD-184 Linear thread.
- **Identity**: GitHub `pedropacheco95` (`export GH_TOKEN=$(gh auth token --user pedropacheco95)`) — visible on the public repo anyway. Which accounts own Google/GCP/Cloudflare/Workspace, Docker Hub, Expo and Apple is in the local map.
- **Secrets live in**: GitHub Actions secrets of `levapp`; `.claude/secrets.env` (gitignored) locally; the VM container env. Never in the repo.
- **Browser automation**: the Chrome profile "padel-app-chrome" — attach with `switch_browser` and click Connect there (the remembered device id points at a different Chrome).
- **Local dev DB**: `padel_app` on Postgres **5433**; E2E `levelup_test` on 5432 (Flask :5001, Vite :8080). Node 24.15.0 via `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`.
- **Scheduled routines**: Claude Desktop, ten `levapp-*` tasks (see `docs/plans/2026-09-03-scheduled-tasks-registration.md`); registry file under `~/Library/Application Support/Claude/claude-code-sessions/…/scheduled-tasks.json` — edit only with the app quit.
