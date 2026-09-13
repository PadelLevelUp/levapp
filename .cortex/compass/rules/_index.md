# Rules — index

**Read this when:** you are about to write or edit project files — check whether a
rule's `governs` glob matches the target path first.

**What's here:**
- `R-NNN-<slug>.md` — one file per rule: title, source, governed globs, optional machine check.

**How to navigate:** follow `source:` to the atlas decision or bug justifying the
rule; `governs:` names the constrained paths; `check:` is the testable predicate.
- [R-026 — A clickable card or list row is a real control, not a styled div with onClick](R-026-clickable-cards-are-real-controls.md) — governs web and mobile components (PAD-148)
- [R-027 — SSE fan-out is per-process: one gunicorn worker until a shared broker exists](R-027-sse-single-gunicorn-worker.md) — governs the Dockerfile and deploy workflows
- [R-028 — The production database is backed up nightly off the VM, and the backup fails loudly or proves restorable](R-028-production-database-is-backed-up-nightly-off-the-vm.md) — docker exec pg_dump → private GCS bucket, pruned by age; governs backup.sh, deploy-prod, repair, terraform (B-080)
- [R-030 — Backend tests run on SQLite with foreign keys enforced and on Postgres built by the real migrations](R-030-backend-tests-on-both-databases.md) — governs the backend suite, the migrations and the backend CI workflow; issued as R-026 by mistake and renumbered (PAD-278)
