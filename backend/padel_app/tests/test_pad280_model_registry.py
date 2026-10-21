"""PAD-280 (data-model audit §13) — the model layer has no dead-code traps left.

Before PAD-280:

* Presence assigned `__table_args__` twice, silently dropping the first;
* four migration docstrings named the wrong parent revision.

(The registry and generic-editor checks this file once held went with the
editor and the `MODELS` registry in PAD-550.)
"""
import ast
import pathlib
import re

import pytest

VERSIONS = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"


def test_presence_keeps_its_unique_constraint_and_extend_existing():
    from padel_app.models import Presence

    args = Presence.__table_args__
    assert isinstance(args, tuple) and isinstance(args[-1], dict), args
    assert args[-1].get("extend_existing") is True
    names = {getattr(item, "name", None) for item in args[:-1]}
    assert "uq_presence_player_lesson_instance" in names


def _assigned(source, name):
    """The literal value assigned to a module-level `name`, or None.

    Read with the parser, not a regex: a merge revision's `down_revision` is a
    tuple that spans several lines."""
    for node in ast.parse(source).body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == name for target in node.targets
        ):
            return ast.literal_eval(node.value)
    return None


def _ids(value):
    if value is None:
        return []
    if isinstance(value, str):
        value = re.split(r"[\s,]+", value)
    return sorted(item for item in value if item and item != "None")


def docstring_mismatch(source):
    """None when the docstring's `Revises:` / `Revision ID:` agree with the
    code's `down_revision` / `revision`; otherwise a one-line explanation."""
    revises = re.search(r"^Revises:[ \t]*(.*)$", source, re.M)
    documented_id = re.search(r"^Revision ID:[ \t]*(\S+)", source, re.M)
    if revises is not None:
        documented = _ids(revises.group(1))
        real = _ids(_assigned(source, "down_revision"))
        if documented != real:
            return f"docstring says Revises: {revises.group(1)!r}, code says down_revision = {real}"
    if documented_id is not None and documented_id.group(1) != _assigned(source, "revision"):
        return f"docstring says Revision ID: {documented_id.group(1)}, code says {_assigned(source, 'revision')}"
    return None


def test_the_docstring_check_reads_multi_line_merge_revisions():
    merge = (
        '"""Merge\n\nRevision ID: m1\nRevises: a1, b2\n"""\n'
        'revision = "m1"\ndown_revision = (\n    "a1",\n    "b2",\n)\n'
    )
    assert docstring_mismatch(merge) is None
    assert docstring_mismatch(merge.replace("Revises: a1, b2", "Revises: a1")) is not None
    initial = '"""Initial\n\nRevision ID: i0\nRevises:\n"""\nrevision = "i0"\ndown_revision = None\n'
    assert docstring_mismatch(initial) is None
    wrong_parent = '"""x\n\nRevision ID: c3\nRevises: zz\n"""\nrevision = "c3"\ndown_revision = "b2"\n'
    assert "down_revision" in docstring_mismatch(wrong_parent)


@pytest.mark.parametrize("path", sorted(VERSIONS.glob("*.py")), ids=lambda p: p.name)
def test_migration_docstrings_name_their_real_parent(path):
    assert docstring_mismatch(path.read_text()) is None, docstring_mismatch(path.read_text())
