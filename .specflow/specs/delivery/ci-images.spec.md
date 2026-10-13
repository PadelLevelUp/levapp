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
and up to an hour, and the deploy workflows run the same service container.

### Entities
- **GHCR package** `ghcr.io/padellevelup/ci-postgres:15`: our copy of the official `postgres:15`
  image, all architectures.

### Rules
1. `mirror-ci-images.yaml` copies `postgres:15` into the package, registry to registry (no pull to
   the runner), with the run's `GITHUB_TOKEN` (`packages: write`). It tries ECR Public
   (`public.ecr.aws/docker/library/postgres:15`) first, then Docker Hub, in up to three rounds.
2. It runs weekly, by hand, and on a push to `staging` that changes the workflow file. That way
   the merge that adds or edits it publishes the package before any workflow pulls it.
3. A run that cannot copy fails with an error naming both sources and changes nothing. The package
   keeps the last good image, so CI is unaffected by an outage at either source.
4. Every workflow's postgres service container pulls the package, never a public registry, with
   `credentials` from the run's `GITHUB_TOKEN`. A workflow with a `permissions:` block grants
   `packages: read`. Guarded by `test_pad653_ci_images_mirror.py`.

### Acceptance Criteria

#### The mirror publishes the image
- **Given** the mirror workflow on `staging`
- **When** it runs
- **Then** `ghcr.io/padellevelup/ci-postgres:15` exists, and `imagetools inspect` lists the same
  platforms as the source

#### A failed copy leaves the last good image
- **Given** a package that already holds an image
- **When** a mirror run can copy from neither source
- **Then** the run fails with "could not copy postgres:15 from ECR Public or Docker Hub", and the
  package still serves the previous image

#### No CI database pulls from a public registry
- **Given** every workflow under `.github/workflows/`
- **When** it declares a postgres service container
- **Then** the image is `ghcr.io/padellevelup/ci-postgres:15`, with `credentials`, and no workflow
  names `public.ecr.aws/docker/library/postgres` or `docker.io/library/postgres` as a service image

### Notes
- PAD-598 moved CI from Docker Hub (per-IP pull quota) to anonymous ECR Public. That source then
  hit its own per-IP data limit, "toomanyrequests: Data limit exceeded" at "Initialize containers"
  (run 38414093935, 2026-10-13).
- Rejected: authenticated ECR Public (needs an AWS account and an OIDC role), and caching the
  image tarball (service containers start before any step, so a loaded image cannot serve them).
- The nginx log-redaction lane caches its own image (PAD-598) and is out of scope.
