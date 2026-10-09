"""
PAD-568 / B-461 — a shared club is not a messaging link, in either direction.

messaging.conversations rule 7 used to count `coach_in_club` × `player_in_club` as a link
(coach side since PAD-205/B-025, student side since B-267/PAD-483). A coach's join link puts
every joiner in the coach's club (players.join-token rule 5), so one join made a student
"linked" to every coach of that club, and every coach of that club "linked" to every joiner.

Now a link is one of two things, read the same way from both sides: the coach has the player
on their roster, or the coach teaches a class the player is in that is not yet over. The two
directions are symmetric by construction. The exact-username path and automatic messages stay
outside the set (unchanged).
"""
from datetime import timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.utils.dates import club_now_naive


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _picker(client, app, user_id):
    resp = client.get("/api/app/messageable-users", headers=_auth(app, user_id))
    assert resp.status_code == 200
    return {int(u["id"]) for u in resp.get_json()}


def _start(client, app, user_id, body):
    return client.post("/api/app/conversation", json=body, headers=_auth(app, user_id))


@pytest.fixture
def world(app):
    """Coaches A and B in club X. Players, each linked to B a different way:
    - joined:   accepted A's join link (roster of A + club X) — nothing with B but the club
    - clubonly: in club X, on no roster, in no class
    - inclass:  enrolled in an occurrence B teaches that ends tomorrow; no roster, no club
    - inseries: enrolled in a recurring series B teaches with no end; no roster, no club
    - past:     enrolled in an occurrence B taught 30 days ago; no roster, no club
    - nobody:   no link to anyone
    """
    from padel_app.models import User
    from padel_app.models.Association_CoachClub import Association_CoachClub
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.Association_PlayerClub import Association_PlayerClub
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence

    with app.app_context():
        names = ["coach_a", "coach_b", "joined", "clubonly", "inclass", "inseries", "past", "nobody"]
        users = {n: User(name=f"P568 {n}", username=f"p568_{n}", password="x", status="active")
                 for n in names}
        db.session.add_all(users.values())
        db.session.flush()
        coaches = {n: Coach(user_id=users[n].id, approval_status="approved") for n in ("coach_a", "coach_b")}
        players = {n: Player(user_id=users[n].id) for n in names[2:]}
        db.session.add_all([*coaches.values(), *players.values()])
        db.session.flush()

        club = Club(name="P568 Club X", description="", location="x")
        db.session.add(club)
        db.session.flush()
        for c in coaches.values():
            db.session.add(Association_CoachClub(coach_id=c.id, club_id=club.id))

        # the join-link shape (players.join-token rule 5): roster row with A + club row
        db.session.add(Association_CoachPlayer(coach_id=coaches["coach_a"].id, player_id=players["joined"].id))
        db.session.add(Association_PlayerClub(player_id=players["joined"].id, club_id=club.id))
        # club only
        db.session.add(Association_PlayerClub(player_id=players["clubonly"].id, club_id=club.id))

        now = club_now_naive()

        def lesson(title, start, *, recurring=False):
            row = Lesson(title=title, start_datetime=start, end_datetime=start + timedelta(hours=1),
                         is_recurring=recurring, type="academy", max_players=4, color="#000",
                         status="active", club_id=club.id)
            db.session.add(row)
            db.session.flush()
            return row

        def occurrence(player, start):
            parent = lesson(f"P568 {player} class", start)
            inst = LessonInstance(lesson_id=parent.id, start_datetime=start,
                                  end_datetime=start + timedelta(hours=1), max_players=4,
                                  status="scheduled")
            db.session.add(inst)
            db.session.flush()
            db.session.add(Association_CoachLessonInstance(coach_id=coaches["coach_b"].id,
                                                           lesson_instance_id=inst.id))
            db.session.add(Presence(player_id=players[player].id, lesson_instance_id=inst.id))
            return inst

        inclass_inst = occurrence("inclass", now + timedelta(days=1))
        occurrence("past", now - timedelta(days=30))
        series = lesson("P568 series", now - timedelta(days=100), recurring=True)
        db.session.add(Association_CoachLesson(coach_id=coaches["coach_b"].id, lesson_id=series.id))
        db.session.add(Association_PlayerLesson(player_id=players["inseries"].id, lesson_id=series.id))
        db.session.commit()

        return {
            "users": {n: u.id for n, u in users.items()},
            "player_ids": {n: p.id for n, p in players.items()},
            "coach_ids": {n: c.id for n, c in coaches.items()},
            "inclass_instance_id": inclass_inst.id,
        }


