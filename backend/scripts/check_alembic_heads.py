#!/usr/bin/env python3
"""PAD-265 / audit H13 — fail fast on more than one Alembic head.

Also fails on a duplicate revision id or a down_revision that points nowhere.
Stdlib only: it reads the revision files as text (ast) and never imports them,
so it needs no install and no database, and runs in seconds on a bare CI runner
(.github/workflows/migration-heads.yaml). Applying the migrations for real is
backend-tests.yaml's postgres job (PAD-278); this answers the earlier question,
"is the history linear?", with a message that says how to fix it.

Usage: python backend/scripts/check_alembic_heads.py [versions_dir]
"""
import ast
import sys
from pathlib import Path

DEFAULT_DIR = Path(__file__).resolve().parent.parent / "migrations" / "versions"


def _assigned_literal(tree, name):
    for node in tree.body:
        if isinstance(node, ast.Assign):
            targets, value = node.targets, node.value
        elif isinstance(node, ast.AnnAssign) and node.value is not None:
            targets, value = [node.target], node.value
        else:
            continue
        for target in targets:
            if isinstance(target, ast.Name) and target.id == name:
                return ast.literal_eval(value)
    raise KeyError(name)


def read_revisions(versions_dir):
    """{revision_id: (file_name, down_revisions)} plus the problems found reading them."""
    revisions, problems = {}, []
    for path in sorted(Path(versions_dir).glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        try:
            rev = _assigned_literal(tree, "revision")
            down = _assigned_literal(tree, "down_revision")
        except KeyError as missing:
            problems.append(f"{path.name}: no `{missing.args[0]}` assignment")
            continue
        downs = () if down is None else ((down,) if isinstance(down, str) else tuple(down))
        if rev in revisions:
            problems.append(
                f"duplicate revision id {rev!r}: {revisions[rev][0]} and {path.name}"
            )
            continue
        revisions[rev] = (path.name, downs)
    return revisions, problems


def check(versions_dir):
    """Return (heads, problems); an empty problems list means the history is sound."""
    revisions, problems = read_revisions(versions_dir)
    referenced = set()
    for name, downs in revisions.values():
        for down in downs:
            referenced.add(down)
            if down not in revisions:
                problems.append(f"{name}: down_revision {down!r} does not exist")
    heads = sorted(rev for rev in revisions if rev not in referenced)
    if len(heads) != 1:
        listed = ", ".join(f"{h} ({revisions[h][0]})" for h in heads) or "none"
        problems.append(f"expected exactly one head, found {len(heads)}: {listed}")
    return heads, problems


def main(argv):
    versions_dir = Path(argv[1]) if len(argv) > 1 else DEFAULT_DIR
    heads, problems = check(versions_dir)
    if problems:
        print("Alembic history check FAILED:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        print(
            "Fix: join the heads with one merge revision "
            '(`flask db merge heads -m "merge <a> and <b>"`), and give every new '
            "revision a random id (see backend/migrations/README).",
            file=sys.stderr,
        )
        return 1
    count = len(read_revisions(versions_dir)[0])
    print(f"Alembic history OK: {count} revisions, one head ({heads[0]}).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
