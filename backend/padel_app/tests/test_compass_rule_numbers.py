"""The compass rule series has one file per number, and the number agrees with itself.

`R-026` was issued twice — `R-026-clickable-cards-are-real-controls` (2026-09-05) and
`R-026-backend-tests-on-both-databases` (2026-09-10) — by two sessions that each took the
next free number from a tree that did not yet have the other's. Nothing caught it: a rule's
number lives in three places (the filename, the `id:` field, the H1 heading) and
`cortex validate` checks none of them against each other, so a citation like "compass R-026"
silently meant two different rules depending on who read it.

This is the cheap guard. It lives in the backend suite because that is what runs on every pull
request, on both database backends — the rules themselves govern backend and frontend paths
alike, so no app-side suite is a more natural home than this one.

Deliberately NOT asserted: that every rule appears in `_index.md`. The index has been partial
since long before this test (it lists the two most recent rules only), and failing the suite on
that would be a demand for unrelated work rather than a guard against recurrence. The weaker
direction — every index entry resolves to a file — is asserted instead.
"""
import re
from pathlib import Path

RULES = Path(__file__).resolve().parents[3] / ".cortex" / "compass" / "rules"

ID_IN_FRONTMATTER = re.compile(r"^id:\s*(R-\d+)\s*$", re.M)
ID_IN_HEADING = re.compile(r"^#\s*(R-\d+)\s+—", re.M)
ID_IN_FILENAME = re.compile(r"^(R-\d+)-")
INDEX_LINK = re.compile(r"\((R-\d+-[a-z0-9-]+\.md)\)")


def _rule_files():
    assert RULES.is_dir(), f"compass rules not found at {RULES}"
    return sorted(p for p in RULES.glob("R-*.md"))


def test_the_rules_directory_is_found_and_not_empty():
    """A wrong path would make every other test in this file vacuously pass."""
    files = _rule_files()
    assert len(files) >= 20, f"only {len(files)} rule files found at {RULES}"


def test_no_number_is_issued_twice():
    seen = {}
    for path in _rule_files():
        number = ID_IN_FILENAME.match(path.name).group(1)
        seen.setdefault(number, []).append(path.name)
    clashes = {n: names for n, names in seen.items() if len(names) > 1}
    assert not clashes, f"one number, two rules: {clashes}"


def test_each_rule_agrees_with_itself_about_its_number():
    """Filename, `id:` and heading are three copies of one fact; a rename that
    updates only the filename is how a citation starts pointing at nothing."""
    disagreements = []
    for path in _rule_files():
        from_name = ID_IN_FILENAME.match(path.name).group(1)
        text = path.read_text()
        in_front = ID_IN_FRONTMATTER.search(text)
        in_head = ID_IN_HEADING.search(text)
        found = {
            "filename": from_name,
            "id:": in_front.group(1) if in_front else None,
            "heading": in_head.group(1) if in_head else None,
        }
        if len(set(found.values())) != 1:
            disagreements.append((path.name, found))
    assert not disagreements, f"a rule's number disagrees with itself: {disagreements}"


def test_every_index_entry_points_at_a_rule_that_exists():
    index = RULES / "_index.md"
    assert index.is_file()
    listed = set(INDEX_LINK.findall(index.read_text()))
    on_disk = {p.name for p in _rule_files()}
    missing = sorted(listed - on_disk)
    assert not missing, f"the index links rules that do not exist: {missing}"
