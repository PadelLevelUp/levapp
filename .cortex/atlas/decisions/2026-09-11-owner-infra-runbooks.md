---
id: decision.2026-09-11-owner-infra-runbooks
title: "Draft for the owner: DKIM for levapp.app, Postgres password rotation, retiring the legacy Terraform state — runbooks"
date: 2026-09-11T15:00:00Z
compass_rules: []
related_specs: []
supersedes: []
sources:
  - ../../../backend/terraform/main.tf
  - ../../../backend/terraform/backend.tf
  - ../../../backend/.env.prod
  - ../../../backend/.env.staging
  - ../../../backend/scripts/backup.sh
  - ../../../.github/workflows/deploy-prod.yaml
  - 2026-09-10-vm-ingress-nginx-only-ssh-stays-open.md
---

# Owner runbooks — DKIM for levapp.app, Postgres password rotation, retiring the legacy Terraform state

**Status:** DRAFT, 2026-09-11, Session G for coordinator levapp-ee. Read-only inventory of staging
`72ac170a8`, the tracked env files, the workflows, `backend/terraform`, public DNS (queried via
1.1.1.1 and 8.8.8.8 on 2026-09-11 ~15:00 UTC) and the local legacy checkouts. **Nothing was
changed:** no VM, GCP, DNS, GitHub-secret or file operation was performed. Every section ends with
the exact commands the owner pastes, in order, read-only checks first. Secret *values* appear
nowhere in this document; where a value is needed the command prompts for it.

Tickets: PAD-187 (DKIM, the sender and DMARC); the rotation and the state retirement are the two
owner actions PR #189 (PAD-230) left open. Related ledger entries: B-048 (Postgres open to the
internet, resolved), B-069 (Postgres container on 0.0.0.0, PAD-292), **B-080 (nightly backup is a
no-op — found while writing runbook 2)**.

---

## Runbook 1 — DKIM for `levapp.app` (PAD-187 steps 1, 2 and 4)

### What exists (verified)
| Item | State on 2026-09-11 |
|---|---|
| DNS provider | **Cloudflare** for both `levapp.app` and `padellevelup.com` (NS `michael.ns.cloudflare.com`, `sunny.ns.cloudflare.com`) — discoverable, no guess needed |
| Mail provider | Google Workspace, one seat `admin@levapp.app`; aliases `noreply@`, `hello@` (decision 2026-09-03) |
| `levapp.app` MX | `1 smtp.google.com.` |
| `levapp.app` SPF | `v=spf1 include:_spf.google.com ~all` |
| `levapp.app` DMARC | `v=DMARC1; p=none; rua=mailto:admin@levapp.app; adkim=s; aspf=s` |
| `levapp.app` DKIM | **absent** — `google._domainkey.levapp.app` has no TXT and no CNAME (this is the missing piece) |
| `padellevelup.com` | **no MX, no SPF, no DMARC** — the legacy domain sends no mail today, so anyone can spoof it; see the option at the end |
| App sender | Flask-Mail via `smtp.gmail.com:465`, `MAIL_USERNAME=admin@levapp.app`, `MAIL_DEFAULT_SENDER=noreply@levapp.app` in the tracked `backend/.env.prod` and `.env.staging`, **already on `main`**; `MAIL_PASSWORD` (the Google app password) is a repo secret set 2026-09-08. PAD-187 step 3 is therefore done in code; only the DNS half remains |
| Staging guard | `MAIL_ALLOWED_RECIPIENTS=@levapp.app,…` in `.env.staging` — staging can send a real test mail to an `@levapp.app` inbox and to nobody else |

### What the record is
Google Workspace signs with selector **`google`**: one TXT record at **`google._domainkey.levapp.app`**
whose value Google generates (`v=DKIM1; k=rsa; p=<2048-bit public key>`). Cloudflare splits a value
longer than 255 characters into strings automatically; TXT records cannot be proxied, so "DNS only"
is the only option. Nothing changes in the repo: the app relays through Google, and Google signs
every message it relays for the domain once authentication is started — the app's mail becomes
`DKIM=pass d=levapp.app` with no code change.

### Why the order matters, and what breaks if it is wrong
- **Start authentication only after the TXT resolves.** Google checks the record when you click
  *Start authentication*; if it is not visible yet the console says "not authenticating" and
  nothing signs. Harmless; retry after propagation.
