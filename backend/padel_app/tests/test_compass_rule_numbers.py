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

PAD-329 closed the gap this test originally left open. The index used to list only the two most
recent rules, so asserting completeness would have failed the suite as a demand for unrelated
work — a guard that does that gets disabled rather than satisfied. The backfill landed first;
completeness is asserted now, in both directions, so a rule added without its one-line hook is
caught by the author who added it rather than by the next person who cannot find it.
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


def test_the_index_and_the_directory_hold_the_same_rules():
    """Both directions (PAD-329). A link to a deleted rule sends a reader nowhere;
    a rule with no entry is invisible to anyone who reads the index first — which
    the index itself tells them to do."""
    index = RULES / "_index.md"
    assert index.is_file()
    listed = set(INDEX_LINK.findall(index.read_text()))
    on_disk = {p.name for p in _rule_files()}
    assert not sorted(listed - on_disk), (
        f"the index links rules that do not exist: {sorted(listed - on_disk)}"
    )
    assert not sorted(on_disk - listed), (
        "every rule needs a one-line hook in _index.md; missing: "
        f"{sorted(on_disk - listed)}"
    )


def test_every_index_entry_carries_a_hook():
    """A link with no hook after it is a filename, and the index exists so a reader
    can decide which rule to open without opening all of them.

    Length is a crude proxy for "says something" — nothing testable distinguishes a
    hook from a restated title — but it catches the failure that actually happens:
    an entry added in a hurry with three words after the dash. The threshold is low
    enough that any real sentence clears it."""
    index = (RULES / "_index.md").read_text()
    thin = [
        line.strip()
        for line in index.splitlines()
        if line.startswith("- [R-") and len(line.split(".md) — ")[-1].strip()) < 40
    ]
    assert not thin, f"index entries without a real hook: {thin}"
