"""PAD-385 (step 0 of PAD-367, B-136) — `update_with_dict(values, write_none=True)`.

Today `update_with_dict` skips a None, so nothing a client sends can clear a column;
that is right for legacy-mode values, where None means "the client did not send it".
In present mode a None means "the client sent it empty", so the caller passes
`write_none=True`: a nullable column or ManyToOne is set to NULL, and a NOT NULL one is
REFUSED — before anything is written — so the route can answer 400 with the field
instead of dying on an IntegrityError. No production caller passes it yet.

Nullability is read from the mapped tables inside the tests, not assumed.
"""
from datetime import datetime

import pytest

from padel_app.model import NotNullableFieldError


def _block(**over):
    from padel_app.models import CalendarBlock

    values = dict(
        type="break", title="Almoço", description="fora", is_recurring=True,
        recurrence_rule="FREQ=WEEKLY", start_datetime=datetime(2026, 9, 21, 12), end_datetime=datetime(2026, 9, 21, 13),
    )
    values.update(over)
    return CalendarBlock(**values)


def test_the_columns_these_tests_lean_on_are_what_they_say(app):
    from padel_app.models import CalendarBlock, Court, Lesson

    with app.app_context():
        columns = CalendarBlock.__table__.c
        assert columns.title.nullable and columns.description.nullable and columns.recurrence_rule.nullable
        assert not columns.type.nullable and not columns.is_recurring.nullable
        assert Lesson.__table__.c.court_id.nullable and not Court.__table__.c.club_id.nullable


def test_default_a_none_leaves_the_column_alone_as_it_always_has(app):
    with app.app_context():
        block = _block()
        block.update_with_dict({"title": None, "description": None, "type": None})
        assert (block.title, block.description, block.type) == ("Almoço", "fora", "break")


def test_write_none_clears_a_nullable_column(app):
    with app.app_context():
        block = _block()
        block.update_with_dict({"title": None, "recurrence_rule": None}, write_none=True)
        assert block.title is None and block.recurrence_rule is None
        assert block.description == "fora"  # a key that is not in values is never touched


def test_write_none_still_writes_the_values_that_are_there_falsy_ones_included(app):
    with app.app_context():
        block = _block()
        block.update_with_dict({"title": "Pausa", "is_recurring": False}, write_none=True)
        assert block.title == "Pausa" and block.is_recurring is False


def test_write_none_refuses_a_not_null_column_and_writes_nothing(app):
    with app.app_context():
        block = _block()
        with pytest.raises(NotNullableFieldError) as refused:
            # `title` comes FIRST and is legal: it must not have been written when `type` is refused
            block.update_with_dict({"title": None, "type": None, "is_recurring": None}, write_none=True)
        assert refused.value.fields == ["type", "is_recurring"]
        assert (block.title, block.type, block.is_recurring) == ("Almoço", "break", True)


def test_write_none_clears_a_nullable_many_to_one_and_its_key(app):
    from padel_app.models import Lesson

    with app.app_context():
        lesson = Lesson(title="Aula", max_players=4, court_id=3)
        lesson.update_with_dict({"court": None}, write_none=True)
        assert lesson.court is None and lesson.court_id is None


def test_default_an_empty_many_to_one_is_skipped_as_it_always_has_been(app):
    from padel_app.models import Lesson

    with app.app_context():
        lesson = Lesson(title="Aula", max_players=4, court_id=3)
        lesson.update_with_dict({"court": None})
        assert lesson.court_id == 3


def test_write_none_refuses_a_many_to_one_whose_key_is_not_null(app):
    from padel_app.models import Court

    with app.app_context():
        court = Court(name="Campo 1", club_id=9)
        with pytest.raises(NotNullableFieldError) as refused:
            court.update_with_dict({"club": None, "name": "Campo 2"}, write_none=True)
        assert refused.value.fields == ["club"]
        assert (court.name, court.club_id) == ("Campo 1", 9)


def test_write_none_never_clears_a_password_or_a_collection(app):
    from padel_app.models import Lesson, User

    with app.app_context():
        user = User(name="Ana", username="ana", password="hash")
        user.update_with_dict({"password": None}, write_none=True)
        assert user.password == "hash"

        lesson = Lesson(title="Aula", max_players=4)
        collections = [rel.key for rel in Lesson.__mapper__.relationships if rel.uselist]
        assert collections, "Lesson has at least one collection relationship"
        before = list(getattr(lesson, collections[0]))
        lesson.update_with_dict({collections[0]: None}, write_none=True)
        assert list(getattr(lesson, collections[0])) == before


def test_the_app_answers_a_not_nullable_field_error_with_a_400_naming_the_fields(app):
    """Session-B's F2 on #366: without this, step 1's first refusal would be a 500. The
    handler is registered on the frontend_api blueprint; nothing raises it yet."""
    from padel_app.modules.frontend_api import bp

    handler = bp.error_handler_spec[None][None][NotNullableFieldError]
    with app.test_request_context("/api/app/edit_class"):
        response, status = handler(NotNullableFieldError(["type", "max_players"]))
    assert status == 400
    assert response.get_json() == {"error": "invalid_fields", "fields": ["type", "max_players"]}
