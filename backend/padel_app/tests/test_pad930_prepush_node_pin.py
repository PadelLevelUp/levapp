"""PAD-930 — the pre-push gate runs the frontend checks on the pinned Node and refuses Node 25+.

Spec: ``delivery.pre-push-gate`` (DELIVERY-PREPUSH-1, -2). The gate runs in dry mode (it prints
the steps it would run) inside a throwaway git repository holding a copy of the script, so the
test needs neither history, ``origin`` nor the real ``frontend/``: CI's backend checkout is shallow.
A stub ``node`` on PATH stands in for the active Node.
"""
import os
import shutil
import subprocess
from pathlib import Path

import pytest


def _repo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / ".githooks" / "prepush-gate.sh").is_file():
            return parent
    raise RuntimeError("no .githooks/prepush-gate.sh above this file")


GATE = Path(os.environ.get("GATE_SCRIPT") or _repo_root() / ".githooks" / "prepush-gate.sh")


def _git(cwd, *args):
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", *args],
        cwd=cwd, check=True, capture_output=True,
    )


@pytest.fixture
def repo(tmp_path):
    """A repo whose last commit adds ``frontend/x.ts``; ``frontend/node_modules`` exists (empty)."""
    r = tmp_path / "repo"
    (r / ".githooks").mkdir(parents=True)
    shutil.copy(GATE, r / ".githooks" / "prepush-gate.sh")
    (r / ".nvmrc").write_text("24.15.0\n")
    _git(r.parent, "init", "-q", str(r))
    _git(r, "add", "-A")
    _git(r, "commit", "-q", "-m", "base")
    (r / "frontend").mkdir()
    (r / "frontend" / "x.ts").write_text("export {}\n")
    _git(r, "add", "-A")
    _git(r, "commit", "-q", "-m", "frontend change")
    (r / "frontend" / "node_modules").mkdir()
    return r


def _stub_node(tmp_path, version):
    d = tmp_path / "stub-bin"
    d.mkdir(exist_ok=True)
    node = d / "node"
    node.write_text(f'#!/bin/sh\n[ "$1" = "-v" ] && echo {version}\n')
    node.chmod(0o755)
    return d


def _gate(repo, stub_dir, nvm_dir):
    env = {
        **os.environ,
        "PATH": f"{stub_dir}:{os.environ['PATH']}",
        "NVM_DIR": str(nvm_dir),
        "PREPUSH_DRY": "1",
        "PREPUSH_BASE": "HEAD~1",
    }
    p = subprocess.run(
        ["bash", ".githooks/prepush-gate.sh"], cwd=repo, env=env, capture_output=True, text=True,
    )
    return p.returncode, p.stdout + p.stderr


def _frontend_steps(out):
    return [ln for ln in out.splitlines() if "typecheck" in ln or "npm test" in ln]


@pytest.mark.criterion("DELIVERY-PREPUSH-1")
def test_node_26_is_refused_and_runs_no_frontend_step(repo, tmp_path):
    stub = _stub_node(tmp_path, "v26.13.0")
    code, out = _gate(repo, stub, tmp_path / "no-nvm")
    assert code != 0, out
    assert "v26" in out and str(stub / "node") in out and "nvm install 24.15.0" in out, out
    assert _frontend_steps(out) == [], out


@pytest.mark.criterion("DELIVERY-PREPUSH-1")
def test_node_24_15_0_proceeds_to_the_frontend_steps(repo, tmp_path):
    stub = _stub_node(tmp_path, "v24.15.0")
    code, out = _gate(repo, stub, tmp_path / "no-nvm")
    assert code == 0, out
    assert "frontend checks on node v24.15.0" in out, out
    assert _frontend_steps(out), out


@pytest.mark.criterion("DELIVERY-PREPUSH-2")
def test_a_pinned_version_missing_under_nvm_fails_loudly(repo, tmp_path):
    nvm_dir = tmp_path / "nvm"
    nvm_dir.mkdir()
    (nvm_dir / "nvm.sh").write_text("nvm() { return 1; }\n")
    code, out = _gate(repo, _stub_node(tmp_path, "v26.13.0"), nvm_dir)
    assert code != 0, out
    assert "not installed under nvm" in out and "nvm install 24.15.0" in out, out
    assert _frontend_steps(out) == [], out
