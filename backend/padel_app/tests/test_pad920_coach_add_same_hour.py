"""classes.instance-enrollment rule 15 (PAD-918): a coach's add that would put a student in two
classes at the same time, one of them new-engine, is refused whole with the clashes."""
import json
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed


@pytest.fixture
def coach_class(app, monkeypatch):
    """A coach on the new engine, with a new-engine class 20:00-21:00 and six students not in it."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.tests.helpers import pin_clock

    with app.app_context():
        pin_clock(monkeypatch, NOW)
        store, (session,), pids = _seed(app, players=7, capacity=8, side="right")
        coach_id = store.coach_of(session)
        db.session.add(NotificationConfig(coach_id=coach_id, auto_notify_enabled=True, engine_version="new",
                                          engine_switched_at=NOW - timedelta(days=1)))
        db.session.commit()
        yield store, coach_id, session, pids[1:]


def _class(coach_id, start, end, going=(), *, new_engine=False):
    """Another occurrence of ``coach_id`` with ``going`` on it; on the new engine when asked."""
    from padel_app.models import EngineSession
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.clubs import Club
    from padel_app.models.presences import Presence

    lesson = Lesson(title=f"Other {start:%H:%M}", start_datetime=start, end_datetime=end, is_recurring=False,
                    type="academy", max_players=8, color="#000", status="active", club_id=Club.query.first().id)
    db.session.add(lesson)
    db.session.flush()
    inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=end, max_players=8,
                          status="scheduled")
    db.session.add(inst)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach_id, lesson_instance_id=inst.id))
    for pid in going:
        db.session.add(Presence(player_id=int(pid), lesson_instance_id=inst.id, enrolment_source="coach"))
    if new_engine:
        db.session.add(EngineSession(lesson_instance_id=inst.id, coach_id=coach_id, alerted=[]))
    db.session.commit()
    return inst


def _other_coach():
    from padel_app.models import Coach, User

    user = User(name="Ana", username="coach_ana918", password="x", status="active")
    db.session.add(user)
    db.session.flush()
    coach = Coach(user_id=user.id)
    db.session.add(coach)
    db.session.commit()
    return coach.id


def _add(instance_id, players, *, scope="single", model="LessonInstance"):
    from padel_app.services.lesson_service import _edit_class_service

    data = {"event": {"model": model, "originalId": int(instance_id), "date": START.date().isoformat()},
            "scope": scope, "updates": {"addPlayers": [int(p) for p in players]}}
    return _edit_class_service(data)


def _on(instance_id, player):
    from padel_app.models.presences import Presence

    return Presence.query.filter_by(lesson_instance_id=int(instance_id), player_id=int(player)).first() is not None


@pytest.mark.criterion("CLASSES-INSTANCE-ENROLLMENT-29")
def test_a_coachs_add_at_a_busy_hour_is_refused_whole(coach_class):
    from padel_app.models.lesson_instances import LessonInstance

    store, coach_id, session, (busy, free, *_) = coach_class
    anas = _class(_other_coach(), START, START + timedelta(hours=1), [busy])

    result, status = _add(session, [busy, free])
    assert status == 409 and result["code"] == "busy_same_hour"
    assert [(c["playerId"], c["lessonInstanceId"], c["start"]) for c in result["clashes"]] == [
        (int(busy), anas.id, START.isoformat())]
    assert not _on(session, busy) and not _on(session, free)        # nothing saved

    lesson = db.session.get(LessonInstance, int(session)).lesson      # the class's series
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=lesson.id))
    lesson.is_recurring = True
    lesson.recurrence_rule = json.dumps({"frequency": "weekly", "daysOfWeek": [START.isoweekday() % 7]})
    db.session.commit()
    result, status = _add(lesson.id, [busy], scope="future", model="Lesson")
    assert status == 409 and result["clashes"][0]["lessonInstanceId"] == anas.id

    result, status = _add(session, [free])
    assert status == 200 and _on(session, free)


@pytest.mark.criterion("CLASSES-INSTANCE-ENROLLMENT-30")
def test_a_different_start_or_an_old_engine_class_is_not_refused(coach_class):
    store, coach_id, session, (partial, touching, old_only, other_coachs, *_) = coach_class
    _class(coach_id, START - timedelta(minutes=30), START + timedelta(minutes=30), [partial])
    _class(coach_id, START - timedelta(hours=1), START, [touching])
    _class(coach_id, START, START + timedelta(hours=1), [old_only])
    old_target = _class(coach_id, START, START + timedelta(hours=1))
    _class(_other_coach(), START, START + timedelta(hours=1), [other_coachs])

    assert _add(session, [partial])[1] == 409                         # a partial overlap, same coach
    assert _add(session, [other_coachs])[1] == 409                    # another coach, the same start
    assert _add(session, [touching])[1] == 200                        # ends as this one starts
    assert _add(old_target.id, [old_only])[1] == 200                  # old-engine classes only
