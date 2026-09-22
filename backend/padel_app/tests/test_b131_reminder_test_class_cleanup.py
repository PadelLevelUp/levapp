"""
B-131 — the reminder debug endpoint's cleanup counterpart.

``debug_schedule_reminder_test`` (notification_engine_api.py) creates a Lesson
+ LessonInstance titled ``REMINDER_TEST_CLASS_TITLE`` at club-now + 48h and
nothing ever removed it — five E2E specs called it and none cleaned up, so the
leaked classes eventually overlapped a seeded slot (see
.cortex/compass/bugs/B-131-a-debug-endpoints-test-class-was-never-removed.md).

This pins the new sibling route, ``POST
/api/app/notify/debug/schedule_reminder_test/cleanup``, which deletes every
class of that title belonging to the CALLING coach via the same
``remove_class_service`` the app's own "remove class" action uses — and pins
that the creator's response now also carries ``lessonId``.
"""
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

CREATE_PATH = "/api/app/notify/debug/schedule_reminder_test"
CLEANUP_PATH = "/api/app/notify/debug/schedule_reminder_test/cleanup"


@pytest.fixture(autouse=True)
def _debug_gate(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    # Same gate `debug_schedule_reminder_test` uses — read from app.config first,
    # env second (notification_engine_api._debug_endpoints_enabled).
    app.config["E2E_DEBUG_ENDPOINTS"] = "true"


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _seed_world(app):
    """The seeded users the creator route requires by username (e2e-coach,
    e2e-student, e2e-student-2), plus a second, unrelated coach used to prove
    cleanup never touches another coach's class."""
    from padel_app.models import User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.models.clubs import Club

    with app.app_context():
        club = Club(name="B131 Club", description="", location="City")
        db.session.add(club)
        db.session.flush()

        coach_user = User(name="E2E Coach", username="e2e-coach", password="x")
        student1_user = User(name="E2E Student", username="e2e-student", password="x")
        student2_user = User(name="E2E Student 2", username="e2e-student-2", password="x")
        other_coach_user = User(name="Other Coach", username="other-coach-b131", password="x")
        db.session.add_all(
            [coach_user, student1_user, student2_user, other_coach_user]
        )
        db.session.flush()

        coach = Coach(user_id=coach_user.id)
        other_coach = Coach(user_id=other_coach_user.id)
        student1 = Player(user_id=student1_user.id)
        student2 = Player(user_id=student2_user.id)
        db.session.add_all([coach, other_coach, student1, student2])
        db.session.commit()

        return {
            "club_id": club.id,
            "coach_user_id": coach_user.id,
            "coach_id": coach.id,
            "other_coach_user_id": other_coach_user.id,
            "other_coach_id": other_coach.id,
        }


def _create_reminder_test_class(client, app, coach_user_id):
    """Calls the creator route with the scheduler gate mocked out — APScheduler
    never initialises in a test app (scheduler.init_scheduler no-ops whenever
    ``test_config`` is not None), so ``ensure_scheduler_ready`` would otherwise
    raise. ``schedule_instance_jobs`` itself already no-ops when the module
    scheduler is None, so it needs no mock."""
    with patch("padel_app.scheduler.ensure_scheduler_ready"):
        res = client.post(
            CREATE_PATH,
            json={"secondsUntilReminderFires": 45},
            headers=_auth_header(app, coach_user_id),
        )
    assert res.status_code == 200, res.get_json()
    return res.get_json()


def test_creator_response_carries_lesson_id(app, client):
    """(d): the creator's response carries lessonId matching the created Lesson."""
    from padel_app.models.lesson_instances import LessonInstance

    world = _seed_world(app)
    body = _create_reminder_test_class(client, app, world["coach_user_id"])

    assert "lessonId" in body
    assert "instanceId" in body

    with app.app_context():
        instance = LessonInstance.query.get(body["instanceId"])
        assert instance is not None
        assert instance.lesson_id == body["lessonId"]


def test_cleanup_removes_only_the_calling_coachs_classes(app, client):
    """(a) two calls to the creator then cleanup -> removed == 2, the classes
    (and their instances/presences) are gone for that coach.
    (b) a same-titled Lesson belonging to ANOTHER coach is left alone.
    """
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.modules.notification_engine_api import REMINDER_TEST_CLASS_TITLE
    from datetime import datetime, timedelta

    world = _seed_world(app)

    first = _create_reminder_test_class(client, app, world["coach_user_id"])
    second = _create_reminder_test_class(client, app, world["coach_user_id"])

    own_instance_ids = [first["instanceId"], second["instanceId"]]
    own_lesson_ids = [first["lessonId"], second["lessonId"]]

    # A same-titled class belonging to the OTHER coach — must survive cleanup.
    with app.app_context():
        start = datetime.utcnow() + timedelta(hours=48)
        other_lesson = Lesson(
            title=REMINDER_TEST_CLASS_TITLE,
            type="academy",
            status="active",
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            max_players=4,
            color="#e11d48",
            club_id=world["club_id"],
            notifications_enabled=True,
        )
        db.session.add(other_lesson)
        db.session.flush()
        db.session.add(
            Association_CoachLesson(
                coach_id=world["other_coach_id"], lesson_id=other_lesson.id
            )
        )
        db.session.commit()
        other_lesson_id = other_lesson.id

    with app.app_context():
        assert Lesson.query.filter_by(title=REMINDER_TEST_CLASS_TITLE).count() == 3

    res = client.post(
        CLEANUP_PATH,
        json={},
        headers=_auth_header(app, world["coach_user_id"]),
    )
    assert res.status_code == 200, res.get_json()
    assert res.get_json() == {"removed": 2}

    with app.app_context():
        remaining = Lesson.query.filter_by(title=REMINDER_TEST_CLASS_TITLE).all()
        assert [l.id for l in remaining] == [other_lesson_id]

        for lesson_id in own_lesson_ids:
            assert Lesson.query.get(lesson_id) is None
        for instance_id in own_instance_ids:
            assert LessonInstance.query.get(instance_id) is None
            assert (
                Presence.query.filter_by(lesson_instance_id=instance_id).count()
                == 0
            )


def test_cleanup_with_none_to_remove_returns_zero(app, client):
    """(c): cleanup with nothing to remove -> removed == 0, 200."""
    world = _seed_world(app)

    res = client.post(
        CLEANUP_PATH,
        json={},
        headers=_auth_header(app, world["coach_user_id"]),
    )
    assert res.status_code == 200
    assert res.get_json() == {"removed": 0}
