"""Put the bug ledger index's rows back in id order (PAD-756).

Every session appends its `- [B-NNN](file) — …` row at the end of .cortex/compass/bugs/_index.md, so a
merge of two branches lands rows out of order, and a hand-resolved conflict can keep a row twice.
`test_bug_ledger_index_complete.py` fails on both; after resolving a merge, run:

    python3 backend/scripts/sort_bug_index.py

It sorts the rows by id and drops exact duplicate lines, leaving the header and every row's text as
written. Two different rows for one id are left for a person to resolve (it exits 1 naming them).
"""
import re
import sys
from pathlib import Path

INDEX = Path(__file__).resolve().parents[2] / ".cortex" / "compass" / "bugs" / "_index.md"
ROW = re.compile(r"^- \[B-(\d+)\]")


def sort_index(text):
    lines = text.split("\n")
    rows = [n for n, line in enumerate(lines) if ROW.match(line)]
    if not rows:
        return text, []
    first, last = rows[0], rows[-1]
    block = lines[first:last + 1]
    stray = [line for line in block if not ROW.match(line)]
    if stray:
        raise SystemExit(f"non-row lines inside the row block, fix by hand: {stray[:3]}")
    unique = list(dict.fromkeys(block))
    by_id = {}
    for line in unique:
        by_id.setdefault(int(ROW.match(line).group(1)), []).append(line)
    clashes = sorted(i for i, found in by_id.items() if len(found) > 1)
    ordered = sorted(unique, key=lambda line: int(ROW.match(line).group(1)))
    return "\n".join(lines[:first] + ordered + lines[last + 1:]), clashes


def main():
    text = INDEX.read_text()
    new, clashes = sort_index(text)
    if new != text:
        INDEX.write_text(new)
        print(f"sorted {INDEX.relative_to(INDEX.parents[3])}")
    if clashes:
        print(f"two different rows for: {', '.join(f'B-{i:03d}' for i in clashes)}; keep one each")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