- **A wrong or truncated `p=` value** makes DKIM *fail* rather than *absent*. Today that costs
  nothing (`p=none`), but with DMARC at `quarantine` and `adkim=s`, a failing signature plus any
  SPF break (a forwarder, a mailing list) sends mail to spam. So: never tighten DMARC (step 4)
  until "Show original" has read `DKIM: PASS … d=levapp.app` for a week of real traffic.
- **`aspf=s`/`adkim=s` are strict**: the signing domain must be exactly `levapp.app`, not a
  subdomain. Google's Workspace signature uses the primary domain, so this is satisfied; keep it.
- **Rollback**: delete the TXT record and (in the Admin console) *Stop authentication*. Google
  falls back to its default `gappssmtp.com` signature; mail keeps flowing on SPF.

### Commands — paste in order
```bash
# 0. read-only: confirm the starting state (all three must agree)
dig +short NS levapp.app @1.1.1.1                       # michael/sunny.ns.cloudflare.com
dig +short TXT levapp.app @1.1.1.1                      # the spf1 include:_spf.google.com line
dig +short TXT _dmarc.levapp.app @1.1.1.1               # p=none today
dig +short TXT google._domainkey.levapp.app @1.1.1.1    # EMPTY before step 1

# 1. Admin console (browser, as admin@levapp.app; the Chrome profile "padel-app-chrome"):
#    Apps → Google Workspace → Gmail → Authenticate email → domain levapp.app
#    → Generate new record → 2048-bit, selector "google" → copy the TXT VALUE shown.
# 2. Cloudflare (browser): levapp.app → DNS → Records → Add record
#    Type TXT · Name google._domainkey · Content <the value from step 1> · TTL Auto · (DNS only)
# 3. wait for propagation, then check from two resolvers (Cloudflare is usually <2 min):
dig +short TXT google._domainkey.levapp.app @1.1.1.1 | cut -c1-60
dig +short TXT google._domainkey.levapp.app @8.8.8.8   | cut -c1-60
# 4. Admin console → same page → Start authentication → status must read "Authenticating email".
# 5. verify with real mail: send from admin@levapp.app to a personal Gmail; in Gmail: ⋮ → Show original
#    → expect SPF PASS, DKIM PASS with domain levapp.app, DMARC PASS.
#    Then the app path: on staging.levapp.app request a verification code for an @levapp.app inbox
#    (allowed by MAIL_ALLOWED_RECIPIENTS); Show original on that mail must read the same.
# 6. optional cross-check: https://toolbox.googleapps.com/apps/checkmx/  (domain levapp.app, selector google)

# 7. ONE WEEK LATER, only if every checked mail read DKIM PASS (PAD-187 step 4):
#    Cloudflare → edit TXT _dmarc.levapp.app →
#    v=DMARC1; p=quarantine; rua=mailto:admin@levapp.app; adkim=s; aspf=s
dig +short TXT _dmarc.levapp.app @1.1.1.1               # confirm the new policy
```

### Option for the owner — lock the legacy domain
`padellevelup.com` sends nothing, so publish a null SPF and a reject policy to stop spoofing:
TXT `padellevelup.com` = `v=spf1 -all`; TXT `_dmarc.padellevelup.com` = `v=DMARC1; p=reject;
rua=mailto:admin@levapp.app`. Do **not** do this if anything ever needs to send as
`@padellevelup.com` (nothing in the repo does; the App Store binaries only claim it for links).

---

## Runbook 2 — rotate the Postgres password (`padel_app_user`)

