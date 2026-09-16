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

**Then, on the VM (owner or coordinator-run SSH — permission-gated). Rewritten 2026-09-16 by Session A after rebasing #210 onto `80a377091`:**

### Ordering (the whole point)

The app containers take `POSTGRES_HOST` from `backend/.env.prod` / `.env.staging`, which every deploy scp's to the VM and passes with `--env-file` when it **re-creates** the app container. So:

- **Step B (network join, no recreate, no downtime) must happen before the first deploy that carries this PR.** That deploy re-creates `padelapp_staging` with `POSTGRES_HOST=postgres`; the name resolves only if the `postgres` container is on `levelup_net`. Without B, staging's entrypoint cannot reach the database, `flask db upgrade` fails, the deploy's wait loop goes red and staging is down (prod untouched).
- **Step D (re-create Postgres on loopback, seconds of downtime) must happen after the prod promotion that carries this PR.** Until then prod still reaches the database at `10.132.0.2:5432`, which only answers while the container is published on `0.0.0.0`. D before promotion takes production down.
- Between merge and promotion both work: staging by name on `levelup_net`, prod by the internal IP. Nothing else on the VM uses the host port — `sync-staging-db.sh` and `backup.sh` both go through `docker exec postgres`, and the workstation tunnel (`-L 5434:localhost:5432`) lands on the VM's loopback.
- Once B is confirmed, #210 no longer needs its own deploy; it can ride any batch. The constraint is only "B before the first deploy carrying it, D after the promotion carrying it".

### Runbook (VM, `sudo docker …` over `gcloud compute ssh`); times in UTC

**1. Read-only inspection — no change. Send me the output; stop if anything differs from the expectation.**
```bash
sudo docker inspect postgres --format 'image={{.Config.Image}} cmd={{json .Config.Cmd}} restart={{.HostConfig.RestartPolicy.Name}} ports={{json .HostConfig.PortBindings}}'
#  expect: image=postgres:15 cmd=["postgres"] restart=<anything> ports={"5432/tcp":[{"HostIp":"","HostPort":"5432"}]}
sudo docker inspect postgres --format '{{range .Mounts}}{{.Source}}:{{.Destination}} {{end}}'
#  expect exactly: /data/postgres:/var/lib/postgresql/data
sudo docker inspect postgres --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
#  expect: bridge   (if it already says levelup_net, step 2 is a no-op)
sudo docker inspect postgres --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -v PASSWORD
#  expect POSTGRES_USER=padel_app_user POSTGRES_DB=padel_app and no PGDATA
sudo ss -ltnp | grep 5432                                  # expect 0.0.0.0:5432 (docker-proxy)
grep -H POSTGRES_HOST ~/.env.staging ~/.env.prod           # expect 10.132.0.2 in both
```
If the image, cmd or mount differ, stop: step 5's `docker run` must reproduce them and I will rewrite it from your output.

**2. Step B — before the merge. No downtime, nothing restarts.**
```bash
sudo docker network connect levelup_net postgres || true
sudo docker update --restart unless-stopped postgres
```
**3. Verify B.**
```bash
sudo docker inspect postgres --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}={{$v.IPAddress}} {{end}}'   # bridge=… levelup_net=…
sudo docker exec padelapp_staging getent hosts postgres    # prints the levelup_net address → B is done, tell me
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5100/api/app/healthz   # still 200 (nothing changed for the apps yet)
```
Back-out for B (only before the deploy that carries this PR): `sudo docker network disconnect levelup_net postgres`.

**4. Merge #210 → staging deploy re-creates `padelapp_staging` with `POSTGRES_HOST=postgres`. Then, and after the next prod promotion:**
```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5100/api/app/healthz   # staging 200
sudo docker exec padelapp_staging env | grep POSTGRES_HOST                         # postgres
# after promotion:
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5000/api/app/healthz   # prod 200
sudo docker exec padelapp env | grep POSTGRES_HOST                                 # postgres — only now may step 5 run
```
Back-out for the merge (before step 5): revert #210 on staging; the redeploy puts `10.132.0.2` back and the `0.0.0.0` binding still answers.

**5. Step D — after BOTH environments show `POSTGRES_HOST=postgres`. Not between 02:30 and 03:30 VM time (backup cron), and not while a staging deploy's `sync-db` job is running.**
```bash
PW=$(sudo docker inspect postgres --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^POSTGRES_PASSWORD=//p')
date -u; sudo docker stop postgres && sudo docker rm postgres
sudo docker run -d --name postgres --restart unless-stopped --network levelup_net \
  -e POSTGRES_USER=padel_app_user -e POSTGRES_PASSWORD="$PW" -e POSTGRES_DB=padel_app \
  -p 127.0.0.1:5432:5432 -v /data/postgres:/var/lib/postgresql/data postgres:15
unset PW; date -u
```
The password only matters to `initdb` on an empty data directory; with `/data/postgres` populated it is ignored, so reading it back from the old container is belt and braces, not a requirement.

**6. Verify D.**
```bash
sudo docker logs --tail 5 postgres                          # "database system is ready to accept connections"
sudo ss -ltnp | grep 5432                                   # 127.0.0.1:5432 only — no 0.0.0.0
sudo docker exec postgres psql -U padel_app_user -d padel_app -Atc 'select 1'          # 1
sudo docker exec postgres psql -U padel_app_user -d padel_app_staging -Atc 'select 1'  # 1
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5000/api/app/healthz   # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5100/api/app/healthz   # 200
```
Then one real request against `https://levapp.app` (log in, open the calendar): the app's pool has `pool_pre_ping=True`, so stale pooled connections are replaced on first use without an app restart.

Back-out for D: the same `docker run` with `-p 5432:5432` in place of `-p 127.0.0.1:5432:5432` — that is exactly the pre-change state (plus `levelup_net`, which is harmless). Data is on `/data/postgres` throughout; nothing in this runbook writes to it.

### Visible outage
- Steps 1–4: none beyond the normal deploy restarts.
- Step 5: the one Postgres container serves both databases, so **every API request that touches the database fails for the stop→ready window of the container — roughly 5–10 s** (Postgres stops in about a second; start-up to "ready to accept connections" is a few seconds on a 0.7 MB database). Web pages already loaded keep rendering; requests during the window get a 500; SSE streams may drop and reconnect. No app restart, no data loss, no migration.

### Resolution

(pending — PAD-292; the repo half only. The VM half is an owner action recorded here when done.)
