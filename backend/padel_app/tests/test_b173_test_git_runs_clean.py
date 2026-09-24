"""B-173: no test's git inherits git's repository variables.

On 2026-09-24 a pre-push gate ran pytest with GIT_DIR exported (a worktree's gitdir). The QA-reset
test's `git init <tmp>` honoured GIT_DIR over its path, re-initialised the SHARED repository and set
core.bare=true — every worktree on the machine failed "must be run in a work tree" for minutes,
twice. The rule: every git a test starts gets `env=git_env(...)` (padel_app/tests/git_env.py), and
conftest drops the variables from os.environ as well.

Every cell that plants GIT_DIR points it at a scratch repository under tmp_path — never this one.
"""
import ast
import os
import re
import subprocess
from pathlib import Path

import pytest

from padel_app.tests import test_every_test_file_is_collected as collected_guard
from padel_app.tests import test_pad398_qa_reset_guards as qa_reset
from padel_app.tests import test_public_knowledge_layer_guard as knowledge_guard
from padel_app.tests.git_env import GIT_LOCAL_ENV_VARS, git_env

TESTS = Path(__file__).resolve().parent
REPO = TESTS.parents[2]
SUBPROCESS_CALLS = {"run", "check_output", "check_call", "call", "Popen"}


def _scratch_worktree(root: Path) -> tuple[Path, Path]:
    """A scratch repository with one linked worktree — the shape a hook's GIT_DIR has."""
    repo = root / "scratch"
    subprocess.run(["git", "init", "-q", str(repo)], check=True, env=git_env())
    subprocess.run(["git", "-C", str(repo), "-c", "user.email=t@t", "-c", "user.name=t",
                    "commit", "-q", "--allow-empty", "-m", "scratch"], check=True, env=git_env())
    subprocess.run(["git", "-C", str(repo), "worktree", "add", "-q", str(root / "scratch-wt"), "-b", "wt"],
                   check=True, env=git_env())
    return repo, repo / ".git" / "worktrees" / "scratch-wt"


def _bare(repo: Path) -> str:
    return subprocess.run(["git", "--git-dir", str(repo / ".git"), "config", "--get", "core.bare"],
                          capture_output=True, text=True, env=git_env()).stdout.strip()


@pytest.fixture
def planted_git_dir(tmp_path, monkeypatch):
    """GIT_DIR exported as a hook exports it, pointing at a scratch worktree's gitdir."""
    repo, gitdir = _scratch_worktree(tmp_path)
    assert _bare(repo) == "false"
    monkeypatch.setenv("GIT_DIR", str(gitdir))
    return repo


def test_the_instrument_a_raw_git_init_under_a_planted_git_dir_makes_the_repository_bare(planted_git_dir, tmp_path):
    """R-034: the planted GIT_DIR reproduces the incident, so the cells below can see it."""
    subprocess.run(["git", "init", "-q", str(tmp_path / "elsewhere")],  # B-173 instrument: inherits on purpose
                   check=True, capture_output=True, env=dict(os.environ))
    assert _bare(planted_git_dir) == "true"


def test_the_qa_reset_harness_leaves_the_planted_repository_alone(planted_git_dir, tmp_path):
    repo, sha = qa_reset._checkout(tmp_path / "qa")
    assert _bare(planted_git_dir) == "false"
    assert (repo / ".git").is_dir(), "the scratch checkout got its own repository"
    res = qa_reset._run({"QA_CHECKOUT": str(repo), "QA_COMMIT": sha})
    assert "is not a git work" not in res.stderr, res.stderr
    assert _bare(planted_git_dir) == "false"


def test_the_repository_scanning_guards_read_this_repository_under_a_planted_git_dir(planted_git_dir, monkeypatch):
    with_planted = (collected_guard.files_defining_tests(), knowledge_guard.tracked_knowledge_files())
    monkeypatch.delenv("GIT_DIR")
    assert with_planted == (collected_guard.files_defining_tests(), knowledge_guard.tracked_knowledge_files())
    assert with_planted[0], "the collection guard listed nothing — it read the scratch repository"


def test_the_session_environment_carries_no_repository_variable():
    assert not GIT_LOCAL_ENV_VARS & set(os.environ), "conftest.py must drop them at session start"


def _argv0(call: ast.Call):
    first = call.args[0] if call.args else None
    if isinstance(first, (ast.List, ast.Tuple)) and first.elts and isinstance(first.elts[0], ast.Constant):
        return first.elts[0].value
    return None


def test_every_git_a_backend_test_starts_passes_git_env():
    offenders = []
    for path in sorted(TESTS.glob("*.py")):
        if path.name == "git_env.py":  # defines the clean env; its one git call builds it by hand
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                    and node.func.attr in SUBPROCESS_CALLS
                    and isinstance(node.func.value, ast.Name) and node.func.value.id == "subprocess"):
                continue
            env = next((kw.value for kw in node.keywords if kw.arg == "env"), None)
            if env is None:
                offenders.append(f"{path.name}:{node.lineno} starts a subprocess with the inherited environment")
            elif _argv0(node) == "git" and "git_env" not in ast.unparse(env) \
                    and "B-173 instrument" not in path.read_text(encoding="utf-8").splitlines()[node.lineno - 1]:
                offenders.append(f"{path.name}:{node.lineno} runs git without env=git_env(...)")
    assert offenders == [], "\n".join(offenders)


FRONTEND_GIT_CALL = re.compile(r"\b(execFileSync|spawnSync|execSync|spawn|execFile)\(\s*[\"'`]git\b")


def test_every_git_a_frontend_test_starts_passes_an_env():
    listed = subprocess.run(
        ["git", "ls-files", "--", "frontend/*.test.ts", "frontend/*.test.tsx", "frontend/*.test.mjs"],
        cwd=REPO, check=True, capture_output=True, text=True, env=git_env(),
    ).stdout.splitlines()
    offenders = []
    for name in listed:
        if "/node_modules/" in name:
            continue
        text = (REPO / name).read_text(encoding="utf-8", errors="replace")
        for match in FRONTEND_GIT_CALL.finditer(text):
            call = text[match.start(): text.find(")", text.find("}", match.end())) + 1]
            if "env:" not in call:
                line = text.count("\n", 0, match.start()) + 1
                offenders.append(f"{name}:{line} runs git without an explicit env")
    assert listed, "no frontend test files listed — the scan is blind"
    assert offenders == [], "\n".join(offenders)
