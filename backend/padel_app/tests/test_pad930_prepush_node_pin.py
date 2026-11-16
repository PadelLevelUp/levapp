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

from padel_app.tests.git_env import git_env


def _repo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / ".githooks" / "prepush-gate.sh").is_file():
            return parent
    raise RuntimeError("no .githooks/prepush-gate.sh above this file")


GATE = Path(os.environ.get("GATE_SCRIPT") or _repo_root() / ".githooks" / "prepush-gate.sh")


def _git(cwd, *args):
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", *args],
        cwd=cwd, check=True, capture_output=True, env=git_env(),
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


def _spec_repo(tmp_path, *files):
    """A repo whose last commit changes only ``files`` (paths under ``specflow/``)."""
    r = tmp_path / "specrepo"
    (r / ".githooks").mkdir(parents=True)
    shutil.copy(GATE, r / ".githooks" / "prepush-gate.sh")
    _git(r.parent, "init", "-q", str(r))
    _git(r, "add", "-A")
    _git(r, "commit", "-q", "-m", "base")
    for f in files:
        (r / f).parent.mkdir(parents=True, exist_ok=True)
        (r / f).write_text("x\n")
    _git(r, "add", "-A")
    _git(r, "commit", "-q", "-m", "spec change")
    return r


def _stub_cortex(tmp_path, report):
    """A ``cortex`` that prints ``report`` and exits 0 (``validate`` reports errors on stdout)."""
    d = tmp_path / "stub-bin"
    d.mkdir(exist_ok=True)
    cortex = d / "cortex"
    cortex.write_text(f"#!/bin/sh\ncat <<'EOF'\n{report}\nEOF\n")
    cortex.chmod(0o755)
    return d


def _stub_node(tmp_path, version):
    d = tmp_path / "stub-bin"
    d.mkdir(exist_ok=True)
    node = d / "node"
    node.write_text(f'#!/bin/sh\n[ "$1" = "-v" ] && echo {version}\n')
    node.chmod(0o755)
    return d


def _gate(repo, stub_dir, nvm_dir, dry=True):
    # A clean environment: no git repository variables (B-173) and none of the outer gate's
    # PREPUSH_* settings, which a pre-push hook exports while this very test runs under it.
    base = {k: v for k, v in git_env().items() if not k.startswith("PREPUSH_")}
    env = {
        **base,
        "PATH": f"{stub_dir}:{base['PATH']}",
        "NVM_DIR": str(nvm_dir),
        "PREPUSH_BASE": "HEAD~1",
    }
    env.pop("PREPUSH_DRY", None)
    if dry:
        env["PREPUSH_DRY"] = "1"
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


SPEC = "specflow/impl/x/x.spec.md"
ERROR = f"[ERROR] check.frontmatter (S11)\n  /abs/{SPEC}\n  frontmatter does not parse"


@pytest.mark.criterion("DELIVERY-PREPUSH-3")
def test_a_validation_error_in_a_changed_spec_fails_the_gate(tmp_path):
    r = _spec_repo(tmp_path, SPEC)
    code, out = _gate(r, _stub_cortex(tmp_path, ERROR), tmp_path / "no-nvm", dry=False)
    assert "cortex validate (changed files)" in out and f"cortex validate names {SPEC}" in out, out
    assert code != 0, out


@pytest.mark.criterion("DELIVERY-PREPUSH-3")
def test_an_error_in_a_spec_the_push_did_not_change_does_not_fail_the_gate(tmp_path):
    r = _spec_repo(tmp_path, "specflow/impl/y/y.spec.md")
    code, out = _gate(r, _stub_cortex(tmp_path, ERROR), tmp_path / "no-nvm", dry=False)
    assert "cortex validate names" not in out, out
    assert "cortex validate (changed files)" in out, out


@pytest.mark.criterion("DELIVERY-PREPUSH-3")
def test_a_push_changing_only_the_generated_index_runs_no_spec_validation(tmp_path):
    r = _spec_repo(tmp_path, "specflow/INDEX.md")
    _, out = _gate(r, _stub_cortex(tmp_path, ERROR), tmp_path / "no-nvm")
    assert "cortex validate (changed files)" not in out, out
