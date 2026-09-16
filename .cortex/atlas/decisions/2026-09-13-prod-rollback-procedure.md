---
id: decision.2026-09-13-prod-rollback-procedure
title: "Rolling production back: the one command, what it honestly does not cover, and the procedure (PAD-338)"
date: 2026-09-13T02:40:00Z
compass_rules:
  - R-035
related_specs: []
supersedes: []
sources:
  - ../../../.github/workflows/deploy-prod.yaml
  - ../../../backend/scripts/entrypoint.sh
  - ../../../backend/Dockerfile
  - ../../../backend/scripts/backup.sh
---

# Rolling production back (PAD-338)

Written while building the promotion evidence pack, when the question "if we promote and
something is wrong, what is the way back" turned out to have no written answer. Revised
2026-09-16 after a fresh-eyes review found that the first version's rollback target never
reached the VM (see "What the review found" at the end).

**Read the limitation first: after a migration has applied, there is no rollback.** There is a
recovery, and it needs a restore. Everything below is arranged around that fact rather than
around a procedure we would like to have.

## The one command

A deploy that succeeded and shipped the wrong thing is put back with **one workflow dispatch**:

```bash
gh workflow run deploy-prod.yaml --ref main -f target=both -f rollback_to=<full sha of the previous deploy>
```

`target=backend` or `target=frontend` rolls one side back alone. The auto-mode classifier
refuses a production dispatch to a Claude session, so the owner or the coordinator runs it.

What happens: the workflow checks out that commit (so `.env.prod` is the one it shipped with),
**skips the build**, pulls the image already on Docker Hub under that commit's tag, and runs the
same deploy script with the same secrets as every deploy. Nothing is typed on the VM. Duration
is about four minutes: the drift gate still runs (about two, on `main`'s migrations, which is
harmless and untouched), then the deploy itself, with the same fifteen-second stop-to-ready
window as any deploy (measured, below). A pull that fails, because the sha was never deployed,
stops the job **before** the running container is touched.

**Before running it, answer one question:** did a migration apply between the target commit and
the current one?

```bash
git fetch origin
git diff --stat <rollback_to>..origin/main -- backend/migrations/versions/
```

Empty output: roll back. Anything listed: **do not**, go to case 3 below. This check runs on the
workstation; it touches nothing.

## What it honestly does not cover

1. **A migration that has applied.** The old image runs `flask db upgrade` when it starts
   (`backend/scripts/entrypoint.sh`, `set -e`). Alembic then meets an `alembic_version` it has
   no script for and fails with *Can't locate revision identified by …*; the container exits,
   restarts, and the deploy's wait loop fails the job. By then the current container has already
   been stopped, so **a rollback attempted across a migration takes production down** and leaves
   it down. This is why the `git diff` above comes first. The way back across a migration is
   restore-then-redeploy (case 3).
2. **Data the wrong code wrote.** Rows created or changed while it served stay as they are.
3. **Only commits deployed after this change have a tag to roll back to.** The first deploy
   under it has no earlier sha-tagged image; its way back is the VM-side fallback below.
4. **`:latest` on Docker Hub still names the bad build** until a fix-forward deploys. Nothing in
   the repo pulls `:latest` any more (`repair.yaml` does not touch the images), but a person
   who does gets the wrong one.
5. **GitHub Actions and Docker Hub must be reachable.** If either is down, use the fallback.
6. **The backend and the frontend are separate images**; `target=both` rolls both to the same
   commit. A frontend that must stay on the newer build while the backend goes back is two
   dispatches, and the API contract between them is your problem to check.

## The three cases, in the order you will meet them

### 1. The deploy failed and production is down (loud)
The container crash-loops, the workflow fails at the "did not finish its migrations" wait loop
and prints the log. The previous image is still on the VM under its commit tag, because the
retention step never ran. Read the log first: **if a migration applied before the failure, this
is case 3, and the one command will not start the old image either** (limitation 1). If not,
run the one command.

