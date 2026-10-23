"""PAD-711 — the warn-only expand/contract guard (delivery.zero-downtime-deploy rule 12).

Checks backend/scripts/check_expand_contract.py, the stdlib-only step migration-heads.yaml runs on
the migrations a PR into staging adds: it warns on every contract pattern in a revision's upgrade()
(the fixture with one of each), is silent on an expand-only revision whose downgrade() drops
everything, and never fails the job.
"""
import importlib.util
import re
import subprocess
import sys
from pathlib import Path

import yaml

BACKEND = Path(__file__).resolve().parents[2]
SCRIPT = BACKEND / "scripts" / "check_expand_contract.py"
FIXTURES = Path(__file__).resolve().parent / "fixtures"
CONTRACT = FIXTURES / "pad711_contract_migration.py.txt"
EXPAND = FIXTURES / "pad711_expand_migration.py.txt"
WORKFLOW = BACKEND.parent / ".github" / "workflows" / "migration-heads.yaml"


def _load():
    spec = importlib.util.spec_from_file_location("check_expand_contract", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run(*paths, tmp_path):
    summary = tmp_path / "summary.md"
    r = subprocess.run([sys.executable, str(SCRIPT), *map(str, paths)], capture_output=True, text=True,
                       env={"GITHUB_STEP_SUMMARY": str(summary), "PATH": "/usr/bin:/bin"}, timeout=30)
    return r, summary.read_text() if summary.exists() else ""


def test_each_contract_pattern_warns_on_its_line(tmp_path):
    r, summary = _run(CONTRACT, tmp_path=tmp_path)
    assert r.returncode == 0, "warn-only: never fails"
    annotated = [int(m) for m in re.findall(rf"::warning file={re.escape(str(CONTRACT))},line=(\d+)::", r.stdout)]
    expected = [int(n) for n in re.findall(r"# line (\d+)", CONTRACT.read_text())]
    assert annotated == expected  # one per pattern, the batch_op drop and the raw SQL rename included
    for needle in ("`drop_column`", "`drop_table`", "new_column_name", "`rename_table`", "type_=",
                   "nullable=False", "NOT NULL column with no `server_default`", "RENAME COLUMN"):
        assert needle in r.stdout, needle
    assert "rollout: stop-first" in r.stdout and "split it" in r.stdout
    assert summary.startswith("### Expand/contract") and "never fails the PR" in summary
    assert summary.count(f"- `{CONTRACT}:") == len(expected)


def test_an_expand_only_revision_is_silent(tmp_path):
    r, summary = _run(EXPAND, tmp_path=tmp_path)
    assert r.returncode == 0
    assert "::warning" not in r.stdout
    assert summary.strip() == "Expand/contract: 1 added migration(s), all expand-only."


def test_downgrade_is_never_read():
    m = _load()
    source = EXPAND.read_text()
    assert "op.drop_table" in source.split("def downgrade", 1)[1], "the fixture really drops in downgrade()"
    assert m.findings_in(source) == []


def test_no_pr_migrations_says_so_and_passes(tmp_path):
    r, summary = _run(tmp_path=tmp_path)
    assert r.returncode == 0
    assert "0 added migration(s)" in summary


def test_an_unreadable_file_warns_and_passes(tmp_path):
    bad = tmp_path / "broken.py"
    bad.write_text("def upgrade(:\n")
    r, _ = _run(bad, tmp_path=tmp_path)
    assert r.returncode == 0
    assert f"::warning file={bad}::expand/contract guard could not read it" in r.stdout


def test_a_not_null_column_with_a_server_default_is_expand():
    m = _load()
    src = ("def upgrade():\n    op.add_column('t', sa.Column('c', sa.Integer(), nullable=False, "
           "server_default='0'))\n")
    assert m.findings_in(src) == []


def test_the_workflow_runs_it_on_added_migrations_only_and_never_fails():
    doc = yaml.safe_load(WORKFLOW.read_text())
    job = doc["jobs"]["expand-contract"]
    assert job["if"] == "github.event_name == 'pull_request' && github.base_ref == 'staging'"
    assert job["continue-on-error"] is True
    checkout = next(s for s in job["steps"] if s.get("uses", "").startswith("actions/checkout@"))
    assert checkout["with"]["fetch-depth"] == 2, "the PR merge commit and its first parent, the base"
    run = next(s for s in job["steps"] if s.get("name") == "Warn on contract steps in added migrations")["run"]
    assert "git diff --name-only --diff-filter=A HEAD^1 HEAD -- 'backend/migrations/versions/*.py'" in run
    assert "python backend/scripts/check_expand_contract.py" in run
    assert "permissions" not in job and "secrets." not in WORKFLOW.read_text()
    # The required "one Alembic head" job is untouched.
    assert doc["jobs"]["single-head"]["name"] == "one Alembic head"
