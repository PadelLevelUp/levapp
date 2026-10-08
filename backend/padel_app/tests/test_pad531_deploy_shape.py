"""PAD-531 admin.foundation rule 12, "The deploy builds and runs the admin image in both
environments": a shape test over the two deploy workflows, the two tracked nginx server blocks
and the console image recipe. Plain text checks, no YAML dependency (the workflow syntax the
checks rely on is literal)."""
import pathlib
import re

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[3]
WORKFLOWS = ROOT / ".github" / "workflows"
NGINX = ROOT / "infra" / "nginx" / "sites-available"

ENVIRONMENTS = {
    "prod": {
        "workflow": "deploy-prod.yaml",
        "image_tag": "levelup_admin:${{ github.sha }}",
        "container": "levelup_admin",
        "admin_port": "3200",
        "backend_port": "5000",
        "nginx": "levapp-admin",
        "host": "admin.levapp.app",
    },
    "staging": {
        "workflow": "deploy-staging.yaml",
        "image_tag": "levelup_admin:staging",
        "container": "levelup_admin_staging",
        "admin_port": "3300",
        "backend_port": "5100",
        "nginx": "levapp-admin-staging",
        "host": "admin.staging.levapp.app",
    },
}


def _job(text, name):
    match = re.search(rf"^  {name}:\n(.*?)(?=^  \w[\w-]*:\n|\Z)", text, re.S | re.M)
    assert match, f"job {name} missing"
    return match.group(1)


@pytest.mark.parametrize("env", sorted(ENVIRONMENTS))
def test_the_deploy_builds_and_runs_the_admin_image(env):
    cfg = ENVIRONMENTS[env]
    text = (WORKFLOWS / cfg["workflow"]).read_text()
    job = _job(text, "admin")
    assert "file: frontend/Dockerfile.admin" in job and "context: frontend" in job
    assert cfg["image_tag"] in job
    assert f"docker run -d --name {cfg['container']}" in job
    assert f"-p 127.0.0.1:{cfg['admin_port']}:80" in job, "published on the loopback interface only"
    assert re.search(r"-p (?!127\.0\.0\.1)", job) is None
    # Nothing waits for the console: a failed admin job never holds the product back.
    for other in ("frontend", "backend", "backup-cron", "sync-db"):
        if re.search(rf"^  {other}:\n", text, re.M):
            assert "admin" not in re.search(r"needs:.*", _job(text, other)).group(0)
    if env == "prod":
        assert "ref: ${{ inputs.rollback_to || github.sha }}" in job
        assert 'TAG="${{ inputs.rollback_to || github.sha }}"' in job
        # A rollback_to that predates the console must not paint the rollback red.
        assert 'if [ -n "${{ inputs.rollback_to }}" ] && ! docker pull' in job
        assert "exit 0" in job.split("docker stop levelup_admin")[0]


@pytest.mark.parametrize("env", sorted(ENVIRONMENTS))
def test_the_tracked_nginx_block_routes_the_admin_host(env):
    cfg = ENVIRONMENTS[env]
    text = (NGINX / cfg["nginx"]).read_text()
    assert f"server_name {cfg['host']};" in text
    api = re.search(r"location /admin/api/ \{(.*?)\}", text, re.S)
    assert api and f"proxy_pass http://127.0.0.1:{cfg['backend_port']};" in api.group(1)
    assert "proxy_set_header Host $host;" in api.group(1), "the blueprint's host check needs the real Host"
    # PAD-554: the rate limits key on X-Real-IP alone; every proxied location must set it.
    assert "proxy_set_header X-Real-IP $remote_addr;" in api.group(1)
    root = re.search(r"location / \{(.*?)\}", text, re.S)
    assert root and f"proxy_pass http://127.0.0.1:{cfg['admin_port']};" in root.group(1)
    assert "access_log /var/log/nginx/access.log redacted;" in text  # B-182
    assert f"/etc/letsencrypt/live/{cfg['host']}/" in text
    assert "location /register/" not in text


def test_the_admin_image_recipe_builds_the_console_only():
    dockerfile = (ROOT / "frontend" / "Dockerfile.admin").read_text()
    assert "npm run build -w @levelup/admin" in dockerfile
    assert "apps/admin/nginx.conf" in dockerfile and "apps/admin/dist" in dockerfile
    assert "@levelup/web" not in dockerfile
    nginx = (ROOT / "frontend" / "apps" / "admin" / "nginx.conf").read_text()
    assert "proxy_pass" not in nginx, "the host nginx routes /admin/api; the image holds no upstream"
