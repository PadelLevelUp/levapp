---
id: delivery.k8s-manifests
status: implementing
depends_on:
  - delivery.zero-downtime-deploy
  - delivery.worker-role
implements: ../../specs-business/delivery/a-release-never-drops-a-request.business.md
governed_by: [R-027, R-036]
---

# delivery.k8s-manifests

> Linear: PAD-698 (C1 of PAD-686); rules 8–10 PAD-702 (C4); rule 11 PAD-703 (C5). Drafted 2026-10-22 by la-2110-SessionF (wave 17). Design
> reviewed by the architecture session 2026-10-22 (`docs/plans/2026-10-22-pad-698-design.md`,
> local; the review's appendix is on PAD-698). Nothing here is applied anywhere: the first apply is
> PAD-705's staging cluster, through PAD-703's workflow.

### Intent
The GKE Autopilot target is described in the repository, in Kustomize, so that moving production is
the execution of a rehearsed workflow and not hand work. If it is not in a manifest or a workflow,
it does not exist.

### Surfaces
- `infra/k8s/base/` (workloads, Services, ServiceAccount, Gateway, HTTPRoutes, policies),
  `infra/k8s/jobs/` (the migrate Job), `infra/k8s/overlays/{staging,prod}/` (+ `migrate/`).
- Config and secrets (PAD-702): `infra/k8s/overlays/<env>/config/` (a Component),
  `overlays/<env>/sources.txt`, `infra/k8s/unset-keys.txt`, `infra/k8s/write-config.sh`.
- The deploy (PAD-703): `.github/workflows/deploy-gke.yaml` (dispatch) and `_deploy-gke.yaml`
  (reusable), `infra/k8s/render.sh`, `migrate-job.sh`, `smoke.sh`; `deploy-staging.yaml` also
  pushes `:<sha>`.
- `.github/workflows/k8s-lint.yaml`; `frontend/apps/admin/nginx.conf` (URL-token refusal, rule 3).
- Web, mobile: no change.

### Rules

1. **Workloads.** One backend image, three Deployments, each with `args` and never `command`, so
   the image's entrypoint runs the schema boot gate (zero-downtime-deploy rule 10):
   - `api`: gunicorn as in the Dockerfile (`sh -c exec gunicorn …`, with `--threads` from
     `GUNICORN_THREADS`, default 64, so the PAD-689 stream cap keeps its threads), `ROLE=api`;
   - `events`: the same, `ROLE=events`. Only `/api/app/events` is routed to it, until PAD-697;
   - `worker`: `python -m padel_app.worker` (`delivery.worker-role`).

   All three set `WORKER_SPLIT=on` and `SSE_BROKER=postgres`: on GKE the split is the only mode.
   They take their environment from the ConfigMap `levapp-config` and the Secret
   `levapp-secrets` (PAD-702) and run as the ServiceAccount `levapp-backend` (Workload Identity:
   PAD-701). `web` and `admin` run the existing nginx images.
   - Rollouts: api, events, web and admin use RollingUpdate with `maxSurge 1, maxUnavailable 0`,
     the overlap the VM's rolling deploy already proves safe; the worker uses Recreate (one
     leader).
   - Every replica count is 1; replicas 2, the PDB and the HPA wait for B8 (PAD-704).
   - The worker's leaderless window on a deploy is longer than the VM's ~5 s: pod termination,
     then create_app and the schema gate in the new pod. Reminders (300 s grace) fire late,
     not missed.
2. **Probes** (zero-downtime-deploy rule 11, worker-role rule 2):
   - api and events: startup `healthz` every 5 s × 60, readiness `healthz` every 10 s × 3,
     liveness `livez` every 20 s × 3; `preStop: sleep 10`, so the load balancer drops the
     endpoint before the process stops listening (B-663, B-664);
   - worker: startup and liveness `/livez` on 8081, no readiness; grace 90 s (jobs finish on
     SIGTERM);
   - web and admin: `GET /`.
