"""PAD-280 (data-model audit §13) — the model registry has no naming or
dead-code traps left.

`padel_app.models.MODELS` is what the generic admin editor (`/api/editor/*`),
the legacy editor and `api.py` look models up in, always by
`model_name.lower()`. Before PAD-280:

* Message was registered as "lessage", so `/api/editor/message/*` was a 404;
* DeviceToken's form declared a field type the form layer rejects, and
  LessonInstanceTraining (a plain association table, no editor mixin, no `id`)
  was registered at all — both made the editor's schema route a 500;
* MessageReaction, MessageReport and BlockedUser had no page_title/model_name;
* Presence assigned `__table_args__` twice, silently dropping the first;
* four migration docstrings named the wrong parent revision.

These tests walk the whole registry with the SAME calls the editor makes, at
the model level, so they do not depend on how the editor routes are gated.
"""
import ast
import pathlib
import re

import pytest

VERSIONS = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"


def test_every_registry_key_is_the_lowercased_class_name():
    from padel_app.models import MODELS

    wrong = {key: cls.__name__ for key, cls in MODELS.items() if key != cls.__name__.lower()}
    assert wrong == {}, f"registry keys that do not follow the rule: {wrong}"


def test_message_is_reachable_in_the_editor_under_message():
    from padel_app.models import MODELS, Message

    assert MODELS.get("message") is Message


def test_every_registered_model_has_a_title_and_a_model_name_matching_its_key():
    from padel_app.models import MODELS

    wrong = {}
    for key, cls in MODELS.items():
        title = getattr(cls, "page_title", None)
        name = getattr(cls, "model_name", None)
        if not isinstance(title, str) or not isinstance(name, str) or name.lower() != key:
            wrong[key] = (title, name)
    assert wrong == {}, f"models missing page_title/model_name or with a mismatched model_name: {wrong}"


def test_every_registered_model_survives_the_editor_calls(app):
    """`/api/editor/<model>/schema` builds the create form and every field's
    dict; `/api/editor/<model>` calls display_all_info() and orders by `id`."""
    from padel_app.models import MODELS

    broken = {}
    with app.app_context():
        for key, cls in MODELS.items():
            try:
                form = cls().get_create_form()
                [field.get_field_dict() for field in form.fields]
                cls().display_all_info()
                assert hasattr(cls, "id"), "no id column"
            except NotImplementedError:
                # The editor answers [] for models without a form; that is fine.
                pass
            except Exception as exc:  # noqa: BLE001 — report every broken model at once
                broken[key] = f"{type(exc).__name__}: {exc}"
    assert broken == {}, f"models the editor cannot serve: {broken}"


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
