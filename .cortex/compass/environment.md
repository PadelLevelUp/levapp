# Environment

Operational pointers only — aliases, profile names, tool locations. **Never secrets.**

- **Repo**: `PadelLevelUp/levapp` (public). Local checkout `~/Documents/Projetos/padel_app/levapp` — open sessions HERE. `~/Documents/Projetos/padel_app/levelup/` is the archived pre-monorepo layout.
- **Branches**: `staging` → staging.levapp.app · `main` → levapp.app + padellevelup.com. Both ruleset-protected; PRs only; `main` only from `staging`.
- **Prod VM**: GCE `levelup-instance`, project `padel-levelup-2026`, zone `europe-west1-b`, IP `34.78.247.45`; `gcloud compute ssh levelup-instance --zone europe-west1-b --project padel-levelup-2026`. Host nginx vhosts in `/etc/nginx/sites-available/`; containers `padelapp` (:5000), `levelup_frontend` (:3000), `padelapp_staging` (:5100), `levelup_frontend_staging` (:3100), `postgres` (:5432, DBs `padel_app` and `padel_app_staging`), `issue-bot`.
- **Health**: `https://levapp.app/api/app/healthz`, `https://staging.levapp.app/api/app/healthz`. Deploy watcher: `.claude/skills/batch-merge-prs/scripts/watch_deploy.sh <prod|staging> <sha>`.
- **Identity**: Google/GCP/Cloudflare/Workspace = `admin@levapp.app` (was `padellevelup2026@gmail.com`); GitHub `pedropacheco95` (`export GH_TOKEN=$(gh auth token --user pedropacheco95)`); Docker Hub `padelapp`; Expo `levapps-team`; Apple team `9K2J8D2ARR`.
- **Secrets live in**: GitHub Actions secrets of `levapp`; `.claude/secrets.env` (gitignored) locally; the VM container env. Never in the repo.
- **Browser automation**: the Chrome profile "padel-app-chrome" — attach with `switch_browser` and click Connect there (the remembered device id points at a different Chrome).
- **Local dev DB**: `padel_app` on Postgres **5433**; E2E `levelup_test` on 5432 (Flask :5001, Vite :8080). Node 24.15.0 via `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`.
- **Scheduled routines**: Claude Desktop, ten `levapp-*` tasks (see `docs/plans/2026-09-03-scheduled-tasks-registration.md`); registry file under `~/Library/Application Support/Claude/claude-code-sessions/…/scheduled-tasks.json` — edit only with the app quit.
