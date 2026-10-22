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

> Linear: PAD-698 (C1 of PAD-686). Drafted 2026-10-22 by la-2110-SessionF (wave 17). Design
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
- `.github/workflows/k8s-lint.yaml`; `frontend/apps/admin/nginx.conf` (URL-token refusal, rule 3).
- Web, mobile: no change.

### Rules

1. **Workloads.** One backend image, three Deployments, each with `args` and never `command`, so
   the image's entrypoint runs the schema boot gate (zero-downtime-deploy rule 10):
   - `api`: gunicorn as in the Dockerfile, `ROLE=api`;
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

### Notes
- Autopilot rounds requests to its minimums and CPU:memory ratio; the tests read the rendered
  values, not what Autopilot will bill.
- The legacy domain can become a Cloudflare redirect once its API count is zero for some weeks
  after the cutover (decision for then, on PAD-698).
