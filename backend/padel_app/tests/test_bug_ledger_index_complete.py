"""
The bug ledger's index lists every ledger file (.cortex/compass/bugs/_index.md).

The daily bug-triage loop and every "has this been seen before?" lookup start from the index,
so a B-NNN file with no line there is invisible to them. `cortex validate` checks only the
index's size (check.index-shape), never that it is complete: on 2026-09-25, 40 ledger files had
no line (B-001..B-028, B-047, B-048, B-073, B-083, B-146, B-166, B-167, B-173 and Session-E's
B-182..B-185, B-201, B-204).

Run:
    pytest padel_app/tests/test_bug_ledger_index_complete.py -v
"""
import re
from pathlib import Path

BUGS = Path(__file__).resolve().parents[3] / ".cortex" / "compass" / "bugs"


def test_every_ledger_file_has_an_index_line():
    index = (BUGS / "_index.md").read_text()
    missing = sorted(
        f.name
        for f in BUGS.glob("B-*.md")
        if f"]({f.name})" not in index
    )
    assert missing == [], f"add a `- [B-NNN](file) — …` line to _index.md for: {missing}"


def test_every_index_link_points_at_a_ledger_file():
    index = (BUGS / "_index.md").read_text()
    dangling = sorted(
        target for target in re.findall(r"\]\((B-\d+[^)]*\.md)\)", index) if not (BUGS / target).exists()
    )
    assert dangling == [], f"index lines point at missing files: {dangling}"