### Every place the password lives (inventory, values not read)
| # | Where | How it gets there | Needs action on rotation |
|---|---|---|---|
| 1 | **The database role** `padel_app_user` in the `postgres` container on the VM (`postgres:15`, data bind-mounted at `/data/postgres`) | initdb at first boot from the startup script's `POSTGRES_PASSWORD` | **yes — the authoritative change** (`ALTER USER`) |
| 2 | **GitHub Actions secret `POSTGRES_PW`** in `PadelLevelUp/levapp` (created 2026-09-03) | set by the owner | **yes** — feeds both deploys |
| 3 | **Prod container `padelapp`** env | `deploy-prod.yaml:154` `-e POSTGRES_PW="${{ secrets.POSTGRES_PW }}"` on `docker run` | **yes** — by re-running the deploy (or a hand re-create) |
| 4 | **Staging container `padelapp_staging`** env | `deploy-staging.yaml:175`, same secret | **yes** — same |
| 5 | VM env files `~/.env.prod`, `~/.env.staging` | scp'd from the tracked, secret-free `backend/.env.*` on every deploy | **no** — they carry `POSTGRES_HOST=10.132.0.2`, `POSTGRES_USER`, `POSTGRES_DB`, never the password |
| 6 | **VM instance metadata `startup-script`** | Terraform embedded `-e POSTGRES_PASSWORD=${var.postgres_password}` (`main.tf:89`) | plaintext of the **old** password stays there until removed; harmless after rotation, see step 9 |
| 7 | Terraform `var.postgres_password` (`variables.tf:13-17`, sensitive, no default) | passed at plan time | **no** — `ignore_changes = [metadata_startup_script]` (PAD-230) means any value plans clean; nothing to store |
| 8 | Terraform state in `gs://padel-levelup-2026-tfstate/levapp/prod` | rendered startup script inside `google_compute_instance.levelup` | contains the **old** password; harmless after rotation; the bucket is private and versioned |
| 9 | Legacy local states (`levelup/levelup_backend/terraform/terraform.tfstate` + `.backup`, `olds/padel_app/terraform/*.tfstate*` + `terraform.tfvars`, and both inside `levelup.zip`) | rendered startup scripts | plaintext **old** password on an iCloud-synced disk → **runbook 3 deletes them after this rotation** |
| 10 | `.claude/secrets.env` on the owner's Mac (`POSTGRES_PW`) | typed by the owner; used by E2E/Maestro/backend Postgres runs against the **local** servers on 5432/5433 | see the decision below — recommended: local gets its **own** password, so the laptop stops holding prod's |
| 11 | Local Postgres servers (5432 E2E, 5433 dev) hold their own copy of the role | created locally | only if the owner keeps one shared value |
| 12 | `sync-staging-db.sh` (PAD-200), `repair.yaml` | `docker exec … psql -U …` inside the container (trust auth on the local socket) | **no** — no password used |
| 13 | `backend/scripts/backup.sh` (nightly cron 03:00 on the VM, installed by `deploy-prod.yaml`) | reads `POSTGRES_PASSWORD`, which nothing sets; runs `pg_dump -h localhost` on the **host**, where no `pg_dump` is installed; uploads to `BUCKET=""` | **no** — but it means **prod has probably never had a nightly backup** (B-080). Step 1 below takes a manual dump first |
| 14 | `google-cloud-secret-manager` dependency | declared, never imported | nothing — Secret Manager is not in use |

Facts that shape the order: **prod and staging share one Postgres server and one role** (only
`POSTGRES_DB` differs: `padel_app` vs `padel_app_staging`), so the rotation is one event for both.
Postgres holds **one** password per role, so from the `ALTER USER` until each app container is
re-created with the new value, **new** DB connections from that app fail (existing pooled
connections keep working). The deploys re-create the containers in ~3–5 minutes each; do both at a
quiet hour. `config.py:38` builds the URI without URL-quoting and the deploy passes the value on a
shell command line over SSH, so the new password must be **alphanumeric only**.

