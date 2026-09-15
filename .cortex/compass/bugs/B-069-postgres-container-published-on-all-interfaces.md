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
3. **The app containers reach the database at `POSTGRES_HOST=10.132.0.2`** — the VM's internal
   IP — set in `backend/.env.prod` and `backend/.env.staging`. Those two files are **tracked
   templates that every deploy scp's to the VM**, so a VM-side edit is overwritten by the next
   deploy. A bridge-network container cannot reach the host's `127.0.0.1`, so a loopback-only
   publish with the IP still in the env files takes prod and staging down. The host change
   therefore lives in the repo (`POSTGRES_HOST=postgres`), the container name on `levelup_net`,
   and `postgres` joins `PRODUCTION_POSTGRES_HOSTS` so the PAD-95 migration guard keeps
   failing closed on it.

### Change Plan

**Files to modify:** `backend/terraform/main.tf` (startup script + comment), `backend/.env.prod`
and `backend/.env.staging` (`POSTGRES_HOST=postgres`), `backend/padel_app/config.py`
(`"postgres"` in `PRODUCTION_POSTGRES_HOSTS`), `test_config_database_host.py` (red-first).
Workflows untouched.

**Then, on the VM (owner or coordinator-approved SSH — permission-gated), in this order:**
```
# A. read-only: what is there today
sudo docker inspect postgres --format '{{json .HostConfig.PortBindings}} {{json .NetworkSettings.Networks}}'
grep -H POSTGRES_HOST ~/.env.staging ~/.env.prod          # 10.132.0.2 until the batch-4 deploy lands
sudo ss -ltnp | grep 5432                                  # 0.0.0.0:5432 today

# B. BEFORE the deploy that carries this change (no downtime): make `postgres` resolvable on the app network
sudo docker network connect levelup_net postgres || true
sudo docker update --restart unless-stopped postgres
sudo docker exec padelapp_staging getent hosts postgres    # prints the container's levelup_net address

# C. the batch-4 staging deploy (and the next prod promotion) re-create the app containers with
#    POSTGRES_HOST=postgres from the new env templates — verify each:
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5100/api/app/healthz   # staging 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5000/api/app/healthz   # prod 200, after promotion
#    Until prod is promoted, prod still uses 10.132.0.2 — do NOT run step D before both are on `postgres`.

# D. re-create Postgres on loopback — the ONE container serving BOTH prod and staging DBs is down
#    for seconds; owner runs this; data stays on /data/postgres
sudo docker stop postgres && sudo docker rm postgres
sudo docker run -d --name postgres --restart unless-stopped --network levelup_net \
  -e POSTGRES_USER=padel_app_user -e POSTGRES_PASSWORD='<current password>' -e POSTGRES_DB=padel_app \
  -p 127.0.0.1:5432:5432 -v /data/postgres:/var/lib/postgresql/data postgres:15

# E. verify
sudo ss -ltnp | grep 5432                                  # 127.0.0.1:5432 only
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5100/api/app/healthz   # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5000/api/app/healthz   # 200
```
Step B before C, C (both environments) before D. The SSH tunnel for workstations
(`-L 5434:localhost:5432`) keeps working: it lands on the VM's loopback. If the password rotation
runbook (2026-09-11 owner infra runbooks) runs first, step D uses the NEW password.

### Resolution

(pending — PAD-292; the repo half only. The VM half is an owner action recorded here when done.)
