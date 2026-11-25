"""CALENDAR-EVENT-DETAIL-41 (rule 27): the coach's "Aula cheia" push carries the calendar deep link
of rule 10, `/calendar?classId=lessoninstance-<id>&date=<YYYY-MM-DD>`, not `?classInstanceId=<id>`
(a key the calendar never reads). Seed and helpers are PAD-131's."""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _seed
from padel_app.tests.test_pad131_join_requests import _config, _request, _student


@pytest.fixture
def pushes(monkeypatch):
    sent = []
    monkeypatch.setattr(
        "padel_app.utils.push_notifications.send_push_notification",
        lambda **kw: sent.append(kw),
    )
    return sent


def _fill(app, ids, instance_id, count):
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol

    with app.app_context():
        instance = db.session.get(LessonInstance, instance_id)
        for i in range(count):
            pid = _add_student(ids["coach_id"], f"filler{instance_id}-{i}", level_id=ids["level_ids"]["5"])
            db.session.commit()
            enrol(pid, instance, "coach")


def _supersede(app, instance_id):
    from padel_app.models import LessonInstance
    from padel_app.services.class_join_request_service import supersede_pending_requests

    with app.app_context():
        instance = db.session.get(LessonInstance, instance_id)
        closed = supersede_pending_requests(instance)
        db.session.commit()
        return len(closed), instance.start_datetime.date().isoformat()


@pytest.mark.criterion("CALENDAR-EVENT-DETAIL-41")
def test_the_class_full_push_for_a_one_off_class_opens_that_class(app, pushes):
    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    asker = _student(app, ids, "asker")
    _request(app, ids, asker)
    _fill(app, ids, ids["instance_id"], 4)
    closed, date = _supersede(app, ids["instance_id"])
    assert closed == 1
    urls = [p["url"] for p in pushes if p.get("url", "").startswith("/calendar")]
    assert urls == [f"/calendar?classId=lessoninstance-{ids['instance_id']}&date={date}"]
    # Rule 27: the same string `class_href` builds for this class, so the two cannot drift.
    from padel_app.helpers.dashboard.coach_home import class_href

    assert urls == [class_href({"id": f"lessoninstance-{ids['instance_id']}", "date": date})]


@pytest.mark.criterion("CALENDAR-EVENT-DETAIL-41")
def test_the_class_full_push_for_a_series_occurrence_opens_that_occurrence(app, pushes):
    from padel_app.models import ClassJoinRequest
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.lessons import Lesson

    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    with app.app_context():
        lesson = db.session.get(Lesson, ids["lesson_id"])
        db.session.add(Association_CoachLesson(coach_id=ids["coach_id"], lesson_id=lesson.id))
        lesson.is_recurring = True
        lesson.recurrence_rule = '{"frequency": "weekly", "daysOfWeek": [%d]}' % ((lesson.start_datetime.weekday() + 1) % 7)
        lesson.recurrence_end = (lesson.start_datetime + timedelta(weeks=6)).date()
        db.session.commit()
        next_week = (lesson.start_datetime + timedelta(weeks=1)).date()
    asker = _student(app, ids, "asker")
    rid, _, _ = _request(app, ids, asker, model="Lesson", original_id=ids["lesson_id"], date=next_week.isoformat())
    with app.app_context():
        occurrence_id = db.session.get(ClassJoinRequest, rid).lesson_instance_id
    assert occurrence_id != ids["instance_id"], "the request materialised next week's occurrence"
    _fill(app, ids, occurrence_id, 4)
    closed, date = _supersede(app, occurrence_id)
    assert closed == 1 and date == next_week.isoformat()
    urls = [p["url"] for p in pushes if p.get("url", "").startswith("/calendar")]
    assert urls == [f"/calendar?classId=lessoninstance-{occurrence_id}&date={next_week.isoformat()}"]
    from padel_app.helpers.dashboard.coach_home import class_href

    assert urls == [class_href({"id": f"lessoninstance-{occurrence_id}", "date": next_week.isoformat()})]
