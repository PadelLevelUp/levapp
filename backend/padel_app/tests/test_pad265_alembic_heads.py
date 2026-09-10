"""PAD-265 / audit H13 — the Alembic history has exactly one head.

Checks backend/scripts/check_alembic_heads.py, the stdlib-only gate CI runs
before anything is installed (.github/workflows/migration-heads.yaml), and
runs it on the repository's own history so the backend suite fails on a
second head too.
"""
import importlib.util
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
SCRIPT = BACKEND / "scripts" / "check_alembic_heads.py"
VERSIONS = BACKEND / "migrations" / "versions"


def _load():
    spec = importlib.util.spec_from_file_location("check_alembic_heads", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _rev(directory, name, rev, down):
    (directory / f"{name}.py").write_text(
        f'"""{name}"""\nfrom alembic import op\n\nrevision = {rev!r}\ndown_revision = {down!r}\n'
    )


def test_linear_history_has_one_head(tmp_path):
    m = _load()
    _rev(tmp_path, "a", "aaa", None)
    _rev(tmp_path, "b", "bbb", "aaa")
    assert m.check(tmp_path) == (["bbb"], [])


def test_two_heads_fail(tmp_path):
    m = _load()
    _rev(tmp_path, "a", "aaa", None)
    _rev(tmp_path, "b", "bbb", "aaa")
    _rev(tmp_path, "c", "ccc", "aaa")
    heads, problems = m.check(tmp_path)
    assert heads == ["bbb", "ccc"]
    assert any("exactly one head" in p for p in problems)


def test_a_merge_revision_resolves_to_one_head(tmp_path):
    m = _load()
    _rev(tmp_path, "a", "aaa", None)
    _rev(tmp_path, "b", "bbb", "aaa")
    _rev(tmp_path, "c", "ccc", "aaa")
    _rev(tmp_path, "d", "ddd", ("bbb", "ccc"))
    assert m.check(tmp_path) == (["ddd"], [])


def test_a_duplicate_revision_id_fails(tmp_path):
    m = _load()
    _rev(tmp_path, "a", "aaa", None)
    _rev(tmp_path, "b", "aaa", None)
    _, problems = m.check(tmp_path)
    assert any("duplicate revision id 'aaa'" in p for p in problems)


def test_a_dangling_down_revision_fails(tmp_path):
    m = _load()
    _rev(tmp_path, "a", "aaa", None)
    _rev(tmp_path, "b", "bbb", "zzz")
    _, problems = m.check(tmp_path)
    assert any("'zzz' does not exist" in p for p in problems)


def test_main_exits_1_and_says_how_to_fix(tmp_path, capsys):
    m = _load()
    _rev(tmp_path, "a", "aaa", None)
    _rev(tmp_path, "b", "bbb", "aaa")
    _rev(tmp_path, "c", "ccc", "aaa")
    assert m.main(["check", str(tmp_path)]) == 1
    err = capsys.readouterr().err
    assert "flask db merge heads" in err and "bbb" in err and "ccc" in err


def test_the_repository_has_exactly_one_head():
    m = _load()
    heads, problems = m.check(VERSIONS)
    assert problems == [], problems
    assert len(heads) == 1
