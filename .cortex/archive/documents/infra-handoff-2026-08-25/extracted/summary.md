# Summary — infrastructure handoff (2026-08-25)

A point-in-time snapshot of the whole system, written for an infrastructure
conversation. Everything server-side runs on **one GCE e2-micro VM**: Flask API,
the web SPA behind nginx, Postgres (as a container on a host bind mount), and the
Discord issue bot. No Cloud SQL, no load balancer, no CDN, and — at the time of
writing — no cloud staging environment. Deploys are GitHub Actions on push.

**The load-bearing constraint** is the single gunicorn worker: APScheduler runs
in-process and SSE fan-out is a module-level in-memory queue list, so a second
worker means duplicate scheduled jobs and broken SSE. Every open SSE connection
pins a thread (~60 concurrent clients is the practical wall), and Expo push sends
run synchronously in the request path on that same pool — a latent repeat of the
2026-06-10/11 thread-leak wedge. Extracted as a decision alongside this summary.

**Risk register** (the document's real payload, 12 items): disk has hit 100%
twice; Postgres backup status unverified; containers may lack restart policies;
Postgres 5432 and the uploads bucket are open by Terraform declaration; no tests
in CI with mutable `:latest` images; host nginx and TLS are entirely unversioned;
iOS release is manual with silent-overwrite traps; Alembic multiple-heads risk on
batch merges. Cost is near-zero and prod data is tiny — the risks are about
fragility, not load.

**Two items are stale and must not be re-derived from this document:**
- The `SECRET_KEY`/`JWT_SECRET_KEY` dev-fallback item (`[verify]`) is **fixed** —
  see `compass/bugs/B-003`, resolved 2026-09-03 with a production startup guard
  (`backend/padel_app/config.py`) and a one-time secret rotation.
- It claims `terraform.tfstate` is committed; it is not (only `*.tf` sources are).
  Noted in `docs/plans/2026-09-02-levapp-monorepo-cortex-migration.md` (local-only).

Verbatim source: `source.md` (gitignored — schema §4.4). Paths in it use the
pre-monorepo `levelup_backend/` / `levelup_frontend/` layout.