3. **Gateway.** One `gke-l7-global-external-managed` Gateway per environment.
   - Certificates come from Certificate Manager through the `networking.gke.io/certmap`
     annotation (`levapp-<env>`), and the address is a `NamedAddress` (`levapp-<env>-gateway`);
     both are created by Terraform in PAD-706. The Gateway controller does not read
     `ManagedCertificate`.
   - One HTTPRoute per host mirrors its VM vhost. App host: `/api/app/events` → events, `/api/`
     → api, `/register/` → web with `Referrer-Policy: no-referrer`, `/` → web. API host:
     `/api/app/events` → events and `/api/` → api only; anything else is unmatched, which is a
     404. Admin host: `/admin/api/` → api, `/` → admin.
   - Prod also routes `padellevelup.com` and `www`: `/api/app/events` → events, `/api/` → api,
     `/.well-known/` → web, and everything else a 301 to `levapp.app` keeping the path. Browsers
     on the old domain still call its `/api/`.
   - **Every host that serves `/api/` routes `/api/app/events` to events.**
   - Every HTTPS rule sets HSTS. Plain HTTP on every host is a 301 to HTTPS.
   - `GCPBackendPolicy`: events `timeoutSec: 3600` with 60 s draining; api 60 s with 30 s
     draining.
   - `HealthCheckPolicy`: `healthz` for api and events, `/` for web and admin.
   - The admin console's "a URL carrying `token`/`t`/`access_token` is a 404" (auth.login rule
     4a) is enforced by the admin image's own nginx, because the Gateway cannot answer 404 from a
     route.
4. **No request log holds a token.** The load balancer records the full URL and cannot drop it,
   and tokens travel in query strings. So load-balancer logging is off on every backend:
   - the API's request log is gunicorn's access log, with path (`%(U)s`, no query), method,
     status, duration and user agent; no referer, no client address;
   - web and admin keep their nginx `redacted` format.

   The load balancer's own 5xx and unmatched 404s then exist only as metrics
   (`request_count` by response class and backend), which PAD-703's smoke and any alert read.
5. **The migrate Job is its own kustomization** (`overlays/<env>/migrate/` over `infra/k8s/jobs/`):
   a Job's template is immutable, so `apply -k` of the overlay would fail at the next image tag.
   - Shape: `args: [/app/scripts/migrate.sh]`, `backoffLimit: 0`, `restartPolicy: Never`,
     `activeDeadlineSeconds: 1800` (`MIGRATE_LOCK_TIMEOUT` 1500 + 300: the lock wait plus the
     migration), `ttlSecondsAfterFinished: 86400`.
   - The workflow (PAD-703) waits for an active Job to finish (bounded) before deleting it, so a
     slow backfill (PAD-718) never dies under the next deploy. It then applies, waits for
     `complete`, and applies the overlay.
6. **No project identifier is tracked** (R-036). The image registry (`REGISTRY/…`), the image tag
   and the Workload Identity annotation (`GSA_BACKEND`) are placeholders that PAD-703's workflow
   sets from GitHub variables.
7. **CI.** `k8s-lint.yaml` runs on every PR and push to staging and main:
   - it renders both overlays and both migrate kustomizations;
   - it validates them with `kubeconform -strict` against Kubernetes 1.30 and the CRD catalog
     pinned to a commit (Gateway API, `networking.gke.io`); a resource with no schema fails;
   - it runs `infra/k8s/tests` (outside the backend package: pytest and PyYAML are all it needs).

   The server-side dry-run needs a GKE cluster (`kind` lacks the GKE CRDs): PAD-705.