### Commands — paste in order
```bash
# 0. read-only: where things stand (VM). All ssh calls as admin@levapp.app.
gcloud compute ssh levelup-instance --zone europe-west1-b --project padel-levelup-2026 --command \
  'sudo docker ps --format "{{.Names}}\t{{.Status}}"; sudo docker exec postgres psql -U padel_app_user -d postgres -Atc "select rolname, rolcanlogin from pg_roles where rolname=current_user; select datname from pg_database where datname like '"'"'padel_app%'"'"'"; ls -la ~/backup.log 2>/dev/null; tail -3 ~/backup.log 2>/dev/null; which pg_dump || echo "no pg_dump on host"'
curl -s -o /dev/null -w 'prod %{http_code}\n'    https://levapp.app/api/app/healthz
curl -s -o /dev/null -w 'staging %{http_code}\n' https://staging.levapp.app/api/app/healthz

# 1. BACKUP FIRST (the nightly one is a no-op, B-080). Compressed custom-format dumps, inside the container:
gcloud compute ssh levelup-instance --zone europe-west1-b --project padel-levelup-2026 --command \
  'set -e; D=$(date +%F-%H%M); sudo docker exec postgres pg_dump -U padel_app_user -Fc padel_app > ~/padel_app-$D.dump; sudo docker exec postgres pg_dump -U padel_app_user -Fc padel_app_staging > ~/padel_app_staging-$D.dump; ls -la ~/*.dump; sudo docker exec postgres pg_restore --list /dev/stdin < ~/padel_app-$D.dump | tail -2'
#    a prod dump must be several MB and pg_restore --list must print table entries. Copy it off the VM:
gcloud compute scp --zone europe-west1-b --project padel-levelup-2026 'levelup-instance:~/padel_app-*.dump' ~/Desktop/

# 2. generate the new password LOCALLY (alphanumeric, 40 chars) and store it in the password manager:
openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-40
#    keep the OLD value in the password manager too until step 8 is green (rollback needs it).

# 3. set the GitHub secret (prompts for the value; nothing deploys yet):
export GH_TOKEN=$(gh auth token --user pedropacheco95)
gh secret set POSTGRES_PW -R PadelLevelUp/levapp

# 4. change the role's password (interactive prompt inside psql, so it never touches shell history):
gcloud compute ssh levelup-instance --zone europe-west1-b --project padel-levelup-2026 -- -t \
  'sudo docker exec -it postgres psql -U padel_app_user -d postgres -c "\password padel_app_user"'
#    From here new app connections fail until step 5 completes — go straight on.

# 5. re-create both app containers with the new secret (backend only; ~3–5 min each, run in parallel):
gh workflow run deploy-prod.yaml    -R PadelLevelUp/levapp -f target=backend
gh workflow run deploy-staging.yaml -R PadelLevelUp/levapp -f target=backend
gh run list -R PadelLevelUp/levapp --limit 4        # then: gh run watch <id> for each

# 6. verify
curl -s -o /dev/null -w 'prod %{http_code}\n'    https://levapp.app/api/app/healthz     # 200 (healthz runs SELECT 1)
curl -s -o /dev/null -w 'staging %{http_code}\n' https://staging.levapp.app/api/app/healthz
gcloud compute ssh levelup-instance --zone europe-west1-b --project padel-levelup-2026 --command \
  'sudo docker logs --tail 5 padelapp; sudo docker logs --tail 5 padelapp_staging; sudo docker exec postgres psql -U padel_app_user -d postgres -Atc "select datname, count(*) from pg_stat_activity where usename=current_user group by 1"'
#    then log in on levapp.app and on staging.levapp.app, open the calendar (a real query), send a message.
#    The staging deploy also runs sync-staging-db.sh (no password involved) — check its job is green too.

# 7. local machines (owner decision below). Recommended: a DIFFERENT local password.
#    Local E2E/dev servers keep working with the value already in .claude/secrets.env; nothing to do.
#    If instead one shared value is kept: on the Mac, for each local server (5432 and 5433):
#    psql -h localhost -p 5432 -U padel_app_user -d postgres -c '\password padel_app_user'
#    and edit POSTGRES_PW in .claude/secrets.env (every worktree copies it).

# 8. rollback (only if step 6 fails and the cause is the password): repeat step 4 with the OLD value,
#    set the OLD value in step 3, re-run step 5. Data is untouched by a rotation; the dumps from step 1
#    are the safety net for anything else.

# 9. afterwards — the old password still sits in plaintext in the VM metadata startup script and in
#    the Terraform states (rows 6, 8, 9). It is now a dead credential; runbook 3 removes the local
#    copies. Removing the metadata script is a separate decision: today it is what `docker start`s
#    Postgres after a VM reboot (the container has no --restart policy), so first
#    `sudo docker update --restart unless-stopped postgres` (PAD-292's runbook does the same when it
#    re-creates the container), and only then consider
#    `gcloud compute instances remove-metadata levelup-instance --zone europe-west1-b --keys startup-script`
#    (Terraform ignores metadata changes, so no drift).
```

**Expected downtime:** 3–5 minutes of failing database-backed requests on prod and on staging,
starting at step 4 and ending when each backend deploy prints "migrations applied"; SSE streams
reconnect on their own; APScheduler jobs that fire in the window log errors and run on the next
tick (`process_batches` is `coalesce=True`). Pick a quiet hour and say so in Discord first.

### Decisions for the owner (runbook 2)
- **R2-1 Rotation window:** a quiet hour this week (default: tonight after 23:00 Lisbon).
- **R2-2 Local password decoupling:** local servers keep a *different* password and `secrets.env`
  holds only that one (default) — the laptop stops carrying the production credential; or keep one
  shared value.
