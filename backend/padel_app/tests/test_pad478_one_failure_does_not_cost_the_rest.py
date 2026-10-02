"""
PAD-478 (notifications.config rules 10a and 10c), third review of #496.

The derivation can now FAIL in a new way: the primary coach's lock is bounded, and a
derivation that cannot get it raises. That must cost only what it has to:
- the startup re-arm and the daily pass go on to the next coach;
- creating or editing a class, which is committed before its jobs are derived, still
  answers as saved. The daily pass derives the jobs again.
"""
from datetime import datetime

import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad256_reminder_clock import _seed

pytestmark = pytest.mark.usefixtures("no_test_may_hang")

NOW_UTC = datetime(2027, 7, 10, 10, 0)
FIRST_CLASS = datetime(2027, 7, 13, 18, 0)
SECOND_CLASS = datetime(2027, 7, 14, 18, 0)


@pytest.fixture
def two_coaches(app, live_scheduler, monkeypatch):
    """Two coaches, one class each, each class also reachable through its lesson."""
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.lesson_instances import LessonInstance

    pin_clock(monkeypatch, NOW_UTC)
    with app.app_context():
        first, _s1, first_instance = _seed(app, FIRST_CLASS)
        second, _s2, second_instance = _seed(app, SECOND_CLASS)
        for coach_id, instance_id in ((first, first_instance), (second, second_instance)):
            lesson_id = LessonInstance.query.get(instance_id).lesson_id
            db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=lesson_id))
        db.session.commit()
        yield {"first": first, "second": second, "second_instance": second_instance,
               "module": live_scheduler, "sched": live_scheduler._scheduler}


def _fail_for(module, monkeypatch, name, coach_id):
    real = getattr(module, name)

    def maybe_fail(cid, *args, **kwargs):
        if cid == coach_id:
            raise RuntimeError(f"the jobs of coach {cid} have been locked for over 30 s")
        return real(cid, *args, **kwargs)

    monkeypatch.setattr(module, name, maybe_fail)


def test_the_startup_pass_goes_on_after_one_coach_fails(app, two_coaches, monkeypatch, caplog):
    import logging

    module = two_coaches["module"]
    _fail_for(module, monkeypatch, "_reschedule_for_coach", two_coaches["first"])

    with caplog.at_level(logging.WARNING):
        module._startup_reschedule(app)

    assert two_coaches["sched"].get_job(f"reminder_{two_coaches['second_instance']}") is not None
    assert any(f"coach {two_coaches['first']}" in r.getMessage() for r in caplog.records)


def test_the_daily_pass_goes_on_after_one_coach_fails(two_coaches, monkeypatch, caplog):
    import logging

    module = two_coaches["module"]
    _fail_for(module, monkeypatch, "_schedule_lesson_occurrences_for_coach", two_coaches["first"])

    with caplog.at_level(logging.WARNING):
        module._run_extend_schedule_window()

    assert two_coaches["sched"].get_job(f"reminder_{two_coaches['second_instance']}") is not None
    assert any(f"coach {two_coaches['first']}" in r.getMessage() for r in caplog.records)


def _derivation_fails(module, monkeypatch):
    def locked(*_args, **_kwargs):
        raise RuntimeError("the jobs of coach 1 have been locked by another derivation for over 30 s")

    monkeypatch.setattr(module, "schedule_lesson_reminder_jobs", locked)


def test_creating_a_class_answers_as_saved_when_its_jobs_cannot_be_derived(two_coaches, monkeypatch):
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import add_class_service

    _derivation_fails(two_coaches["module"], monkeypatch)
    coach, club = db.session.get(Coach, two_coaches["first"]), Club.query.first()

    lesson = add_class_service(
        {"name": "Saved anyway", "classType": "private", "maxPlayers": 1, "startTime": "10:00",
         "endTime": "11:00", "isRecurring": False, "playerIds": [], "date": "2027-08-02"},
        coach, club,
    )

    assert Lesson.query.filter_by(title="Saved anyway").count() == 1
    assert lesson.id is not None


def test_editing_a_series_answers_as_saved_when_its_jobs_cannot_be_derived(two_coaches, monkeypatch):
    import json
    from datetime import timedelta

    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import edit_class_service

    lesson = db.session.get(Lesson, LessonInstance.query.get(two_coaches["second_instance"]).lesson_id)
    lesson.is_recurring = True
    lesson.recurrence_rule = json.dumps({"frequency": "weekly", "daysOfWeek": [(lesson.start_datetime.weekday() + 1) % 7]})
    lesson.recurrence_end = (lesson.start_datetime + timedelta(weeks=6)).date()
    db.session.commit()
    _derivation_fails(two_coaches["module"], monkeypatch)

    result, status = edit_class_service({
        "event": {"model": "Lesson", "originalId": lesson.id, "date": lesson.start_datetime.date().isoformat()},
        "scope": "future",
        "updates": {"name": "Renamed anyway"},
    })

    assert status in (200, 201), result
    assert db.session.get(Lesson, result["id"]).title == "Renamed anyway"
