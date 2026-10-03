"""B-275 (PAD-508): a class time is a real HH:MM or the request is refused, naming the field.

The web sheet's native time input reads "" once a segment is cleared (Backspace on the hour), and the
sheet sent that "" as is: `add_class` then raised a ValueError inside `build_datetime` — a 500 the coach
saw as a generic failure. An empty, absent or malformed time now answers 400 naming the field, as the
PAD-387/390 family does for an empty name or capacity, on the create and the edit route, and nothing is
written.
"""
import pytest

from padel_app.tests.test_pad367_falsy_values_at_the_route import (  # noqa: F401
    ABSENT_KEY,
    _add_class,
    _class_row,
    _class_world,
    _edit_class,
    _jwt_secret,
    _lesson_count,
)

BAD = ["", "  ", None, "9", "25:00", "09:60", "9h30", "09:00:00x", ABSENT_KEY]
IDS = ["empty", "blank", "null", "one-digit", "hour-25", "minute-60", "text", "trailing", "absent"]


@pytest.mark.parametrize("field,column", [("startTime", "start_time"), ("endTime", "end_time")])
@pytest.mark.parametrize("value", BAD, ids=IDS)
def test_add_class_with_a_time_that_is_not_hh_mm_is_refused(app, client, field, column, value):
    """Criterion "A class time that is not HH:MM is refused, not a 500"."""
    world = _class_world(app, client)
    before = _lesson_count(app)

    res = _add_class(client, world, **{field: value})

    assert res.status_code == 400, res.get_data(as_text=True)
    assert res.get_json() == {"error": "invalid_fields", "fields": [column]}
    assert _lesson_count(app) == before


@pytest.mark.parametrize("value", ["00:00", "07:05", "23:59"])
def test_add_class_takes_any_real_hh_mm(app, client, value):
    world = _class_world(app, client)
    assert _add_class(client, world, startTime=value, endTime="23:59" if value != "23:59" else "23:59").status_code == 200


@pytest.mark.parametrize("field,column", [("startTime", "start_time"), ("endTime", "end_time")])
@pytest.mark.parametrize("value", ["", None, "9", "25:00"], ids=["empty", "null", "one-digit", "hour-25"])
def test_edit_class_with_a_time_that_is_not_hh_mm_is_refused_and_nothing_is_written(app, client, field, column, value):
    world = _class_world(app, client)
    before = _class_row(app, world["lesson_id"])

    res = _edit_class(client, world, {field: value, "color": "#abcdef"})

    assert res.status_code == 400, res.get_data(as_text=True)
    assert res.get_json() == {"error": "invalid_fields", "fields": [column]}
    assert _class_row(app, world["lesson_id"]) == before


def test_edit_class_a_real_time_is_still_written(app, client):
    world = _class_world(app, client)
    assert _edit_class(client, world, {"startTime": "18:30", "endTime": "19:30"}).status_code == 201