- **R2-3 Startup-script metadata:** leave it (default until PAD-292's container re-create sets the
  restart policy), then remove it; longer term move the password out of the script (Secret Manager
  read at boot) — a ticket, not this runbook.
- **R2-4 Backups (B-080):** fix `backup.sh` now (dump inside the container, upload to a private
  bucket, alert on failure) as its own ticket (default: yes, before anything else touches the DB).

---

## Runbook 3 — retire the legacy Terraform state

### What exists (verified, read-only)
| File | Backend | Serial | Lineage | Resources | Note |
|---|---|---|---|---|---|
| `gs://padel-levelup-2026-tfstate/levapp/prod` (monorepo `backend/terraform/backend.tf`) | GCS, versioned, public-access prevention | — | migrated from the file below (PAD-230, #189) | 14 (`terraform plan` = **No changes** on 2026-09-10) | **the only live state** |
| `~/Documents/Projetos/padel_app/levelup/levelup_backend/terraform/terraform.tfstate` | local | 11 | `b2431c64-0338-4d3c-a0c5-6c809683bd8c` | 9 — network, static_ip, `allow-postgres` (B-048, gone), http-https, instance, vm_sa, bucket general, `allow_instance_uploads`, `public_all` (B-047, gone) | the source of the migration; **stale**; contains the rendered startup script with the password (twice) |
| same dir, `terraform.tfstate.backup` | local | 7 | same | 8 | stale, same content class |
| `…/levelup_backend/terraform/.terraform/` | providers only | — | — | — | no state inside; safe to delete with the dir |
| `~/Documents/Projetos/padel_app/olds/padel_app/terraform/terraform.tfstate` (+ `.backup`, + **`terraform.tfvars`**) | local | 46 / 43 | `0a7b4861-cce3-2285-9190-6fea687a33d6` | 9, resource names `padel-app-instance`, `padel-app-static-ip`, `padel-app-allow-*` | an **earlier, different** deployment (2025 layout); `terraform.tfvars` holds that era's password in clear. Whether those GCP resources still exist is unknown — check in step 0 |
| `~/Documents/Projetos/padel_app/levelup.zip` | — | — | — | — | archive containing the two `levelup_backend` state files |

Neither legacy directory is a git repository, so nothing was ever pushed; the risk is local disk
(iCloud-synced `~/Documents`) and Time Machine, not GitHub. **Everything below assumes runbook 2
ran first**, so the passwords inside these files are already dead.

### Confirming nothing depends on the old state
1. The monorepo's `backend.tf` points at GCS; the legacy dir has no `backend` block (implicit
   local). No script, workflow or doc in `levapp` references the legacy path (`backend/README.md`
   says "don't use it again").
2. The live state's 14 resources include every legacy resource that still exists in GCP; the two
   legacy-only entries (`allow-postgres`, `public_all`) were removed from GCP by hand and dropped
   from state in #189.
3. The `olds` lineage names `padel-app-*` resources. If `gcloud` still lists them, they are
   orphaned infrastructure (possibly billed) with no state anywhere — an owner decision to delete
   them by hand, never by applying the old config.

### The "terraform plan wants to REPLACE the VM" trap, and how the runbook makes it impossible
The trap was **planning the monorepo config against the legacy state**: the startup script embeds
the password, any difference forces replacement of `google_compute_instance.levelup`, and the
Postgres data is on that instance's boot disk. #189 closed it with `prevent_destroy = true` and
`ignore_changes = [metadata_startup_script, metadata, boot_disk[0].initialize_params[0].image]`
in the live config. Four rules keep it closed:
- **Only `backend/terraform` in the monorepo is ever initialised** — the legacy directories are
  deleted below, so there is no second place to run `terraform` from.
- **Plan to a file, grep it, then apply the file** — `terraform plan -out=tfplan` followed by
  `terraform show -no-color tfplan | grep -E "must be replaced|destroy"`; anything printed means
  stop. `terraform apply tfplan` applies exactly what was reviewed.
- **Never `terraform apply` without a plan file, never `-replace=`/`taint`, never remove the
  `lifecycle` block**; `prevent_destroy` makes a replacement plan *fail*, not merely warn.
- **Credentials:** application-default credentials on this Mac may be the wrong account; run with
  `GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token)` after `gcloud auth login` as
  `admin@levapp.app` (memory note 2026-09-10).

