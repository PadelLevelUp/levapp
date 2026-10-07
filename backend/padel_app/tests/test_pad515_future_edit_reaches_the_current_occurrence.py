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


def _noon_before(day):
    """The series walk skips occurrences that have ended (classes.edit rule 9), so the clock is
    pinned to the day before the series starts. The shared fixture starts the series at the next
    hour, tomorrow: run after 23:00 it is a 23:00–24:00 class whose stored end reads 00:00 of its
    own date, which the wall clock already counts as over (wall-clock-tests-fail-overnight)."""
    return datetime.combine(day - timedelta(days=1), datetime.min.time()) + timedelta(hours=12)


def _edit(app, model, original_id, day, scope, updates, now=None):
    from padel_app.services.lesson_service import edit_class_service

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), \
            patch("padel_app.utils.dates.club_now_naive", return_value=now or _noon_before(day)), \
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

    with patch("padel_app.utils.dates.club_now_naive", return_value=_noon_before(day)):
        result, status = _edit_instance(app, instance_id, day, "future", {"addPlayers": [bruno]})
    assert status == 201, result
    with app.app_context():
        assert bruno in _presences(instance_id)


# ── #564 review: what a series edit must NOT do to the occurrences it walks ──


def test_a_series_removal_keeps_a_validated_presence(app):
    """The coach's validated record on an occurrence is theirs to change on the attendance
    sheet; a "this and future" removal does not delete it."""
    from padel_app.models import Presence

    ana, bruno, lesson_id, day = _setup(app)
    instance_id = _materialise(app, lesson_id, day)
    with app.app_context():
        row = Presence.query.filter_by(player_id=ana, lesson_instance_id=instance_id).one()
        row.status = "present"
        row.validated = True
        db.session.commit()
    result, status = _edit(app, "Lesson", lesson_id, day, "future", {"removePlayers": [ana]})
    assert status == 201, result
    with app.app_context():
        assert ana not in _roster(lesson_id)
        kept = Presence.query.filter_by(player_id=ana, lesson_instance_id=instance_id).one_or_none()
        assert kept is not None and kept.validated and kept.status == "present"


def test_a_series_edit_leaves_an_ended_occurrence_alone(app):
    ana, bruno, lesson_id, day = _setup(app)
    first = _materialise(app, lesson_id, day)
    later = _materialise(app, lesson_id, day + timedelta(weeks=1))
    after_first = datetime.combine(day, datetime.min.time()) + timedelta(days=1)
    result, status = _edit(app, "Lesson", lesson_id, day, "future", {"addPlayers": [bruno]}, now=after_first)
    assert status == 201, result
    with app.app_context():
        assert bruno not in _presences(first), "an ended occurrence is a record"
        assert bruno in _presences(later)


def test_a_series_edit_leaves_a_canceled_occurrence_alone(app):
    from padel_app.models import LessonInstance

    ana, bruno, lesson_id, day = _setup(app)
    canceled = _materialise(app, lesson_id, day)
    with app.app_context():
        db.session.get(LessonInstance, canceled).status = "canceled"
        db.session.commit()
    result, status = _edit(app, "Lesson", lesson_id, day, "future", {"addPlayers": [bruno]})
    assert status == 201, result
    with app.app_context():
        assert bruno not in _presences(canceled)


def test_a_series_add_tells_the_student_once(app):
    """PAD-330: added to the series, told once — not once more per materialised occurrence."""
    from padel_app.tests.test_pad330_the_student_is_told import _added_messages

    ana, bruno, lesson_id, day = _setup(app)
    _materialise(app, lesson_id, day)
    _materialise(app, lesson_id, day + timedelta(weeks=1))
    before = len(_added_messages(app))
    result, status = _edit(app, "Lesson", lesson_id, day, "future", {"addPlayers": [bruno]})
    assert status == 201, result
    assert len(_added_messages(app)) - before == 1
