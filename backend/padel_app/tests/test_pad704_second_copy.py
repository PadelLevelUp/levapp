"""PAD-704 — `rollout.sh --copies 2`: a second API copy on the port the swap freed (B8 on staging).

delivery.zero-downtime-deploy rule 14. R-028 stub harness of test_pad588_rollout: one file per
container, holding its port; a stub curl answering 200 for healthy ports. A container named in
STUB_SICK never becomes healthy.
"""
import os
import subprocess
from pathlib import Path

import pytest

from padel_app.tests.test_pad588_rollout import DOCKER_STUB, containers, index, live, run, sb  # noqa: F401

SICK = DOCKER_STUB.replace(
    '[ -n "${STUB_NEW_IS_HEALTHY:-1}" ] && [ "${STUB_NEW_IS_HEALTHY:-1}" = 1 ] && echo "$port" >> "$STUB_HOME/healthy"',
    '[ "${STUB_NEW_IS_HEALTHY:-1}" = 1 ] && [ "$name" != "${STUB_SICK:-}" ] && echo "$port" >> "$STUB_HOME/healthy"',
)
assert SICK != DOCKER_STUB


@pytest.fixture
def csb(sb):  # noqa: F811
    (sb["home"].parent / "bin" / "docker").write_text(SICK)
    return sb


def test_two_copies_after_the_swap(csb):
    live(csb, "padelapp", 5000)
    r, calls = run(csb, "--copies", "2")
    assert r.returncode == 0, r.stdout + r.stderr
    assert containers(csb) == {"padelapp": "5002", "padelapp_b": "5000"}, "the second copy takes the freed port"
    assert index(calls, "docker rename padelapp_next padelapp") < index(calls, "docker run -d --name padelapp_b -p 127.0.0.1:5000:80")
    assert "copies 2" in r.stdout and "padelapp_b serves on 127.0.0.1:5000" in r.stdout


def test_the_last_deploys_second_copy_gives_back_its_port_first(csb):
    live(csb, "padelapp", 5000)
    live(csb, "padelapp_b", 5002)
    r, calls = run(csb, "--copies", "2")
    assert r.returncode == 0, r.stdout + r.stderr
    assert index(calls, "docker stop -t 10 padelapp_b") < index(calls, "docker run -d --name padelapp_next -p 127.0.0.1:5002:80")
    assert containers(csb) == {"padelapp": "5002", "padelapp_b": "5000"}


def test_both_copies_serve_through_the_migrate_step(csb):
    live(csb, "padelapp", 5000)
    live(csb, "padelapp_b", 5002)
    r, calls = run(csb, "--copies", "2", "--migrate")
    assert r.returncode == 0, r.stdout + r.stderr
    assert index(calls, "docker run --rm --name padelapp_migrate") < index(calls, "docker stop -t 10 padelapp_b")


def test_one_copy_removes_a_leftover_second(csb):
    live(csb, "padelapp", 5000)
    live(csb, "padelapp_b", 5002)
    r, calls = run(csb)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "docker stop -t 10 padelapp_b" in calls
    assert containers(csb) == {"padelapp": "5002"}


def test_stop_first_never_runs_a_second_copy(csb):
    live(csb, "padelapp", 5000)
    live(csb, "padelapp_b", 5002)
    r, calls = run(csb, "--stop-first", "--copies", "2")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "no second copy this run" in r.stdout
    assert containers(csb) == {"padelapp": "5000"}, "and no old second copy left serving the old release"


def test_a_sick_second_copy_is_removed_and_the_run_is_red(csb):
    live(csb, "padelapp", 5000)
    r, calls = run(csb, "--copies", "2", STUB_SICK="padelapp_b")
    assert r.returncode == 1
    assert "padelapp_b is not healthy; removed, padelapp serves alone" in r.stdout
    assert containers(csb) == {"padelapp": "5002"}


def test_copies_is_one_or_two(csb):
    r, _ = run(csb, "--copies", "3")
    assert r.returncode == 2 and "--copies must be 1 or 2" in r.stderr


def test_dry_run_prints_the_second_copy(csb):
    live(csb, "padelapp", 5000)
    r, _ = run(csb, "--copies", "2", "--dry-run")
    assert r.returncode == 0, r.stdout + r.stderr
    assert "dry-run: docker run -d --name padelapp_b -p 127.0.0.1:5000:80" in r.stderr


def test_staging_runs_one_copy_until_the_memory_budget_and_prod_none():
    # Rolled back 2026-10-22 (deploy-time page-outs on the 2 GB host); 2 again once that is settled.
    backend = Path(__file__).resolve().parents[2]
    assert "\nAPI_COPIES=1\n" in (backend / ".env.staging").read_text()
    assert "API_COPIES" not in (backend / ".env.prod").read_text(), "prod stays at one copy"


WORKFLOWS = Path(__file__).resolve().parents[3] / ".github" / "workflows"


@pytest.mark.parametrize("workflow,name", [("deploy-prod.yaml", "padelapp"), ("deploy-staging.yaml", "padelapp_staging")])
@pytest.mark.parametrize("script_has_copies,removed", [(False, True), (True, False)])
def test_an_older_script_cannot_free_the_port_so_the_workflow_does(tmp_path, workflow, name, script_has_copies, removed):
    lines = (WORKFLOWS / workflow).read_text().splitlines()
    start = next(i for i, l in enumerate(lines) if 'grep -qF -- "    --copies)" "$RO"' in l)
    block = "\n".join(l.strip() for l in lines[start:start + 5])
    assert block.rstrip().endswith("fi"), block
    rollout = tmp_path / "rollout.sh"
    rollout.write_text("case x in\n    --copies) ;;\nesac\n" if script_has_copies else "case x in\n    --migrate) ;;\nesac\n")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "docker").write_text('#!/usr/bin/env bash\necho "docker $*" >> "$STUB/calls.log"\nexit 0\n')
    (bin_dir / "docker").chmod(0o755)
    r = subprocess.run(["bash", "-c", f'RO="{rollout}"\n{block}'], capture_output=True, text=True, timeout=30,
                       env={"PATH": f"{bin_dir}:{os.environ['PATH']}", "STUB": str(tmp_path)})
    assert r.returncode == 0, r.stderr
    calls = (tmp_path / "calls.log").read_text() if (tmp_path / "calls.log").exists() else ""
    assert (f"docker rm {name}_b" in calls) is removed