### Commands — paste in order
```bash
# 0. read-only: what is live, what is stale, what may be orphaned
cd ~/Documents/Projetos/padel_app/levapp/backend/terraform
export GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token)     # as admin@levapp.app
terraform init -input=false                                             # GCS backend, no migration
terraform state list                                                    # expect 14 resources
terraform plan -input=false -lock=true -var 'postgres_password=unused' -out=/tmp/tfplan
terraform show -no-color /tmp/tfplan | grep -E "must be replaced|destroy|No changes"   # ONLY "No changes" may print
rm -f /tmp/tfplan
cd ~/Documents/Projetos/padel_app
for f in levelup/levelup_backend/terraform/terraform.tfstate levelup/levelup_backend/terraform/terraform.tfstate.backup olds/padel_app/terraform/terraform.tfstate olds/padel_app/terraform/terraform.tfstate.backup; do
  python3 -c "import json,sys;s=json.load(open('$f'));print('$f', 'serial', s['serial'], 'lineage', s['lineage'])"; done
unzip -l levelup.zip | grep -i tfstate
gcloud compute instances list --project padel-levelup-2026 --format='table(name,zone,status)'           # only levelup-instance expected
gcloud compute firewall-rules list --project padel-levelup-2026 --format='table(name,sourceRanges.list(),allowed[].map().firewall_rule().list())'
gcloud compute addresses list --project padel-levelup-2026 --format='table(name,address,status)'
#    If anything named padel-app-* appears, it is orphaned (no state owns it): decide, then delete it
#    by hand with gcloud — never by running terraform in olds/.

# 1. retire the legacy states (after runbook 2; the files hold the OLD password)
mv levelup/levelup_backend/terraform/terraform.tfstate        levelup/levelup_backend/terraform/RETIRED-2026-09-11.tfstate.DO-NOT-USE   # optional pause
rm -f levelup/levelup_backend/terraform/RETIRED-2026-09-11.tfstate.DO-NOT-USE levelup/levelup_backend/terraform/terraform.tfstate.backup
rm -rf levelup/levelup_backend/terraform/.terraform levelup/levelup_backend/terraform/.terraform.lock.hcl
rm -f olds/padel_app/terraform/terraform.tfstate olds/padel_app/terraform/terraform.tfstate.backup olds/padel_app/terraform/terraform.tfvars
zip -d levelup.zip 'levelup/levelup_backend/terraform/terraform.tfstate' 'levelup/levelup_backend/terraform/terraform.tfstate.backup' '__MACOSX/levelup/levelup_backend/terraform/._terraform.tfstate' '__MACOSX/levelup/levelup_backend/terraform/._terraform.tfstate.backup'
find . -name '*.tfstate*' -not -path '*/node_modules/*'; find . -name 'terraform.tfvars'    # both must print nothing
#    iCloud keeps deleted files recoverable for 30 days (Recently Deleted on icloud.com → delete there too);
#    Time Machine snapshots are not touched — the rotation is what makes those copies harmless.

# 2. leave a tombstone so nobody re-creates the directory's meaning
printf 'Terraform state moved to gs://padel-levelup-2026-tfstate/levapp/prod on 2026-09-10 (PAD-230).\nThis directory is retired. Run Terraform only from levapp/backend/terraform.\n' > levelup/levelup_backend/terraform/RETIRED.md
```

### Decisions for the owner (runbook 3)
- **R3-1** Delete the legacy states after the rotation (default yes), or keep an encrypted copy
  (`zip -e`) in the password manager first.
- **R3-2** If `gcloud` lists `padel-app-*` resources from the `olds` lineage: delete them by hand
  (default yes, after confirming nothing answers on their address).
- **R3-3** Follow-up ticket to delete the stale `backend/scripts/startup.sh` mirror of the
  startup script (no secret in it, but it drifts from `main.tf`) — default yes.

---

## What this needs from the owner (not discoverable from the repo)
- Admin-console and Cloudflare logins (`admin@levapp.app`) — browser steps in runbook 1.
- The current Postgres password, to keep as rollback until step 6 of runbook 2 is green.
- Whether the `issue-bot` container on the VM uses Postgres (its repo `levelup_issue_bot` is not on
  this machine); if it does, it needs the new password too — runbook 2 assumes it does not.
- Confirmation that no mail is ever sent as `@padellevelup.com` before the null-SPF option.
