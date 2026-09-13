---
id: decision.2026-09-13-prod-rollback-procedure
title: "Rolling production back: what is possible, what is not, and the honest procedure (PAD-338)"
date: 2026-09-13T02:40:00Z
compass_rules: []
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
something is wrong, what is the way back" turned out to have no written answer.

**Read the limitation first: after a migration has applied, there is no rollback.** There is a
recovery, and it needs a restore. Everything below is arranged around that fact rather than
around a procedure we would like to have.

## What changed in this ticket

- **Every build is pushed twice**: `:latest` and `:<commit sha>`. Before this, only `:latest`
  existed, so there was no image to name in a rollback — the way back was a revert plus a full
  rebuild, ten to fifteen minutes with CI green.
- **The deploy keeps the last three images** instead of `docker image prune -f` on success. The
  prune deleted the image that had just been replaced, which is precisely the rollback target.
  It covered the case where a deploy crashes loudly (the prune never runs) and not the case
  where a deploy succeeds and the result is wrong — the one that actually happens. *A rollback
  path that only works when the failure is loud is not a rollback path.*
- Nothing else in the deploy changed. Every added line runs on a path nobody is watching.

## The three cases, in the order you will meet them

### 1. The deploy failed and production is down (loud)
The container crash-loops, the workflow fails at the "did not finish its migrations" wait loop
and prints the log. The previous image is still on the VM, because the retention step never ran.

```bash
# on the VM, as admin@levapp.app
docker ps -a --filter name=padelapp
docker images <dockerhub-user>/levelup_backend            # pick the previous sha tag
docker stop padelapp && docker rm padelapp
docker run -d --name padelapp -p 127.0.0.1:5000:80 --restart unless-stopped \
  --network levelup_net --env-file ~/.env.prod \
  -e POSTGRES_PW=… -e FLASK_SECRET_KEY=… -e JWT_SECRET_KEY=… -e MAIL_PASSWORD=… \
  <dockerhub-user>/levelup_backend:<previous-sha>
docker logs -f padelapp                                    # expect "Starting app..."
```

**The trap:** the old image runs `flask db upgrade` at start too. If the failed deploy applied
some migrations before failing, the schema is ahead of this code, and the old container will
either fail differently or serve against columns it does not know. Read the log before trusting
it. If the schema moved, this is case 3.

### 2. The deploy succeeded and the result is wrong (quiet)
Nothing is crash-looping; the behaviour is bad. If **no migration applied** in that deploy
(compare `flask db current` against the previous release's head), the previous image is still on
the VM under its commit tag and the commands above are the whole procedure — about a minute.

If a migration did apply, go to case 3. Do not start old code against a new schema and hope.

### 3. A migration applied and must be undone
**This is the case with no rollback.** Options, worst-case first:

- **Restore the database** from the nightly dump, then start the previous image by its commit
  tag. This is the only path that returns both halves to a known state. It costs whatever the
  restore costs and loses everything written since the dump.
- **Alembic downgrade** — every migration in the tree has one, and none has been rehearsed
  against production. A chain of 21 downgrades is not a procedure, it is an experiment. Consider
  it only for a single recent revision whose downgrade you have just read.
- **Fix forward**, which is usually right for a data problem and never right for a schema one
  that is actively breaking requests.

## What this depends on, and does not provide

The restore in case 3 depends on the nightly backup (R-028, B-080), which was a silent no-op for
months and is fixed but **not yet proven** — the first real run and `backup.sh restore-check` are
an owner step. Until that has happened, case 3 has no recovery at all, only a smaller or larger
loss. That is the reason the promotion evidence pack recommends proving the backup before
promoting, and it is a stronger reason than any of the code risks.

Not addressed here, and a separate follow-up: nobody has measured how long the migration window
actually takes against a production-sized database. The deploy stops the old container before
starting the new one, so that window is a full outage of unknown length. Measuring it needs a
production-sized copy, which needs the owner's `gcloud auth login`.