8. **Config: one source per environment.** (PAD-702.) The ConfigMap `levapp-config` is generated
   from the same `backend/.env.<env>` the VM deploy reads, followed by `vars.env`, which the deploy
   writes from GitHub variables (gitignored; the lint job writes an empty one).
   - Kustomize reads a file outside the kustomization root only with
     `--load-restrictor LoadRestrictionsNone`; the lint job, the tests and the deploy pass it.
   - The generator sits in a Component (`overlays/<env>/config/`) included by both the overlay and
     its `migrate/` kustomization. Both builds produce the same hashed name, so the Job, which is
     applied first, points at the ConfigMap the Deployments use; a change rolls the pods.
   - GKE-only values are set in the Deployment `env`, which wins over `envFrom`. The allowed
     overrides of a template key are `WORKER_SPLIT`, `SSE_BROKER`, `AUTH_RATE_LIMIT_STORE` and
     `POSTGRES_HOST`. On GKE `AUTH_RATE_LIMIT_STORE=database`: one rate budget across pods
     (auth.login rule 7).
9. **Secrets: GitHub is the source; the repository holds only names.**
   - `overlays/<env>/sources.txt` lists every key that is not in the template:
     `KEY class source`, with class `secret`, `var` or `context` (`WORK_GITHUB_REPO` ←
     `github.repository`). The source is the GitHub name, which differs from the key on staging.
   - It equals that environment's VM deploy `-e` lines, except `POSTGRES_PW`. The cluster's
     Postgres gets its own password per environment, `GKE_<ENV>_POSTGRES_PW`, which the owner
     creates once by piping a generated value into `gh secret set --env <env>` (never shown,
     typed or pasted into chat).
   - **Prod reads the same `JWT_SECRET_KEY` and `FLASK_SECRET_KEY` as the VM**, or every user
     would be signed out at the cutover.
   - `GCS_UPLOADS_BUCKET` is a GitHub secret in prod and a template key on staging: today's
     asymmetry, kept.
   - The workflow never interpolates `${{ secrets.X }}` into a script: secrets reach the step
     through `env:`.
   - `write-config.sh <env> <dir>` writes one 0600 file per secret in a 0700 directory, one file
     per key because a value may span lines (a PEM key). `kubectl create secret generic
     levapp-secrets --from-file=<dir> --dry-run=client -o yaml | kubectl apply -f -` gives one
     stable name.
   - The script writes the variables into `vars.env` and prints `secrets-sha256 <hex>`. The
     workflow sets that hash as the pod-template annotation `levapp.app/secrets-sha256`, so a
     changed secret rolls the pods.
   - An empty secret fails, naming the key; a variable with a newline fails; no value is ever
     printed.
   - Not done: Secret Manager with the CSI driver (one more component for two environments and
     one deployer; GitHub stays the source either way). Revisit for rotation without a deploy, or
     a second deployer.
