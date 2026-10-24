#!/usr/bin/env python3
"""PAD-711 — warn when a migration a PR adds is not expand-only (delivery.zero-downtime-deploy rule 12).

The deploy migrates while the previous release still serves (PAD-691), so a revision must work
with the code before it: a new column is nullable or has a server default; a drop or rename lands
a release after the code stopped reading the column; anything else ships with
`rollout: stop-first`. This reads each named revision's `upgrade()` (never `downgrade()`, which
drops by design) and flags:

- `drop_column` and `drop_table` (an index or constraint drop does not break old code);
- a rename: `alter_column(..., new_column_name=...)` or `rename_table`;
- `alter_column(..., type_=...)` (a type change) or `alter_column(..., nullable=False)`;
- `add_column` of a `nullable=False` column with no `server_default`;
- raw SQL in `op.execute(...)` doing any of those (DROP COLUMN/TABLE, RENAME, SET NOT NULL,
  ALTER COLUMN ... TYPE).

Calls on `op` and on a `batch_alter_table` handle both count. Warn-only: every finding is a
`::warning` annotation and a line in the job summary, and the exit is always 0. Stdlib only,
reads the files as text (ast), never imports them.

Usage: python backend/scripts/check_expand_contract.py <migration.py> ...
"""
import ast
import os
import re
import sys

REMINDER = ("Ship it with `rollout: stop-first`, or split it: expand in this release, "
            "contract in the next one (delivery.zero-downtime-deploy rule 12).")

RAW_SQL = re.compile(
    r"\bDROP\s+(COLUMN|TABLE)\b|\bRENAME\s+(COLUMN|TO)\b|\bSET\s+NOT\s+NULL\b|\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b",
    re.IGNORECASE,
)


def _kw(call, name):
    return next((k.value for k in call.keywords if k.arg == name), None)


def _is_false(node):
    return isinstance(node, ast.Constant) and node.value is False


def _column_call(node):
    """The `sa.Column(...)`/`Column(...)` call among add_column's arguments, if any."""
    for arg in node.args:
        if isinstance(arg, ast.Call):
            f = arg.func
            if (isinstance(f, ast.Attribute) and f.attr == "Column") or (isinstance(f, ast.Name) and f.id == "Column"):
                return arg
    return None


def _strings(node):
    return [n.value for n in ast.walk(node) if isinstance(n, ast.Constant) and isinstance(n.value, str)]


def findings_in(source, filename="<migration>"):
    """[(line, message)] for the upgrade() of one revision file."""
    tree = ast.parse(source, filename=filename)
    upgrade = next((n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "upgrade"), None)
    if upgrade is None:
        return []
    found = []
    for node in ast.walk(upgrade):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
            continue
        op = node.func.attr
        if op in ("drop_column", "drop_table"):
            found.append((node.lineno, f"`{op}`: the previous release may still read it"))
        elif op == "rename_table":
            found.append((node.lineno, "`rename_table`: the previous release still uses the old name"))
        elif op == "alter_column":
            if _kw(node, "new_column_name") is not None:
                found.append((node.lineno, "`alter_column(new_column_name=...)`: a rename the previous release does not know"))
            if _kw(node, "type_") is not None:
                found.append((node.lineno, "`alter_column(type_=...)`: a type change under the previous release"))
            if _is_false(_kw(node, "nullable")):
                found.append((node.lineno, "`alter_column(nullable=False)`: the previous release may still write NULL"))
        elif op == "add_column":
            col = _column_call(node)
            if col is not None and _is_false(_kw(col, "nullable")) and _kw(col, "server_default") is None:
                found.append((node.lineno, "`add_column` of a NOT NULL column with no `server_default`: "
                                           "the previous release inserts rows without it"))
        elif op == "execute":
            for text in _strings(node):
                m = RAW_SQL.search(text)
                if m:
                    found.append((node.lineno, f"raw SQL `{m.group(0).upper()}`: not expand-only"))
                    break
    return sorted(set(found))


def main(paths):
    lines = []
    for path in paths:
        try:
            with open(path, encoding="utf-8") as f:
                found = findings_in(f.read(), path)
        except (OSError, SyntaxError) as exc:
            print(f"::warning file={path}::expand/contract guard could not read it: {exc}")
            continue
        for line, message in found:
            print(f"::warning file={path},line={line}::{message}. {REMINDER}")
            lines.append(f"- `{path}:{line}`: {message}")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if lines:
        body = ["### Expand/contract: migrations this PR adds that are not expand-only", "",
                *lines, "", REMINDER, "", "Warn-only (PAD-711): this check never fails the PR."]
    else:
        body = [f"Expand/contract: {len(paths)} added migration(s), all expand-only."]
    print("\n".join(body))
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("\n".join(body) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