# ── student side ─────────────────────────────────────────────────────────────

def test_a_student_who_joined_one_coach_does_not_see_the_clubs_other_coaches(client, app, world):
    """The PAD-568 report: one join link, every coach of the club in the picker."""
    u = world["users"]
    ids = _picker(client, app, u["joined"])
    assert u["coach_a"] in ids
    assert u["coach_b"] not in ids


def test_a_student_cannot_start_a_conversation_with_a_club_only_coach(client, app, world):
    u = world["users"]
    assert _start(client, app, u["joined"], {"otherParticipants": [u["coach_b"]]}).status_code == 403
    # the roster coach still works, and the exact username still reaches B (direct-by-username)
    assert _start(client, app, u["joined"], {"otherParticipants": [u["coach_a"]]}).status_code == 201
    assert _start(client, app, u["clubonly"], {"otherUsername": "p568_coach_b"}).status_code == 201


def test_a_club_only_student_has_an_empty_picker(client, app, world):
    """The no-coach shape the clients render as the connect shortcut."""
    assert _picker(client, app, world["users"]["clubonly"]) == set()


# ── coach side ───────────────────────────────────────────────────────────────

def test_a_coach_does_not_see_club_only_players(client, app, world):
    u = world["users"]
    ids = _picker(client, app, u["coach_b"])
    assert u["clubonly"] not in ids
    assert u["joined"] not in ids  # on A's roster, in B's club: not B's student


def test_a_coach_cannot_start_a_conversation_with_a_club_only_player(client, app, world):
    u = world["users"]
    assert _start(client, app, u["coach_b"], {"otherParticipants": [u["clubonly"]]}).status_code == 403
    assert _start(client, app, u["coach_b"], {"otherParticipants": [u["joined"]]}).status_code == 403
    assert _start(client, app, u["coach_b"], {"otherUsername": "p568_clubonly"}).status_code == 201


def test_a_coach_reaches_students_of_a_class_that_is_not_over(client, app, world):
    """The coach side gains the live-class arm it never had, mirroring the student side."""
    u = world["users"]
    ids = _picker(client, app, u["coach_b"])
    assert u["inclass"] in ids
    assert u["inseries"] in ids
    assert _start(client, app, u["coach_b"], {"otherParticipants": [u["inclass"]]}).status_code == 201


def test_a_class_that_is_over_does_not_link_a_coach_to_its_students(client, app, world):
    u = world["users"]
    assert u["past"] not in _picker(client, app, u["coach_b"])
    assert _start(client, app, u["coach_b"], {"otherParticipants": [u["past"]]}).status_code == 403


def test_a_cancelled_occurrence_stops_linking(client, app, world):
    from padel_app.models.lesson_instances import LessonInstance

    u = world["users"]
    assert u["inclass"] in _picker(client, app, u["coach_b"])
    with app.app_context():
        db.session.get(LessonInstance, world["inclass_instance_id"]).status = "canceled"
        db.session.commit()
    assert u["inclass"] not in _picker(client, app, u["coach_b"])
    assert u["coach_b"] not in _picker(client, app, u["inclass"])


# ── symmetry ─────────────────────────────────────────────────────────────────

def test_the_two_directions_agree(client, app, world):
    """C is in a player's picker exactly when that player is in C's picker — for every link kind."""
    u = world["users"]
    coach_pickers = {c: _picker(client, app, u[c]) for c in ("coach_a", "coach_b")}
    for player in ("joined", "clubonly", "inclass", "inseries", "past", "nobody"):
        player_picker = _picker(client, app, u[player])
        for coach in ("coach_a", "coach_b"):
            assert (u[coach] in player_picker) == (u[player] in coach_pickers[coach]), (player, coach)
    # and the set is not trivially empty: the roster and live-class links are there
    assert u["joined"] in coach_pickers["coach_a"]
    assert u["inclass"] in coach_pickers["coach_b"] and u["inseries"] in coach_pickers["coach_b"]


def test_messageable_set_never_includes_other_coaches_or_other_students(client, app, world):
    u = world["users"]
    assert u["coach_a"] not in _picker(client, app, u["coach_b"])
    assert u["nobody"] not in _picker(client, app, u["joined"])
    assert u["nobody"] not in _picker(client, app, u["coach_b"])
