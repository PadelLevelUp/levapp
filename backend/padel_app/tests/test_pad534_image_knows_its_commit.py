"""PAD-534 (admin.engine-health rule 4): every backend image is built with the commit it came
from, so the admin API can say what each environment runs. A shape guard over the Dockerfile and
both deploy workflows: removing the build argument from either, or the ARG/ENV pair, turns it red."""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[3]


def test_the_backend_image_carries_git_sha():
    dockerfile = (ROOT / "backend" / "Dockerfile").read_text()
    runtime = dockerfile.split("FROM python:3.10-slim\n", 1)[1]  # the runtime stage, not the builder
    assert re.search(r"^ARG GIT_SHA=unknown$", runtime, re.M), "the runtime stage declares GIT_SHA"
    assert re.search(r"^ENV GIT_SHA=\$GIT_SHA$", runtime, re.M), "and exposes it to the app"


def test_both_deploys_pass_the_commit():
    for name in ("deploy-prod.yaml", "deploy-staging.yaml"):
        workflow = (ROOT / ".github" / "workflows" / name).read_text()
        backend_build = workflow.split("context: backend", 1)[1].split("- name:", 1)[0]
        assert "GIT_SHA=${{ github.sha }}" in backend_build, f"{name}: the backend build passes GIT_SHA"
