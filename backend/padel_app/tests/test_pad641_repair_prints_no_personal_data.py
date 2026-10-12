"""PAD-641 — delivery.repair-diagnostics: the manual repair workflow prints no app log lines and
no query text into the GitHub Actions log (rules 1-3).

The Actions log lives on GitHub. App log lines and `pg_stat_activity.query` can carry names and
e-mails (psycopg2 inlines query parameters), so the log tail stays in an owner-only file on the
VM and only counts and exception class names are printed; Postgres activity is shown by
`query_id` and wait events.
"""
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github/workflows/repair.yaml"


def _script():
    doc = yaml.safe_load(WORKFLOW.read_text())
    steps = doc["jobs"]["diagnose-and-repair"]["steps"]
    return "\n".join(step.get("with", {}).get("script", "") for step in steps)


def _commands(script):
    return [l.strip() for l in script.splitlines() if l.strip() and not l.strip().startswith("#")]


def test_the_app_log_tail_goes_to_a_file_on_the_vm_never_to_stdout():
    lines = [l for l in _commands(_script()) if "docker logs" in l]
    assert lines, "the repair workflow no longer reads the app log at all"
    for line in lines:
        assert re.search(r'>\s*"\$LOGF"', line), line
    assert "umask 077" in _script() and "mkdir -p -m 700" in _script()


def test_the_saved_log_is_only_counted_never_printed():
    for line in _commands(_script()):
        if "$LOGF" in line and "docker logs" not in line and not line.startswith("LOGF="):
            # grep -c (a count), grep -o of class names, wc -l, basename: nothing echoes a line.
            assert re.search(r"grep -c|grep -oE|wc -l|basename", line), line
            assert not re.search(r"\b(cat|tail|head|less|more)\b[^|]*\$LOGF", line), line


def test_postgres_activity_shows_query_ids_never_query_text():
    script = _script()
    sql = re.findall(r"SELECT .*?;", script)
    assert len(sql) >= 2
    for statement in sql:
        assert "query_id" in statement, statement
        # Any column named query (left(query,…), blocked.query, …) prints the text.
        assert not re.search(r"(?<![\w_])(\w+\.)?query(?![\w_])", statement), statement
