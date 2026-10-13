"""PAD-653: every CI postgres service container pulls our GHCR mirror, never a public registry.

Anonymous pulls from public.ecr.aws (PAD-598) hit a per-IP data limit shared with other tenants of
GitHub's runner addresses ("toomanyrequests: Data limit exceeded" at Initialize containers, run
38414093935). mirror-ci-images.yaml copies postgres:15 into ghcr.io/padellevelup/ci-postgres:15
and every workflow's service container pulls it with the run's GITHUB_TOKEN.

Read as YAML, like the other workflow guards: a new workflow that adds a postgres service from a
public registry, or without credentials, or behind a `permissions:` block with no `packages: read`,
turns this red. Covers delivery.ci-images rule 4 and "No CI database pulls from a public registry".
"""
import pathlib

import pytest
import yaml

WORKFLOWS = pathlib.Path(__file__).resolve().parents[3] / ".github" / "workflows"
MIRROR = "ghcr.io/padellevelup/ci-postgres:15"


def _workflows():
    return sorted([*WORKFLOWS.glob("*.yaml"), *WORKFLOWS.glob("*.yml")])


def _postgres_services():
    found = []
    for path in _workflows():
        doc = yaml.safe_load(path.read_text())
        for job_id, job in (doc.get("jobs") or {}).items():
            for name, service in (job.get("services") or {}).items():
                image = service.get("image", "") if isinstance(service, dict) else str(service)
                if "postgres" in name or "postgres" in image:
                    found.append((path.name, job_id, doc, job, service))
    return found


def test_the_guard_sees_the_service_containers():
    assert len(_postgres_services()) >= 6, "fewer postgres services than the six workflows that run one"


@pytest.mark.parametrize("workflow,job_id,doc,job,service", _postgres_services(), ids=lambda v: v if isinstance(v, str) else "")
def test_every_postgres_service_pulls_the_mirror_with_credentials(workflow, job_id, doc, job, service):
    assert service.get("image") == MIRROR, f"{workflow}:{job_id} pulls {service.get('image')!r}"
    creds = service.get("credentials") or {}
    assert creds.get("username") == "${{ github.actor }}", f"{workflow}:{job_id} has no credentials username"
    assert creds.get("password") == "${{ secrets.GITHUB_TOKEN }}", f"{workflow}:{job_id} has no GITHUB_TOKEN password"
    # An explicit permissions block drops every scope it does not name, packages included.
    for scope in (job.get("permissions"), doc.get("permissions")):
        if isinstance(scope, dict):
            assert scope.get("packages") in ("read", "write"), f"{workflow}:{job_id} cannot read packages"
            break


def test_no_workflow_names_a_public_postgres_image_as_a_service():
    for workflow, job_id, _doc, _job, service in _postgres_services():
        image = service.get("image", "")
        assert "public.ecr.aws" not in image and "docker.io" not in image, f"{workflow}:{job_id}: {image}"
