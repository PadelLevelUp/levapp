"""B-302 — `_create_structural_vacancies` read the coach's configuration inside its class lock. For a
coach with no `notification_configs` row, `get_or_create_config` creates one and commits, and that
commit ended the lock before the never-filled vacancies were added: two creators each added their own.
(The twin of B-322, found by Session-B on PAD-541.) Latent on staging, because both callers make sure
the row exists first, so the cell calls the function directly on a config-less coach.

Postgres only: a lock is only visible with two real connections.
"""
import os
import threading
from datetime import datetime, timedelta

import pytest

from padel_app.sql_db import db

pytestmark = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="a lock is only visible with two real connections",
)


def _seed(app):
    """A coach with NO notification config, and a 2-place class nobody is on."""
    from padel_app.models import Coach, Lesson, LessonInstance, User
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.clubs import Club

    with app.app_context():
        u = User(name="B302 Coach", username="b302coach", email="b302@t.test", password="x", status="active")
        db.session.add(u)
        db.session.flush()
        coach = Coach(user_id=u.id)
        club = Club(name="B302", description="", location="Lisboa")
        db.session.add_all([coach, club])
        db.session.flush()
        start = datetime(2027, 7, 12, 18, 0)
        lesson = Lesson(title="B302", start_datetime=start, end_datetime=start + timedelta(hours=1),
                        is_recurring=False, type="academy", max_players=2, color="#000",
                        status="active", club_id=club.id)
        db.session.add(lesson)
        db.session.flush()
        inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                              max_players=2, status="scheduled", notifications_enabled=True)
        db.session.add(inst)
        db.session.flush()
        db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))
        db.session.commit()
        from padel_app.models import NotificationConfig
        assert NotificationConfig.query.filter_by(coach_id=coach.id).first() is None
        return coach.id, inst.id


def test_two_creators_on_a_config_less_coach_open_each_place_once(app, monkeypatch):
    from padel_app.models import LessonInstance
    from padel_app.models.vacancy import Vacancy
    from padel_app.services import notification_service as ns
    from padel_app.tests.test_pad493_starts_and_pacing import _race

    coach_id, instance_id = _seed(app)
    gate = threading.Barrier(2)
    real_lock = ns._lock_instance

    def gated(instance):
        # Both have counted 2 missing places outside the lock; both now ask for it.
        try:
            gate.wait(timeout=1.5)
        except threading.BrokenBarrierError:
            pass
        return real_lock(instance)

    monkeypatch.setattr(ns, "_lock_instance", gated)

    def create():
        ns._create_structural_vacancies(db.session.get(LessonInstance, instance_id), coach_id)

    _race(app, [create, create])

    with app.app_context():
        n = Vacancy.query.filter_by(lesson_instance_id=instance_id, status="open").count()
    assert n == 2, f"{n} vacancies for a 2-place class: the second creator did not see the first's rows"
