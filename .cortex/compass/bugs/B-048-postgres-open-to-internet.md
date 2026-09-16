---
id: B-048
title: "Postgres 5432 was open to 0.0.0.0/0"
type: layer-drift
severity: critical
status: resolved
affects:
  - backend/terraform/main.tf
  - backend/.env.dev
  - backend/padel_app/config.py
proposed_fix: "Delete the allow-postgres firewall rule; reach the shared database over an SSH port-forward, and teach the PAD-95 guard to recognise the tunnel."
opened: 2026-09-06T10:00:00Z
resolved: 2026-09-06T12:00:00Z
---

# B-048 — Postgres 5432 was open to 0.0.0.0/0

`google_compute_firewall.allow-postgres` allowed TCP 5432 from anywhere, with a restricted `/32` commented out directly above it. The database is a container on the shared VM holding real data. The VM's external address is necessarily public (the iOS app calls the API on it), so the open port was directly reachable.

It was also **load-bearing**, which is why closing it was not a one-line change: `backend/.env.dev` set `POSTGRES_HOST` to the VM's external IP, so the shared dev database was reached over the internet. Production and staging use the VM-internal address and never needed the rule.

**Resolved 2026-09-06:** the rule is deleted. The shared database is now reached with `gcloud compute ssh levelup-instance -- -N -L 5434:localhost:5432`.

The tunnel introduced a second-order risk worth recording: it makes a remote database answer on `localhost`, which would have silently disarmed the PAD-95 guard (`assert_safe_migration_target`) — the check that stops a workstation migrating real data. The guard is now keyed on the endpoint rather than the host alone, with 5434 reserved as "forwarded remote" (5432 and 5433 are the local multi-tenant and dev servers, per `backend/CLAUDE.md`). Fixing that also exposed a latent defect at `padel_app/__init__.py`: the `create_app` call passed `env` positionally into what became the `port` parameter, which would have disabled the guard at its most important call site.

*Found while auditing what the public repo discloses, 2026-09-06.*
