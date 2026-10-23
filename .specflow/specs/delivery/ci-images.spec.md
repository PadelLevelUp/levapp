---
id: delivery.ci-images
status: implementing
depends_on: []
implements: ../../specs-business/delivery/owner-sees-breakage-before-release.business.md
governed_by: []
---

# delivery.ci-images

### Intent
CI's database service containers start every time, whatever other tenants of GitHub's shared runner
addresses have used up at a public registry. A test run that fails before a test runs costs a rerun
and up to an hour, and the deploy workflows run the same service container. The nginx log-redaction
lane's image is held to the same standard (PAD-739).

### Entities
- **GHCR package** `ghcr.io/padellevelup/ci-postgres:15`: our copy of the official `postgres:15`
  image, all architectures.
- **GHCR package** `ghcr.io/padellevelup/ci-nginx:1.27`: our copy of the official `nginx:1.27`
  image, all architectures (PAD-739).

### Rules
1. `mirror-ci-images.yaml` copies `postgres:15` and `nginx:1.27` into their packages, registry to
   registry (no pull to the runner), with the run's `GITHUB_TOKEN` (`packages: write`). It tries
   ECR Public (`public.ecr.aws/docker/library/<image>`) first, then Docker Hub, in up to three
   rounds. Each image is its own matrix job, so one image's failed copy never skips the other.
2. It runs weekly, by hand, and on a push to `staging` that changes the workflow file. That way
   the merge that adds or edits it publishes the package before any workflow pulls it.
3. A run that cannot copy fails with an error naming both sources and changes nothing. The package
   keeps the last good image, so CI is unaffected by an outage at either source.
4. Every workflow's postgres service container pulls the package, never a public registry, with
   `credentials` from the run's `GITHUB_TOKEN`. A workflow with a `permissions:` block grants
   `packages: read`. Guarded by `test_pad653_ci_images_mirror.py`.
5. The nginx log-redaction lane (`nginx-log-redaction.yaml`) pulls `ci-nginx:1.27` with the run's
   `GITHUB_TOKEN`, only on a miss of its tarball cache (PAD-598). If that pull fails, it warns and
   pulls `public.ecr.aws/docker/library/nginx:1.27` anonymously, tagged as the package name. That
   covers the window before the mirror first publishes the package: the PR that adds it, and the
   staging push that runs both workflows at once. The workflow adds no secret and no
   `permissions:` block; the default token reads packages. Guarded by
   `test_pad739_nginx_lane_pulls_the_mirror.py`.

### Acceptance Criteria

#### The mirror publishes the image
- **Given** the mirror workflow on `staging`
- **When** it runs
- **Then** `ghcr.io/padellevelup/ci-postgres:15` and `ghcr.io/padellevelup/ci-nginx:1.27` exist,
  and `imagetools inspect` lists the same platforms as each source

#### A failed copy leaves the last good image
- **Given** a package that already holds an image
- **When** a mirror run can copy from neither source
- **Then** that image's job fails with "could not copy <image> from ECR Public or Docker Hub", the
  package still serves the previous image, and the other image's job still copies

#### No CI database pulls from a public registry
- **Given** every workflow under `.github/workflows/`
- **When** it declares a postgres service container
- **Then** the image is `ghcr.io/padellevelup/ci-postgres:15`, with `credentials`, and no workflow
  names `public.ecr.aws/docker/library/postgres` or `docker.io/library/postgres` as a service image

#### The nginx lane pulls the mirror on a cache miss
- **Given** `nginx-log-redaction.yaml` and a runner whose tarball cache misses
- **When** the lane loads its image
- **Then** it logs in to `ghcr.io` with the run's `GITHUB_TOKEN` and pulls
  `ghcr.io/padellevelup/ci-nginx:1.27`, and both checks run that image

#### Before the package exists, the nginx lane falls back
- **Given** the PR that adds `ci-nginx:1.27`, before the mirror has published it
- **When** the GHCR pull fails
- **Then** the step warns "could not pull ghcr.io/padellevelup/ci-nginx:1.27; falling back to
  public.ecr.aws/docker/library/nginx:1.27", pulls that, tags it as the package name, and the
  checks still run

### Notes
- PAD-598 moved CI from Docker Hub (per-IP pull quota) to anonymous ECR Public. That source then
  hit its own per-IP data limit, "toomanyrequests: Data limit exceeded" at "Initialize containers"
  (run 38414093935, 2026-10-13).
- Rejected: authenticated ECR Public (needs an AWS account and an OIDC role), and caching the
  image tarball (service containers start before any step, so a loaded image cannot serve them).
- PAD-739: the nginx log-redaction lane's tarball cache (PAD-598) hit most runs, but every miss
  pulled anonymously from ECR Public. From 2026-10-09 to 10-23 it failed 15 times in 637 runs, every
  time at the image pull and never on a redaction verdict: 9 on Docker Hub before PAD-598, then 6
  on ECR Public ("Rate exceeded" on 10-10 and 10-12, "Data limit exceeded" four times on 10-22).
  Rejected for it: Docker Hub with the deploy account (no new secret, but every PR would draw on the
  deploy account's pull quota), and reusing the deploy image built in the run (the lane runs on
  `pull_request`, where no deploy image is built).
