"""PAD-739: the nginx log-redaction lane pulls our GHCR copy of nginx, not ECR Public.

Its tarball cache (PAD-598) hit most runs, but each miss pulled anonymously from public.ecr.aws and
failed on the per-IP limit other tenants of GitHub's runner addresses use up ("toomanyrequests: Data
limit exceeded", four times on 2026-10-22). mirror-ci-images.yaml now copies nginx:1.27 beside
postgres:15, and the lane pulls it with the run's GITHUB_TOKEN; until the package exists it falls
back to the old anonymous pull. Covers delivery.ci-images rules 1 and 5.
"""
import pathlib

import yaml

WORKFLOWS = pathlib.Path(__file__).resolve().parents[3] / ".github" / "workflows"
MIRROR = "ghcr.io/padellevelup/ci-nginx:1.27"
FALLBACK = "public.ecr.aws/docker/library/nginx:1.27"


def _load(name):
    return yaml.safe_load((WORKFLOWS / name).read_text())


def _lane():
    return _load("nginx-log-redaction.yaml")["jobs"]["redaction"]


def _step(job, name):
    return next(s for s in job["steps"] if s.get("name") == name)


def test_the_mirror_copies_nginx_beside_postgres():
    job = _load("mirror-ci-images.yaml")["jobs"]["mirror"]
    pairs = {(e["image"], e["dest"]) for e in job["strategy"]["matrix"]["include"]}
    assert pairs == {("postgres:15", "ghcr.io/padellevelup/ci-postgres:15"), ("nginx:1.27", MIRROR)}
    assert job["strategy"]["fail-fast"] is False, "one image's failed copy must not cancel the other"
    copy = _step(job, "Copy the image")["run"]
    assert '"public.ecr.aws/docker/library/$IMAGE" "docker.io/library/$IMAGE"' in copy


def test_the_lane_pulls_the_mirror_with_the_run_token():
    job = _lane()
    assert job["env"]["NGINX_IMAGE"] == MIRROR
    login = _step(job, "Log in to GHCR")
    assert login["uses"].startswith("docker/login-action@")
    assert login["with"] == {"registry": "ghcr.io", "username": "${{ github.actor }}",
                             "password": "${{ secrets.GITHUB_TOKEN }}"}
    assert login["if"] == "steps.nginx-image.outputs.cache-hit != 'true'"


def test_the_lane_falls_back_to_the_public_image_under_the_mirror_name():
    job = _lane()
    assert job["env"]["NGINX_FALLBACK"] == FALLBACK
    load = _step(job, "Load the cached nginx image, or pull it once")["run"]
    assert 'if ! docker pull "$NGINX_IMAGE"; then' in load
    assert 'docker tag "$NGINX_FALLBACK" "$NGINX_IMAGE"' in load
    assert 'docker save -o /tmp/nginx-image.tar "$NGINX_IMAGE"' in load


def test_both_checks_run_the_one_image():
    job = _lane()
    web = _step(job, "Web image nginx (frontend/apps/web/nginx.conf)")
    assert web["env"]["NGINX_WEB_IMAGE"] == "${{ env.NGINX_IMAGE }}"


def test_the_lane_adds_no_secret_and_no_permissions_block():
    doc = _load("nginx-log-redaction.yaml")
    text = (WORKFLOWS / "nginx-log-redaction.yaml").read_text()
    secrets = {line.split("secrets.")[1].split("}")[0].strip() for line in text.splitlines() if "secrets." in line}
    assert secrets == {"GITHUB_TOKEN"}
    assert "permissions" not in doc and "permissions" not in _lane()
