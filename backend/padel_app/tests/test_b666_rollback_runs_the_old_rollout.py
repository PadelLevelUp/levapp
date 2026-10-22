"""B-666 — a rollback runs the rollback commit's rollout.sh, so the workflows pass it only what it knows.

deploy-prod.yaml checks out `rollback_to` (PAD-338), so rollout.sh comes from that older commit,
while the ssh script's lines come from the workflow at main. #753 added `--migrate` and #769
`--probe-host`, and the rollout.sh before them exits 2 on an option it doesn't know. So
`rollback_to=0ee4e837d` (promotion 16, the last prod deploy before both) would have failed before
touching a container. The workflows now ask the checked-out script which options it accepts.

This runs each workflow's real rollout lines (the `opt` helper and the invocation, read from the
YAML) against rollout.sh as it was at 0ee4e837d and as it is now, in the R-028 stub harness of
test_pad588_rollout.
"""
import re
import subprocess
from pathlib import Path

import pytest

from padel_app.tests.git_env import git_env
from padel_app.tests.test_pad588_rollout import containers, live, sb  # noqa: F401 — the stub fixture

REPO = Path(__file__).resolve().parents[3]
WORKFLOWS = REPO / ".github" / "workflows"
CURRENT = REPO / "backend" / "scripts" / "rollout.sh"
#: Promotion 16's prod deploy (2026-10-21 22:46Z): before #753's --migrate and #769's --probe-host.
BEFORE_BOTH = "0ee4e837d"


def rollout_lines(workflow):
    """The workflow's `opt` helper and its rollout invocation, up to the docker-run arguments."""
    text = (WORKFLOWS / workflow).read_text()
    helper = next(l.strip() for l in text.splitlines() if l.strip().startswith("opt() {"))
    call = next(l.strip() for l in text.splitlines() if l.strip().startswith('bash "$RO" --name'))
    assert call.endswith("-- \\"), call
    return helper, call[: -len("-- \\")]


def old_rollout(tmp_path):
    body = subprocess.run(["git", "show", f"{BEFORE_BOTH}:backend/scripts/rollout.sh"], cwd=REPO,
                          capture_output=True, text=True, check=True, env=git_env()).stdout
    path = tmp_path / "rollout-0ee4e837d.sh"
    path.write_text(body)
    return path


def run_workflow_lines(sb, workflow, script):  # noqa: F811
    helper, call = rollout_lines(workflow)
    port_a = re.search(r"--ports (\d+),", call).group(1)
    name = re.search(r"--name (\S+)", call).group(1)
    live(sb, name, int(port_a))
    upstream = re.search(r"--upstream (\S+)", call).group(1)
    sb["upstream"].write_text(f"upstream {upstream} {{\n    server 127.0.0.1:{port_a};\n}}\n")
    (sb["sites"] / "levapp").write_text(f"location /api/ {{\n    proxy_pass http://{upstream};\n}}\n")
    bash = f'set -euo pipefail\nRO="{script}"\nROLLOUT_MODE=""\n{helper}\n{call}-- --restart unless-stopped repo/levelup_backend:abc123\n'
    r = subprocess.run(["bash", "-c", bash], env=sb["env"], capture_output=True, text=True, timeout=60)
    calls = (sb["home"] / "calls.log").read_text().splitlines() if (sb["home"] / "calls.log").exists() else []
    return r, calls, name


@pytest.mark.parametrize("workflow", ["deploy-prod.yaml", "deploy-staging.yaml"])
def test_a_rollback_to_before_migrate_and_probe_host_still_rolls(sb, tmp_path, workflow):  # noqa: F811
    r, calls, name = run_workflow_lines(sb, workflow, old_rollout(tmp_path))
    assert r.returncode == 0, r.stdout + r.stderr
    assert "unknown option" not in r.stdout + r.stderr
    assert "this rollout.sh has no --probe-host: not passing it" in r.stderr
    assert "this rollout.sh has no --migrate: not passing it" in r.stderr
    assert any(c.startswith(f"docker run -d --name {name}_next") for c in calls), "it rolled"


@pytest.mark.parametrize("workflow", ["deploy-prod.yaml", "deploy-staging.yaml"])
def test_the_current_rollout_gets_every_option(sb, workflow):  # noqa: F811
    r, calls, _ = run_workflow_lines(sb, workflow, CURRENT)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "not passing it" not in r.stderr
    assert "migrate yes" in r.stdout, "--migrate reached the script"
    assert any(c.startswith("curl nginx https://") for c in calls), "--probe-host reached the script"


def test_the_old_script_really_rejects_the_new_options(sb, tmp_path):  # noqa: F811
    """The 2×2's other half: without the helper, the old script fails exactly as feared."""
    old = old_rollout(tmp_path)
    r = subprocess.run(["bash", str(old), "--name", "padelapp", "--ports", "5000,5002", "--upstream", "levapp_api",
                        "--probe-host", "levapp.app", "--migrate", "--", "repo/levelup_backend:abc123"],
                       env=sb["env"], capture_output=True, text=True, timeout=30)
    assert r.returncode == 2 and "unknown option --probe-host" in r.stdout + r.stderr