### 2. The deploy succeeded and the result is wrong (quiet)
Nothing is crash-looping; the behaviour is bad. Run the `git diff` check. Empty: the one
command, about four minutes end to end. Not empty: case 3. Do not start old code against a new
schema and hope — it will not start (limitation 1), and by then the current one is stopped.

### 3. A migration applied and must be undone
**This is the case with no rollback.** Options, worst-case first:

- **Restore the database** from the latest dump, then the one command with the commit that
  matches the dump's `alembic_version`. This is the only path that returns both halves to a
  known state. It loses everything written since the dump; stop the backend first so nothing
  more is written while you decide.
- **Alembic downgrade** — every migration in the tree has one, and none has been rehearsed
  against production. A chain of 21 downgrades is not a procedure, it is an experiment. Consider
  it only for a single recent revision whose downgrade you have just read.
- **Fix forward**, which is usually right for a data problem and never right for a schema one
  that is actively breaking requests.

## Fallback: on the VM, by hand

For when Actions or Docker Hub is unreachable, or for the first deploy under this change. The
secrets the container needs are **not on the VM as files**; they are in the running container's
environment, which `docker inspect` prints. Read them from the container you are replacing
before you remove it.

```bash
# as the deploy user on the VM
docker images <dockerhub-user>/levelup_backend         # every deployed image, by commit tag; the
                                                        # pre-PAD-338 one is the row tagged `latest`
docker inspect padelapp --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/padelapp.env
chmod 600 /tmp/padelapp.env                             # secrets; delete it when done
docker stop padelapp && docker rm padelapp
docker run -d --name padelapp -p 127.0.0.1:5000:80 --restart unless-stopped \
  --network levelup_net --env-file /tmp/padelapp.env \
  <dockerhub-user>/levelup_backend:<previous tag>
docker logs -f padelapp                                 # expect "Starting app..."
rm /tmp/padelapp.env
```

The same limitation 1 applies: this starts the old entrypoint against the current schema.

## What this depends on, and does not provide

The restore in case 3 depends on the nightly backup (R-028, B-080). As of 2026-09-16 the
script and its environment are on the VM, the deploy installs the schedule in its own job
(PAD-353), and two manual dumps exist in the bucket (2026-09-15 17:51 and 2026-09-16 09:44
UTC, the second restored and checked); the first nightly object and its restore check are
tracked on PAD-296 and PAD-354. Until a nightly has been proven, case 3 recovers to the last
manual dump, not to last night.

## The migration window, measured (ticket item 4)

The deploy stops the old container before starting the new one, so the window is a full outage.
Production is small (dump 0.66 MB, 185 users), so it was read from deploy logs rather than
rehearsed on a rig. Times are UTC, from the Actions log lines.

