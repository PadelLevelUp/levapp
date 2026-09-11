---
id: B-069
title: "The Postgres container is published on 0.0.0.0:5432; only the firewall keeps it off the internet"
type: incomplete-rule
severity: low
status: triaged
affects:
  - backend/terraform/main.tf
  - ../../atlas/decisions/2026-09-10-vm-ingress-nginx-only-ssh-stays-open.md
  - B-048
proposed_fix: "Publish the container on 127.0.0.1:5432 and put it on levelup_net so the app containers reach it by name; the running VM is re-created by hand from the runbook below."
opened: 2026-09-11T12:45:00Z
---

# B-069 — The Postgres container is published on 0.0.0.0:5432; only the firewall keeps it off the internet

**Source:** verified on `levelup-instance` on 2026-09-10 (wave-2 plan file, 19:15) while
landing #188 (PAD-229). Ticket PAD-292.

**What happens:** the startup script in `backend/terraform/main.tf` runs the database as
`docker run … -p 5432:5432 … postgres:15`, so dockerd binds `0.0.0.0:5432` on the VM. B-048
deleted the firewall rule that let the internet in, so today nothing reaches it — but one
re-created rule (the `backend` rule of PAD-229 was exactly that kind of accident) would expose
the real database again. Docker also punches its own iptables holes, so a host firewall would
not have helped either.

**What should happen:** the 2026-09-10 ingress decision — only nginx faces the internet; every
container publishes on `127.0.0.1` — applies to Postgres too. Defence in depth, not an open hole.

**Why it is type 2:** the decision covered the API and web containers and left the database
implicit. This entry makes it explicit.

**Constraints that make this more than a one-line change:**
1. `google_compute_instance.levelup` has `ignore_changes = [metadata_startup_script]`
   (PAD-230): editing `main.tf` never touches the running VM. The script only defines a rebuilt
   VM; the live container has to be re-created by hand.
2. The deploy workflows do not run Postgres. Their `ports: ["5432:5432"]` lines are the
   PAD-220 drift-gate `services:` on the GitHub runner — changing them changes nothing on the VM.
3. The app containers run on `--network levelup_net` and read `POSTGRES_HOST` from
   `/home/<deploy user>/.env.staging` and `.env.prod` on the VM (not in the repo). If that host
   is the VM-internal address, a loopback-only publish breaks prod and staging: a bridge-network
   container cannot reach the host's `127.0.0.1`. Postgres must join `levelup_net` and the
   env files must point at `postgres` **before** the publish changes.

### Change Plan

**Files to modify:** `backend/terraform/main.tf` (startup script + comment). Workflows untouched.

**Then (on the VM, owner or coordinator-approved SSH — permission-gated):**
```
# 1. read-only: what is there today
sudo docker inspect postgres --format '{{json .HostConfig.PortBindings}} {{json .NetworkSettings.Networks}}'
grep -H POSTGRES_HOST ~/.env.staging ~/.env.prod
sudo ss -ltnp | grep 5432
# 2. no downtime: reachable by name from the app network
sudo docker network connect levelup_net postgres || true
sed -i 's/^POSTGRES_HOST=.*/POSTGRES_HOST=postgres/' ~/.env.staging ~/.env.prod   # takes effect on the next deploy of each
# 3. re-create on loopback — the ONE container serving BOTH prod and staging DBs is down for seconds; owner runs this; data stays on /data/postgres
sudo docker stop postgres && sudo docker rm postgres
sudo docker run -d --name postgres --restart unless-stopped --network levelup_net \
  -e POSTGRES_USER=padel_app_user -e POSTGRES_PASSWORD='<current password>' -e POSTGRES_DB=padel_app \
  -p 127.0.0.1:5432:5432 -v /data/postgres:/var/lib/postgresql/data postgres:15
# 4. verify
sudo ss -ltnp | grep 5432            # 127.0.0.1:5432 only
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5100/api/app/healthz   # staging 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5000/api/app/healthz   # prod 200
```
Order matters: step 2 before step 3, and each app container picks up `POSTGRES_HOST=postgres`
only when its deploy re-creates it — so run step 3 after the batch-4 staging deploy and the
next prod promotion, or restart the app containers by hand after it.

### Resolution

(pending — PAD-292; the repo half only. The VM half is an owner action recorded here when done.)
