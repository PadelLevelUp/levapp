"""PAD-829 — attendance.validation rule 30: the E2E fixture of ended classes.

`POST /api/app/debug/ended-classes {"count", "weeksAgo"}` gives the calling coach a day of ended
classes, every roster player confirmed, so each is "ready to confirm" and the validate list is long
enough for Maestro flow 323 to drag; `DELETE` removes them. Both are 404 without the
E2E_DEBUG_ENDPOINTS flag and take a JWT like every debug route (`test_frontend_api_authz` holds the
POST's 401 with the other debug routes).
"""
from datetime import datetime, timedelta, timezone

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

ROUTE = "/api/app/debug/ended-classes"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


@pytest.fixture
def coach_world(app, monkeypatch):
    """A coach in a club with four roster players."""
    from padel_app.models import Association_CoachPlayer, Player, User
    from padel_app.models.Association_CoachClub import Association_CoachClub
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach

    monkeypatch.setitem(app.config, "JWT_SECRET_KEY", "test-jwt-secret")
    monkeypatch.delenv("E2E_DEBUG_ENDPOINTS", raising=False)
    with app.app_context():
        club = Club(name="Fixture Club")
        user = User(name="Fixture Coach", username="fixture_coach", password="x")
        db.session.add_all([club, user])
        db.session.flush()
        coach = Coach(user_id=user.id)
        db.session.add(coach)
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club.id))
        for i in range(4):
            pu = User(name=f"Fixture Player {i}", username=f"fixture_player_{i}", password="x")
            db.session.add(pu)
            db.session.flush()
            player = Player(user_id=pu.id)
            db.session.add(player)
            db.session.flush()
            db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=player.id))
        db.session.commit()
        return {"user_id": user.id, "coach_id": coach.id}


@pytest.mark.criterion("ATTENDANCE-VALIDATION-54")
def test_on_the_flag_the_coach_gets_ended_ready_classes_and_delete_removes_them(app, coach_world):
    from padel_app.models.lessons import Lesson
    from padel_app.services.presence_overview_service import list_pending_validation
    from padel_app.utils.e2e_fixtures import TITLE_PREFIX

    app.config["E2E_DEBUG_ENDPOINTS"] = "true"
    client = app.test_client()
    headers = _auth(app, coach_world["user_id"])

    res = client.post(ROUTE, headers=headers, json={"count": 10, "weeksAgo": 1})
    assert res.status_code == 200
    body = res.get_json()
    ids = body["lessonInstanceIds"]
    assert len(ids) == 10
    day = datetime.fromisoformat(body["day"])
    assert (datetime.now(timezone.utc).date() - day.date()).days == 7

    with app.app_context():
        listing = list_pending_validation(
            coach_id=coach_world["coach_id"],
            range_start=day,
            range_end=day + timedelta(days=1),
        )
    pending = listing["pending"]
    assert [c["lessonInstanceId"] for c in pending] == ids, "ten pending classes, ids in start order"
    assert listing["validated"] == []
    for klass in pending:
        assert len(klass["players"]) == 4
        assert all(p["response"] == "confirmed" for p in klass["players"]), "every player answered: ready"
        assert not any(p["validated"] for p in klass["players"])

    # Out of range: 400, nothing created.
    assert client.post(ROUTE, headers=headers, json={"count": 0}).status_code == 400
    assert client.post(ROUTE, headers=headers, json={"count": 31}).status_code == 400
    assert client.post(ROUTE, headers=headers, json={"count": 2, "weeksAgo": 0}).status_code == 400
    assert client.post(ROUTE, headers=headers, json={"count": "ten"}).status_code == 400
    assert client.post(ROUTE, headers=headers, json={"count": 2, "durationMinutes": 0}).status_code == 400
    assert client.post(ROUTE, headers=headers, json={"count": 2, "durationMinutes": 181}).status_code == 400

    # PAD-837: a class length for the hours columns; the classes stay back to back.
    from padel_app.models.lesson_instances import LessonInstance

    res = client.post(ROUTE, headers=headers, json={"count": 2, "weeksAgo": 2, "durationMinutes": 90})
    assert res.status_code == 200
    long_ids = res.get_json()["lessonInstanceIds"]
    with app.app_context():
        first, second = (LessonInstance.query.get(i) for i in long_ids)
        assert (first.end_datetime - first.start_datetime) == timedelta(minutes=90)
        assert second.start_datetime == first.end_datetime

    res = client.delete(ROUTE, headers=headers)
    assert res.status_code == 200
    assert res.get_json() == {"deleted": 12}
    with app.app_context():
        assert Lesson.query.filter(Lesson.title.like(TITLE_PREFIX + "%")).count() == 0
        listing = list_pending_validation(
            coach_id=coach_world["coach_id"],
            range_start=day,
            range_end=day + timedelta(days=1),
        )
    assert listing["pending"] == [] and listing["validated"] == []
    assert client.delete(ROUTE, headers=headers).get_json() == {"deleted": 0}


@pytest.mark.criterion("ATTENDANCE-VALIDATION-54")
def test_off_the_flag_both_verbs_are_404_and_the_delete_needs_a_token(app, coach_world):
    from padel_app.models.lessons import Lesson

    app.config["E2E_DEBUG_ENDPOINTS"] = None
    client = app.test_client()
    headers = _auth(app, coach_world["user_id"])
    assert client.post(ROUTE, headers=headers, json={"count": 3, "weeksAgo": 1}).status_code == 404
    assert client.delete(ROUTE, headers=headers).status_code == 404
    with app.app_context():
        assert Lesson.query.count() == 0

    app.config["E2E_DEBUG_ENDPOINTS"] = "true"
    assert client.delete(ROUTE).status_code == 401
