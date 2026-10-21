# delivery — How changes reach production safely

## What this is

The delivery domain: the checks a change passes on its way from a pull request to production, where
they have behaviour worth specifying.

## What it covers

- `delivery.pr-e2e-subset` — implementing (PAD-511: on every PR into `staging`, run the web
  Playwright specs the change drives, bounded and advisory, with a second look at every red)

- `delivery.staging-data-sync` — implementing (PAD-589: staging restored from the latest nightly
  dump, at most once per dump, never from live prod on push; `reload` / `live` by hand)
- `delivery.production-activity-reset` — implementing (PAD-632: one transaction, dry run by default,
  clears production activity before real use; accounts, classes, enrolments and levels stay)
- `delivery.zero-downtime-deploy` — implementing (PAD-588: one scheduler leader by advisory lock,
  reschedule off the boot path; start-before-stop rollout behind a two-port nginx upstream)

- `delivery.transport-security` — implementing (PAD-643: TLS 1.2+ and HSTS in the tracked nginx
  files, applied by the owner)
- `delivery.api-host` — implementing (PAD-614: the API on `api.levapp.app` with the same paths;
  listed web origins get CORS; the web build's API base is a repository variable, `/api` by default)
- `delivery.repair-diagnostics` — implementing (PAD-641: the manual repair workflow keeps the app
  log tail on the VM and prints counts, exception class names and `query_id`, never log lines or
  query text)
- `delivery.ci-images` — implementing (PAD-653: CI's postgres service containers pull our own GHCR
  copy, refreshed weekly from ECR Public or Docker Hub, never a public registry's anonymous quota)
- `delivery.backend-ci-lanes` — implementing (PAD-654: SQLite in one job; Postgres as two pytest-split
  shards of 60 min each, plus a job that checks the shards run every test exactly once)
- `delivery.android-nightly-lane` — implementing (PAD-710: the nightly Android Maestro suite as
  parallel shards cut by flow name, each under a watchdog that turns a slow flow into a named red)

## Why it's grouped this way

These leaves describe the delivery pipeline, not the product. They sit in their own domain so a
product spec never depends on them and the product domains stay about coaches and students.

## Related groups

- `mobile/` holds the app's build targets (`mobile.release-build-target`); the Android CI lane is
  referenced from `mobile.android-runtime`.
