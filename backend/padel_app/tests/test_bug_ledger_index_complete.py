"""
The bug ledger's index lists every ledger file (.cortex/compass/bugs/_index.md).

The daily bug-triage loop and every "has this been seen before?" lookup start from the index,
so a B-NNN file with no line there is invisible to them. `cortex validate` checks only the
index's size (check.index-shape), never that it is complete: on 2026-09-25, 40 ledger files had
no line (B-001..B-028, B-047, B-048, B-073, B-083, B-146, B-166, B-167, B-173 and Session-E's
B-182..B-185, B-201, B-204).

PAD-756: rows are in strictly increasing id order with no id twice, and no two ledger files share
an id. Every branch appends its row at the end, so merges landed rows out of order and resolved
conflicts kept some twice; `python3 backend/scripts/sort_bug_index.py` puts them back.

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


ROW = re.compile(r"^- \[B-(\d+)\]", re.M)
FIX = "run `python3 backend/scripts/sort_bug_index.py` (after a merge, that is the whole fix)"


def test_index_rows_are_in_strictly_increasing_id_order():
    ids = [int(i) for i in ROW.findall((BUGS / "_index.md").read_text())]
    twice = sorted({i for i in ids if ids.count(i) > 1})
    assert twice == [], f"B-ids with more than one index row: {twice}; keep one each, then {FIX}"
    backwards = [(a, b) for a, b in zip(ids, ids[1:]) if b < a]
    assert backwards == [], f"index rows out of id order at {backwards[:5]}: {FIX}"


def test_no_two_ledger_files_share_an_id():
    by_id = {}
    for f in BUGS.glob("B-*.md"):
        by_id.setdefault(int(re.match(r"B-(\d+)", f.name).group(1)), []).append(f.name)
    shared = {i: sorted(names) for i, names in by_id.items() if len(names) > 1}
    assert shared == {}, f"ledger files sharing an id (renumber one; ids are reserved per batch): {shared}"


def test_the_sort_script_orders_rows_and_drops_exact_duplicates():
    import importlib.util

    path = BUGS.parents[2] / "backend" / "scripts" / "sort_bug_index.py"
    spec = importlib.util.spec_from_file_location("sort_bug_index", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    text = "# head\n\n- [B-010](b) — x\n- [B-002](a) — y\n- [B-010](b) — x\n"
    new, clashes = module.sort_index(text)
    assert new == "# head\n\n- [B-002](a) — y\n- [B-010](b) — x\n" and clashes == []
    _, clashes = module.sort_index("- [B-003](c) — one\n- [B-003](c) — other\n")
    assert clashes == [3]
