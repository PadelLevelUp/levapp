"""PAD-257 / audit H1 — id-keyed class reads are scoped to the class's own
people (classes.detail-visibility rule 5): the owning coach, a coach of the
same club, or an enrolled student. Anyone else gets 403 and no payload.
"""
from datetime import datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-secret"


def _h(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def world(app):
    from padel_app.models import (
        User, Player, Presence, Association_CoachClub, Association_CoachPlayer,
        Association_PlayerLessonInstance,
    )
    from padel_app.models.coaches import Coach
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance

    def user(name, username):
        u = User(name=name, username=username, email=f"{username}@test.com",
                 phone="+351900000000", password="x", status="active")
        db.session.add(u); db.session.flush(); return u

    with app.app_context():
        norte = Club(name="Norte", description="", location="City")
        sul = Club(name="Sul", description="", location="City")
        db.session.add_all([norte, sul]); db.session.flush()

        ana = Coach(user_id=user("Ana", "ana-257").id, approval_status="approved")
        carla = Coach(user_id=user("Carla", "carla-257").id, approval_status="approved")
        bruno = Coach(user_id=user("Bruno", "bruno-257").id, approval_status="approved")
        db.session.add_all([ana, carla, bruno]); db.session.flush()
        db.session.add_all([
            Association_CoachClub(coach_id=ana.id, club_id=norte.id),
            Association_CoachClub(coach_id=carla.id, club_id=norte.id),
            Association_CoachClub(coach_id=bruno.id, club_id=sul.id),
        ])

        rui = Player(user_id=user("Rui", "rui-257").id)
        sara = Player(user_id=user("Sara", "sara-257").id)
        db.session.add_all([rui, sara]); db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=ana.id, player_id=rui.id))

        start = datetime.utcnow() + timedelta(days=2)
        lesson = Lesson(title="Norte class", start_datetime=start,
                        end_datetime=start + timedelta(hours=1), is_recurring=False,
                        type="academy", max_players=4, color="#000", status="active",
                        club_id=norte.id)
        db.session.add(lesson); db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=ana.id, lesson_id=lesson.id))
        inst = LessonInstance(lesson_id=lesson.id, start_datetime=start,
                              end_datetime=start + timedelta(hours=1), max_players=4,
                              status="scheduled", notifications_enabled=True)
        db.session.add(inst); db.session.flush()
        db.session.add(Association_CoachLessonInstance(coach_id=ana.id, lesson_instance_id=inst.id))
        db.session.add(Association_PlayerLessonInstance(player_id=rui.id, lesson_instance_id=inst.id))
        db.session.add(Presence(lesson_instance_id=inst.id, player_id=rui.id, invited=True, confirmed=True))
        db.session.commit()
        return {
            "ana": ana.user_id, "carla": carla.user_id, "bruno": bruno.user_id,
            "rui": rui.user_id, "sara": sara.user_id,
            "lesson": lesson.id, "instance": inst.id, "rui_player": rui.id,
        }


ROUTES = ["detail", "presences", "class_instance", "class_instance_lesson"]


def _call(app, client, world, who, route):
    h = _h(app, world[who])
    if route == "detail":
        return client.get(f"/api/app/lesson_instance/{world['instance']}", headers=h)
    if route == "presences":
        return client.get(f"/api/app/lesson_instance/{world['instance']}/presences", headers=h)
    if route == "class_instance":
        return client.post(f"/api/app/class_instance?model=lessoninstance&id={world['instance']}", headers=h)
    return client.post(f"/api/app/class_instance?model=lesson&id={world['lesson']}", headers=h)


@pytest.mark.parametrize("route", ROUTES)
def test_owner_and_club_colleague_can_read(app, client, world, route):
    for who in ("ana", "carla"):
        res = _call(app, client, world, who, route)
        assert res.status_code == 200, (who, route, res.get_json())


@pytest.mark.parametrize("route", ROUTES)
def test_other_club_coach_and_unenrolled_student_get_403_without_a_payload(app, client, world, route):
    for who in ("bruno", "sara"):
        res = _call(app, client, world, who, route)
        assert res.status_code == 403, (who, route, res.get_json())
        body = res.get_data(as_text=True)
        assert "@test.com" not in body and "+351" not in body and "rui" not in body.lower()


@pytest.mark.parametrize("route", ["detail", "presences", "class_instance"])
def test_enrolled_student_reads_only_their_own_presence(app, client, world, route):
    res = _call(app, client, world, "rui", route)
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    presences = body if route == "presences" else body.get("presences", [])
    assert [p["playerId"] for p in presences] == [world["rui_player"]]


def test_unknown_instance_is_404_before_any_scoping(app, client, world):
    res = client.get("/api/app/lesson_instance/999999", headers=_h(app, world["bruno"]))
    assert res.status_code == 404
