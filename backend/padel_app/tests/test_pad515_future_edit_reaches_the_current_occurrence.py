"""PAD-515 (classes.edit rule 9; B-343, id unconfirmed): "this and all future" reaches the
occurrence the coach is on and every occurrence already materialised from it on — whichever
model the client names for the event.

The web sheet and the iOS screen keep `event.model = "Lesson"` for an occurrence of a series
even after it has been materialised (opening it, confirming attendance, an auto-invite — the
PAD-335 seam that B-046 named for the single scope). On that path the future edit changed the
series roster only, so the student appeared from the next virtual occurrence on and the class
the coach was looking at stayed as it was. The `LessonInstance` path already walked the
materialised occurrences from the boundary; this makes the `Lesson` path do the same.
"""
import json
from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import PATCHES, _seed_coach_and_student
from padel_app.tests.test_pad259_enrolment import _extra_player, _materialise
from padel_app.tests.test_pad474_participant_edit_scope import _presences, _roster, _seed_weekly_series


def _edit(app, model, original_id, day, scope, updates):
    from padel_app.services.lesson_service import edit_class_service

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), \
            patch("padel_app.utils.expo_push.send_expo_push_to_user"), \
            patch("padel_app.scheduler._maybe_schedule_instance"), \
            patch("padel_app.scheduler._maybe_schedule_lesson"), \
            patch("padel_app.scheduler.cancel_lesson_reminder_jobs"), \
            patch("padel_app.scheduler.schedule_lesson_reminder_jobs"), \
            patch("padel_app.scheduler.prune_lesson_reminder_jobs"), \
            patch("padel_app.scheduler.move_lesson_reminder_jobs"):
        result, status = edit_class_service({
            "event": {"model": model, "originalId": original_id, "date": day.isoformat()},
            "scope": scope,
            "updates": updates,
        })
        db.session.commit()
        return result, status


def _setup(app):
    ids = _seed_coach_and_student(app)
    bruno = _extra_player(app, "Bruno")
    lesson_id, day = _seed_weekly_series(app, ids["coach_id"], [ids["student_id"]])
    return ids["student_id"], bruno, lesson_id, day


def test_future_add_on_the_series_reaches_the_materialised_current_occurrence(app):
    """The ticket: the occurrence the coach is on is already materialised, the client names
    the series, scope future — the student must be on THIS occurrence too."""
    ana, bruno, lesson_id, day = _setup(app)
    instance_id = _materialise(app, lesson_id, day)
    result, status = _edit(app, "Lesson", lesson_id, day, "future", {"addPlayers": [bruno]})
    assert status == 201, result
    with app.app_context():
        assert bruno in _roster(lesson_id)
        assert bruno in _presences(instance_id), "the current occurrence was skipped"
        assert ana in _presences(instance_id)


def test_future_add_on_the_series_reaches_later_materialised_occurrences_too(app):
    ana, bruno, lesson_id, day = _setup(app)
    current = _materialise(app, lesson_id, day)
    next_week = _materialise(app, lesson_id, day + timedelta(weeks=1))
    result, status = _edit(app, "Lesson", lesson_id, day, "future", {"addPlayers": [bruno]})
    assert status == 201, result
    with app.app_context():
        assert bruno in _presences(current)
        assert bruno in _presences(next_week)


def test_future_add_on_a_later_series_occurrence_leaves_earlier_materialised_ones_alone(app):
    ana, bruno, lesson_id, day = _setup(app)
    first = _materialise(app, lesson_id, day)
    second_day = day + timedelta(weeks=1)
    second = _materialise(app, lesson_id, second_day)
    result, status = _edit(app, "Lesson", lesson_id, second_day, "future", {"addPlayers": [bruno]})
    assert status == 201, result
    with app.app_context():
        assert bruno not in _presences(first)
        assert bruno in _presences(second)
        # The series forked at the second occurrence; the first stays on the original roster.
        assert bruno not in _roster(lesson_id)
        assert bruno in _roster(result["id"])


def test_future_remove_on_the_series_reaches_the_materialised_current_occurrence(app):
    ana, bruno, lesson_id, day = _setup(app)
    instance_id = _materialise(app, lesson_id, day)
    with app.app_context():
        assert ana in _presences(instance_id)
    result, status = _edit(app, "Lesson", lesson_id, day, "future", {"removePlayers": [ana]})
    assert status == 201, result
    with app.app_context():
        assert ana not in _roster(lesson_id)
        assert ana not in _presences(instance_id)


def test_the_instance_path_still_reaches_the_current_occurrence(app):
    """The control: the `LessonInstance` path already did this (PAD-474)."""
    ana, bruno, lesson_id, day = _setup(app)
    instance_id = _materialise(app, lesson_id, day)
    from padel_app.tests.test_pad474_participant_edit_scope import _edit as _edit_instance

    result, status = _edit_instance(app, instance_id, day, "future", {"addPlayers": [bruno]})
    assert status == 201, result
    with app.app_context():
        assert bruno in _presences(instance_id)
