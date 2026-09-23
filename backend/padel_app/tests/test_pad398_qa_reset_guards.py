"""PAD-398 (B-171): the weekly QA sweep's database reset runs from the code under test, or not at all.

The old script lived under the gitignored docs/ and resolved the backend and the seed from its own
path, so the sweep migrated `levelup_qa` with the main checkout's backend (46 migrations) while
staging's (84) served it. The tracked script takes the checkout and the commit explicitly and
refuses before touching a database. Every cell here runs the real script in its dry-run mode
against a throwaway repository shaped like a checkout — no database, no network.
"""
import os
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[3] / ".claude" / "skills" / "weekly-qa" / "scripts" / "reset-qa-db.sh"


def _git(repo, *args):
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True).stdout.strip()


def _checkout(root: Path, name="levapp-qa", message="tree under test") -> tuple[Path, str]:
    """A minimal committed checkout: one migration, a seed, an importable padel_app, a venv python."""
    repo = root / name
    (repo / "backend" / "migrations" / "versions").mkdir(parents=True)
    (repo / "backend" / "migrations" / "versions" / "aaaa11112222_first.py").write_text("revision = 'aaaa11112222'\n")
    (repo / "backend" / "padel_app").mkdir()
    (repo / "backend" / "padel_app" / "__init__.py").write_text("")
    (repo / "frontend" / "apps" / "web" / "e2e" / "scripts").mkdir(parents=True)
    (repo / "frontend" / "apps" / "web" / "e2e" / "scripts" / "seed.py").write_text("")
    (repo / ".gitignore").write_text(".venv/\n")
    _git(root, "init", "-q", str(repo))
    _git(repo, "add", "-A")
    _git(repo, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", message)
    venv_bin = repo / "backend" / ".venv" / "bin"
    venv_bin.mkdir(parents=True)
    (venv_bin / "python").symlink_to(sys.executable)
    return repo, _git(repo, "rev-parse", "HEAD")


def _run(env_extra, *args):
    env = {k: v for k, v in os.environ.items() if k not in ("QA_CHECKOUT", "QA_COMMIT", "PYTHONPATH")}
    env.update({"QA_RESET_DRY_RUN": "1", **env_extra})
    return subprocess.run(["bash", str(SCRIPT), *args], env=env, capture_output=True, text=True, timeout=60)


@pytest.fixture
def tree(tmp_path):
    return _checkout(tmp_path)


def test_the_script_is_tracked_next_to_the_skill_not_under_the_ignored_docs():
    assert SCRIPT.is_file()
    tracked = subprocess.run(["git", "-C", str(SCRIPT.parent), "ls-files", "--error-unmatch", SCRIPT.name],
                             capture_output=True, text=True)
    assert tracked.returncode == 0, "the QA checkout only carries the script if git tracks it"


def test_nothing_is_inferred_without_a_checkout(tree):
    res = _run({})
    assert res.returncode == 2 and "QA_CHECKOUT is not set" in res.stderr


def test_without_the_commit_under_test_it_refuses(tree):
    repo, _sha = tree
    res = _run({"QA_CHECKOUT": str(repo)})
    assert res.returncode == 2 and "QA_COMMIT is not set" in res.stderr


def test_a_tree_parked_on_another_commit_is_refused(tree, tmp_path):
    """The 2026-09-22 case: a clean, valid checkout — just not the commit under test."""
    repo, sha = tree
    parked, other = _checkout(tmp_path, "main-checkout", message="a branch parked a week ago")
    assert other != sha
    res = _run({"QA_CHECKOUT": str(parked), "QA_COMMIT": sha[:9]})
    assert res.returncode == 2 and "not the QA_COMMIT" in res.stderr


def test_a_directory_that_is_not_a_worktree_is_refused(tmp_path):
    res = _run({"QA_CHECKOUT": str(tmp_path), "QA_COMMIT": "abc"})
    assert res.returncode == 2 and "not a git worktree" in res.stderr


def test_a_stray_migration_is_refused(tree):
    repo, sha = tree
    (repo / "backend" / "migrations" / "versions" / "bbbb33334444_stray.py").write_text("revision = 'bbbb33334444'\n")
    res = _run({"QA_CHECKOUT": str(repo), "QA_COMMIT": sha[:9]})
    assert res.returncode == 2 and "local changes under migrations/" in res.stderr


def test_the_tree_under_test_at_its_commit_passes_every_guard(tree):
    repo, sha = tree
    res = _run({"QA_CHECKOUT": str(repo), "QA_COMMIT": sha[:9]})
    assert res.returncode == 0, res.stderr
    assert f"checkout {repo.resolve()} @ {sha[:9]}" in res.stdout
    assert "1 migrations" in res.stdout and "no database touched" in res.stdout


def test_the_checkout_can_be_the_first_argument(tree):
    repo, sha = tree
    res = _run({"QA_COMMIT": sha[:9]}, str(repo))
    assert res.returncode == 0, res.stderr