| Deploy | Migrations pending | `docker stop` → "migrations applied" |
|---|---|---|
| staging `80a377091`, run 35087128428, 2026-09-16 | none (head unchanged) | 10:53:39.8 → 10:53:55.2 = **15.3 s** |
| staging `sync-db` restart, same run (prod copy, head unchanged) | none | "starting" 10:55:15.7 → "healthy" 10:55:50.7 = 35.0 s (includes the script's own health wait) |
| production `f34e99ef3`, run 35084056199, promotion of 2026-09-16 | **21**, three of them data backfills | 10:19:41.1 → 10:20:02.1 = **21.0 s** |
| staging `sync-db` restart on a fresh prod copy, run 35002761602, 2026-09-15 | 21 | "starting" 17:45:38.6 → "healthy" 17:46:46.9 = 68.3 s (includes the script's health wait, on the memory-capped staging container) |

So at today's size the 21-migration chain cost about **six seconds** over an empty restart; the
window is dominated by container start, not by migrations, and the honest announcement for a
deploy is "the API is down for about half a minute". The number to watch is the data-backfill
kind: it scales with rows, and 185 users is not a measurement of what it does at 18,500. The
production run's job is the one whose later cron step failed (B-090); its deploy step, which
holds these timestamps, had already succeeded.

What the log cannot show: Alembic's own `Running upgrade` lines are only dumped when the deploy
fails, so a green run gives the whole window and not the per-migration split. If a chain ever
needs that split, run `flask db upgrade` on a restored dump locally and time it there.

## Why this is written as steps rather than a summary

**Analysis missed what enumeration caught**, three times now on this one ticket, by two sessions
independently — which is why it became R-035 on 2026-09-16 (number self-assigned from the
coordinator's reserved range, unconfirmed). The three cases are written as commands someone
can run, in order, including the ones that do not work, because a summary of a procedure reads
as though the procedure exists.

- **The migration-restart trap.** The promotion evidence pack analysed this deploy workflow and
  described the surviving previous image as a rollback mitigation. Writing the recovery *steps*
  forced the sentence "start the previous image", which forced the question "what does that
  image do when it starts" — it runs `flask db upgrade`, so it meets a schema a partly-applied
  chain has already moved. The analysis had produced a confident, wrong summary.
- **The keep-three bug in this ticket's own first version.** Reasoning said "keep the last three
  images". Writing the pipeline out against sample `docker images` output showed one image on
  two rows, so an un-deduplicated keep-three kept two: a rollback depth of one, in the change
  whose whole purpose was rollback depth.
- **The rollback target that never reached the VM** (fresh-eyes review, 2026-09-16, Session A).
  The first version pushed `:latest` and `:<sha>` and said "the previous image is on the VM under
  its commit tag". Enumerating what the VM actually runs — `docker pull …:latest` — showed that
  the sha tag never left Docker Hub; on the VM the previous image lost its only name at the next
  pull, became untagged, was invisible to `docker images <repo>` (so the retention step could not
  see it and disk was no longer bounded either) and could not be named in a rollback. The same
  enumeration found that the `docker run` in the procedure needed secrets that exist only in
  GitHub, not on the VM. Both were fixed by making the deploy itself the rollback path.

## What the review found (2026-09-16), and what changed in the workflow

- The VM now **pulls and runs the commit tag**, never `:latest`. `:latest` is still pushed.
- `workflow_dispatch` gained `rollback_to`; when set, the checkout is that commit, the build is
  skipped, and the deploy pulls the existing image. That is the one command.
- Keep-three retention as before, deduplicated by image id; plus `docker image prune -f` after
  it, which now only removes untagged leftovers because every image the deploy wants is tagged.
- The frontend deploy script gained `set -euo pipefail`, so a failed pull no longer runs on into
  `docker run` with no image while the job reports green.
- **Not run: the workflow itself.** It can only be exercised by deploying to production; the
  first deploy after this merges is its first run. The parts that can be proven off the VM were:
  actionlint clean, every embedded script passes `bash -n`, the retention pipeline against four
  sample inputs (five distinct images, one image on two rows, one image, no images).

## Pending: the rehearsal (coordinator's decision, 2026-09-16)

The rollback path is proven the first time it runs, and that must not be the night it is
needed. **After this change has reached production** through a promotion, on a quiet evening,
the coordinator runs it as a no-op — `rollback_to` set to the commit that is already live:

```bash
git fetch origin && LIVE=$(git rev-parse origin/main)
gh workflow run deploy-prod.yaml --ref main -f target=both -f rollback_to="$LIVE"
```

Expected: the `Build and push image` steps show as skipped, both deploys pull the existing
`:<sha>` images, the wait loop prints "migrations applied", `levapp.app` and
`padellevelup.com` answer 200, and `docker ps` on the VM shows the containers running the
`:<sha>` tags. Outage: the usual stop-to-ready window, about fifteen seconds, with no
migration pending. When it has run, record the run id and the date here and this section
becomes "Rehearsed". Until then the one command above is **written, linted and unrun**.