10. **Every key the backend reads is accounted for.** An AST scan of `backend/padel_app` and
   `app.py` (outside tests) collects the keys passed to `os.getenv`, `os.environ.get`,
   `env.get`, `os.environ[...]` and config.py's `read()`. Each must be in at least one of:
   - the template;
   - `sources.txt`;
   - a Deployment's `env`;
   - `infra/k8s/unset-keys.txt`, with one class and a reason: `test`, `image` (the Dockerfile
     sets it), `default` (the code's default is what runs, written next to it), `off` (unset on
     purpose; the feature is off) or `template-unread`.

   Every `unset-keys.txt` line is a key the code reads (or, for `template-unread`, one it
   doesn't), so no stale entries.
11. **The deploy workflow.** (PAD-703.) `deploy-gke.yaml` is dispatched by hand, with `environment`
   and `image_tag` (default: the commit). Pushes to staging join in PAD-705 and main in PAD-708.
   It calls `_deploy-gke.yaml`, which runs as the GitHub Environment of the same name with
   Workload Identity Federation (no key file). Every identifier comes from a GitHub variable.
   Concurrency per environment, never cancelled in progress. In order:
   1. `image_tag` must be on the environment's branch (`main` for prod, `staging` for staging),
      or the run stops: once staging pushes `:<sha>`, an unmerged commit's image exists too;
   2. the three images must exist at that tag, checked after a Docker Hub login; nothing is
      built here;
   3. the namespace and the pull Secret `levapp-registry` (from the Docker Hub secrets) are
      applied. Every ServiceAccount (`levapp-backend`, `levapp-web`) lists it in
      `imagePullSecrets`, whether the repositories are private or public (the anonymous cap);
   4. `write-config.sh`, in **one step per environment**, each with a plain `env:` block equal
      to that environment's `sources.txt`. There is never an `a && b || c` fall-through: an
      empty prod secret must fail by name, not take staging's. Then the Secret, and the
      checksum;
   5. `render.sh` fills the placeholders (registry, tag, GSA, checksum), refuses an empty or
      malformed value, and fails if any placeholder is left;
   6. `migrate-job.sh` waits for a running Job (never deleting it while active), deletes and
      applies, and polls for `Complete` **or `Failed`** (fails fast; `kubectl wait` would sit
      until its timeout on a failed Job). It always prints the Job's log. Nothing else is applied
      unless it completed;
   7. apply, then `rollout status` for the five Deployments. On a failed rollout the old pods
      keep serving (`maxUnavailable 0`);
   8. `smoke.sh` through the public hostnames. Always: healthz, livez, the web root, the AASA
      content type, HTTP→HTTPS. On staging, with the smoke user (owner-made, staging-only, no
      real data): sign-in, `/api/auth/me`, the calendar, its signed avatar URL, and SSE held
      60 s. The load balancer's 5xx come from Cloud Monitoring, not logs (rule 4).

   A rollback is the same workflow with the previous tag: the database is then ahead of the
   image, the migrate Job does nothing, and readiness answers `schema_ahead` (zero-downtime-deploy
   rules 9–11). There is no `flask db check` refusal; the drift gate stays in CI. `dry_run`
   renders, checks and diffs only.

### Acceptance Criteria

#### The backend runs through its entrypoint in three roles (rule 1)
- **Given** either overlay rendered **Then** api, events and worker have no `command`, `ROLE` is
  api/events/worker, `WORKER_SPLIT=on`, `SSE_BROKER=postgres`, and the worker's args are
  `python -m padel_app.worker`

#### Rollouts overlap except the worker (rule 1)
- **Given** either overlay **Then** api, events, web and admin are RollingUpdate 1/0, the worker
  is Recreate, and every replica count is 1

#### The probe matrix (rule 2)
- **Given** either overlay **Then** api and events have startup healthz 5×60, readiness healthz
  10×3, liveness livez 20×3 and `preStop sleep 10`; the worker has liveness `/livez` 20×3 on its
  `livez` port (8081) and no readiness

#### Each host routes like its VM vhost (rule 3)
- **Given** staging **Then** `staging.levapp.app` routes events/api/register/web,
  `api.staging.levapp.app` routes only events and api, and `admin.staging.levapp.app` routes
  `/admin/api/` and the console
- **Given** prod **Then** the same for `levapp.app` + `www`, `api.levapp.app` and
  `admin.levapp.app`, and `padellevelup.com` + `www` route events, api and `/.well-known/` and
  301 the rest to `levapp.app`

#### Streams never get the API's timeout (rule 3)
- **Given** any HTTPRoute with an `/api/` rule **Then** it has an `/api/app/events` rule to events,
  whose backend policy says `timeoutSec: 3600`
- **Given** a mutant that drops the api host's events rule **Then** this criterion fails

#### HSTS and the HTTP redirect (rule 3)
- **Given** either overlay **Then** every HTTPS rule with a backend sets
  `Strict-Transport-Security: max-age=31536000`, `/register/` also sets
  `Referrer-Policy: no-referrer`, and the HTTP route redirects exactly the HTTPS hosts to https
  with 301

#### Certificates and address from Terraform (rule 3)
- **Given** either overlay **Then** the Gateway's certmap is `levapp-<env>`, its address is the
  `NamedAddress` `levapp-<env>-gateway`, and no `ManagedCertificate` is rendered

#### No load-balancer log, no query in the API log (rule 4)
- **Given** either overlay **Then** every Service has a `GCPBackendPolicy` with logging off, and
  the API's and events' access-log format has `%(U)s` and none of `%(q)s %(r)s %(f)s %(h)s`

#### The migrate Job (rule 5)
- **Given** `overlays/<env>/migrate` rendered **Then** it is exactly one Job in the environment's
  namespace with `args: [/app/scripts/migrate.sh]`, backoffLimit 0, activeDeadlineSeconds 1800,
  ttl 86400; and no overlay's main render contains a Job

#### No identifiers (rule 6)
- **Given** every render **Then** no service-account email, Artifact Registry host, `gcr.io`,
  `projects/` path or zone appears, and the Workload Identity annotation is the placeholder

#### The lint job (rule 7)
- **Given** `k8s-lint.yaml` **Then** it renders the four kustomizations, runs kubeconform `-strict`
  without `-ignore-missing-schemas` against a commit-pinned CRD catalog, and runs the spec tests;
  a field unknown to a schema, or a kind with no schema, fails the job

#### One ConfigMap name for the Job and the Deployments (rule 8)
- **Given** an environment's overlay and its `migrate/` rendered separately **Then** each has one
  `levapp-config-<hash>` with the same name, and the Job's and the Deployments' `configMapRef`
  name it; its keys are exactly the template's (with an empty `vars.env`), and no secret key

#### Sources follow the VM deploy (rule 9)
- **Given** `sources.txt` and the deploy workflow's `-e` lines **Then** they match key, class and
  source, except `POSTGRES_PW` ← `GKE_<ENV>_POSTGRES_PW`; prod's signing keys are the VM's

#### write-config.sh (rule 9)
- **Given** every source set, with a multi-line `VAPID_PRIVATE_KEY` **Then** one 0600 file per
  secret in a 0700 directory, the PEM intact, variables in `vars.env` and no secret there, one
  `secrets-sha256` line and no value printed
- **Given** two runs with the same secrets **Then** the same hash; a rotated secret changes it;
  a changed variable does not
- **Given** `JWT_SECRET_KEY` and `MAIL_PASSWORD` empty **Then** exit 1, naming both

#### The key guard (rule 10)
- **Given** the backend's code **Then** every key it reads is in the template, `sources.txt`, a
  Deployment's `env` or `unset-keys.txt`, for each environment
- **Given** a mutant `os.getenv("PAD702_MUTANT_KEY")` in config.py **Then** the guard fails for
  both environments

#### The deploy's guards (rule 11)
- **Given** `_deploy-gke.yaml` **Then** after checkout the first step checks the tag is on the
  environment's branch; the Docker Hub login comes before the image check; migrate comes before
  apply, and apply before smoke. Each environment's write-config `env:` equals its `sources.txt`,
  with no `||` or `&&`, and no `run:` contains `${{ secrets.`

#### Every pod pulls with credentials (rule 11)
- **Given** either environment's renders **Then** every Deployment's and the Job's
  ServiceAccount lists `levapp-registry` in `imagePullSecrets`

#### The migrate Job's outcome (rule 11)
- **Given** a stub cluster **When** the Job completes **Then** exit 0 with its log; **when** it
  fails **Then** exit 1 at the first poll, with its log; **when** an earlier Job is still active
  **Then** it is waited for, and deleted only once inactive, or left alone and exit 1 after the
  bound

#### render.sh fills or refuses (rule 11)
- **Given** registry, tag, GSA and checksum **Then** every image, the Workload Identity annotation
  and the checksum annotation carry them; **given** one missing or with a `|` in it **Then**
  exit 1, nothing printed

### Notes
- Autopilot rounds requests to its minimums and CPU:memory ratio; the tests read the rendered
  values, not what Autopilot will bill.
- The legacy domain can become a Cloudflare redirect once its API count is zero for some weeks
  after the cutover (decision for then, on PAD-698).
