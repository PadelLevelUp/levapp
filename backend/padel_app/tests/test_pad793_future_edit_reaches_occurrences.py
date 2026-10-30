"""PAD-793 (B-709) — a "this and following" save of the notifications switch reaches the occurrences
already materialised from the boundary on (classes.edit rule 9, notifications.toggle-class rule 2).

`notifications_enabled` is NOT NULL on the occurrence and the engine reads it from the occurrence
alone (`send_class_reminders`, `trigger_invitations`): unlike `auto_invites` / `open_spots_visible`
it never inherits from the series. A future-scope edit wrote it on the series only, so the
occurrence the coach was looking at kept its old value: the save answered "Alterações guardadas"
and the switch came back off (prod: lesson 158 on, occurrence 596 off, 2026-10-29).

Each cell drops the session before reading, and keeps an occurrence before the boundary as the
control that must not change (R-032).
"""
import json
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _seed


def _series_with_three_occurrences(app, ids, *, enabled):
    """The seeded lesson as a weekly series with its first three occurrences materialised, the
    series and every occurrence at `enabled`. Returns the three instance ids, oldest first."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance

    with app.app_context():
        lesson = db.session.get(Lesson, ids["lesson_id"])
        lesson.is_recurring = True
        lesson.recurrence_rule = json.dumps({"frequency": "weekly", "daysOfWeek": [(lesson.start_datetime.weekday() + 1) % 7]})
        lesson.recurrence_end = (lesson.start_datetime + timedelta(weeks=8)).date()
        lesson.notifications_enabled = enabled
        db.session.commit()
        first = lesson.start_datetime.date()
        instances = [get_or_materialize_instance(lesson, first + timedelta(weeks=w)) for w in range(3)]
        for inst in instances:
            inst.notifications_enabled = enabled
        db.session.commit()
        return [inst.id for inst in instances]


def _edit(app, event, updates):
    from padel_app.services.lesson_service import edit_class_service

    with app.app_context():
        result, status = edit_class_service({"event": event, "scope": "future", "updates": updates})
        assert status in (200, 201), result
        db.session.remove()
        return result


def _flags(app, instance_ids):
    from padel_app.models.lesson_instances import LessonInstance

    with app.app_context():
        db.session.remove()
        return [db.session.get(LessonInstance, pk).notifications_enabled for pk in instance_ids]


def _event(app, model, instance_id, lesson_id):
    from padel_app.models.lesson_instances import LessonInstance

    with app.app_context():
        date = db.session.get(LessonInstance, instance_id).start_datetime.date().isoformat()
    original = instance_id if model == "LessonInstance" else lesson_id
    return {"model": model, "originalId": original, "date": date}


@pytest.mark.parametrize("model", ["LessonInstance", "Lesson"])
@pytest.mark.parametrize("enabled", [True, False], ids=["switched-on", "switched-off"])
def test_this_and_following_from_a_later_occurrence_reaches_it_and_the_ones_after(app, model, enabled):
    """The prod shape: the edit starts on the second occurrence, so the series forks."""
    from padel_app.models.lessons import Lesson

    ids = _seed(app)
    instance_ids = _series_with_three_occurrences(app, ids, enabled=not enabled)
    assert _flags(app, instance_ids) == [not enabled] * 3  # the subject exists before the act

    result = _edit(app, _event(app, model, instance_ids[1], ids["lesson_id"]), {"notificationsEnabled": enabled})

    with app.app_context():
        assert db.session.get(Lesson, result["id"]).notifications_enabled is enabled
    assert _flags(app, instance_ids) == [not enabled, enabled, enabled]


@pytest.mark.parametrize("model", ["LessonInstance", "Lesson"])
def test_this_and_following_from_the_first_occurrence_reaches_every_occurrence(app, model):
    """The same-lesson shape: the edit starts on the series' first date, so nothing forks (the
    coach's second save on lesson 158)."""
    ids = _seed(app)
    instance_ids = _series_with_three_occurrences(app, ids, enabled=False)

    _edit(app, _event(app, model, instance_ids[0], ids["lesson_id"]), {"notificationsEnabled": True})

    assert _flags(app, instance_ids) == [True, True, True]


def test_an_edit_that_does_not_name_the_switch_leaves_the_occurrences_alone(app):
    """Both shells send only the fields that changed (`edit-class-diff.ts`): absent is untouched."""
    ids = _seed(app)
    instance_ids = _series_with_three_occurrences(app, ids, enabled=False)

    _edit(app, _event(app, "LessonInstance", instance_ids[1], ids["lesson_id"]), {"color": "#123456"})

    assert _flags(app, instance_ids) == [False, False, False]
