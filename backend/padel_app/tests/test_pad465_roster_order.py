"""
PAD-465 / B-233 / D163 — one roster order, set on the server.

Covered spec: classes.instance-enrollment rule 12, criterion "The roster keeps one
order across a save". Every read that lists a class's participants lists them by
the account name, ignoring case and accents, then by player id — and a save never
moves a row. Before this the order was whatever the database returned.
"""
from datetime import datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

# Inserted out of order on purpose: creation order is Zé, ana, Álvaro, Bruno.
CREATED = ["Zé", "ana", "Álvaro", "Bruno"]
EXPECTED = ["Álvaro", "ana", "Bruno", "Zé"]


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


@pytest.fixture
def roster(app):
    from padel_app.models import User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.models.clubs import Club
    from padel_app.models.Association_CoachClub import Association_CoachClub
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachLessonInstance import (
        Association_CoachLessonInstance,
    )
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence

    with app.app_context():
        coach_user = User(name="Coach", username="ro_coach", password="x")
        db.session.add(coach_user)
        db.session.flush()
        coach = Coach(user_id=coach_user.id)
        db.session.add(coach)
        club = Club(name="Roster Club", description="c", location="x")
        db.session.add(club)
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club.id))

        players = {}
        for i, name in enumerate(CREATED):
            u = User(name=name, username=f"ro_p{i}", password="x")
            db.session.add(u)
            db.session.flush()
            p = Player(user_id=u.id)
            db.session.add(p)
            db.session.flush()
            players[name] = p.id
            db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id))

        start = datetime.utcnow().replace(microsecond=0) + timedelta(days=1)
        lesson = Lesson(
            title="Roster Order Class",
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            is_recurring=False,
            type="academy",
            max_players=6,
            status="active",
            club_id=club.id,
        )
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
        for name in CREATED:
            db.session.add(Association_PlayerLesson(player_id=players[name], lesson_id=lesson.id))

        instance = LessonInstance(
            lesson_id=lesson.id,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            max_players=6,
            status="scheduled",
            original_lesson_occurence_date=start.date(),
        )
        db.session.add(instance)
        db.session.flush()
        db.session.add(
            Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=instance.id)
        )
        for name in CREATED:
            db.session.add(
                Presence(lesson_instance_id=instance.id, player_id=players[name], invited=True)
            )
        db.session.commit()
        return {
            "coach_user_id": coach_user.id,
            "lesson_id": lesson.id,
            "instance_id": instance.id,
            "players": players,
        }


def _names_by_id(roster):
    return {pid: name for name, pid in roster["players"].items()}


def _detail_order(client, app, roster, model, obj_id):
    resp = client.post(
        f"/api/app/class_instance?model={model}&id={obj_id}",
        headers=_auth(app, roster["coach_user_id"]),
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)
    names = _names_by_id(roster)
    return [names[p["id"]] for p in resp.get_json()["participants"]]


def _presences_order(client, app, roster):
    resp = client.get(
        f"/api/app/lesson_instance/{roster['instance_id']}/presences",
        headers=_auth(app, roster["coach_user_id"]),
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)
    names = _names_by_id(roster)
    return [names[p["playerId"]] for p in resp.get_json()]


def _save_attendance_for(app, roster, name):
    """The coach's record for one row (what the attendance save writes)."""
    from padel_app.models.presences import Presence

    with app.app_context():
        row = Presence.query.filter_by(
            lesson_instance_id=roster["instance_id"], player_id=roster["players"][name]
        ).one()
        row.status = "present"
        row.validated = True
        db.session.commit()


def test_occurrence_roster_is_in_name_order_before_and_after_a_save(client, app, roster):
    assert _detail_order(client, app, roster, "lessoninstance", roster["instance_id"]) == EXPECTED
    assert _presences_order(client, app, roster) == EXPECTED

    _save_attendance_for(app, roster, "Bruno")

    assert _detail_order(client, app, roster, "lessoninstance", roster["instance_id"]) == EXPECTED
    assert _presences_order(client, app, roster) == EXPECTED


def test_every_other_presences_payload_is_in_name_order(client, app, roster):
    """Rule 12 says EVERY read: the detail's `presences`, GET /lesson_instance/<id>, and the
    class evaluations panel (which builds its own participants from the presences)."""
    names = _names_by_id(roster)
    headers = _auth(app, roster["coach_user_id"])
    iid = roster["instance_id"]

    detail = client.post(f"/api/app/class_instance?model=lessoninstance&id={iid}", headers=headers)
    assert [names[p["playerId"]] for p in detail.get_json()["presences"]] == EXPECTED

    single = client.get(f"/api/app/lesson_instance/{iid}", headers=headers)
    assert single.status_code == 200, single.get_data(as_text=True)
    assert [names[p["playerId"]] for p in single.get_json()["presences"]] == EXPECTED

    panel = client.post(f"/api/app/class_instance/evaluations?model=lessoninstance&id={iid}", headers=headers)
    assert panel.status_code == 200, panel.get_data(as_text=True)
    assert [names[p["playerId"]] for p in panel.get_json()["participants"]] == EXPECTED


def test_series_roster_is_in_name_order(client, app, roster):
    assert _detail_order(client, app, roster, "lesson", roster["lesson_id"]) == EXPECTED


def test_same_name_ties_break_by_player_id():
    from padel_app.services.roster_order import roster_sort_key

    class _U:
        def __init__(self, name):
            self.name = name

    class _P:
        def __init__(self, pid, name):
            self.id = pid
            self.user = _U(name)

    class _Row:
        def __init__(self, pid, name):
            self.player_id = pid
            self.player = _P(pid, name)

    rows = [_Row(9, "Ana"), _Row(3, "ana"), _Row(5, "Ána")]
    assert [r.player_id for r in sorted(rows, key=roster_sort_key)] == [3, 5, 9]
