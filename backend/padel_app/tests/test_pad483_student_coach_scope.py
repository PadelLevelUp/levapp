"""
PAD-483 / B-267 — a student may start a conversation only with a coach they are linked to.

`_messageable_target_ids_for(student)` returned every active coach, so a new
student's picker (`GET /api/app/messageable-users`) listed arbitrary coaches
and `POST /api/app/conversation` accepted any of them. messaging.conversations
rule 7 now scopes the student side to linked coaches, mirroring the coach side:

- the coach has the student on their roster (`coach_in_player`), or
- they share a club (`coach_in_club` × `player_in_club`), or
- the coach teaches a class the student is in (`coach_in_lesson` ×
  `player_in_lesson`, or `coach_in_lesson_instance` × `presences`).

Unchanged on purpose: the exact-username path (messaging.direct-by-username),
sending inside a conversation that already exists (rule 8), and automatic
messages, which never go through the picker's scope.
"""
from datetime import timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def scope(app):
    """One student and five coaches, each linked a different way (or not at all)."""
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
        names = ["student", "roster", "club", "lesson", "instance", "stranger"]
        users = {
            n: User(name=f"S483 {n}", username=f"s483_{n}", password="x", status="active")
            for n in names
        }
        db.session.add_all(users.values())
        db.session.flush()

        student = Player(user_id=users["student"].id)
        coaches = {n: Coach(user_id=users[n].id) for n in names[1:]}
        db.session.add(student)
        db.session.add_all(coaches.values())
        db.session.flush()

        # roster
        db.session.add(Association_CoachPlayer(coach_id=coaches["roster"].id, player_id=student.id))

        # shared club
        club = Club(name="S483 Club", description="", location="x")
        db.session.add(club)
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coaches["club"].id, club_id=club.id))
        db.session.add(Association_PlayerClub(player_id=student.id, club_id=club.id))

        start = utcnow_naive() + timedelta(days=3)

        def _lesson(title):
            lesson = Lesson(
                title=title, start_datetime=start, end_datetime=start + timedelta(hours=1),
                is_recurring=False, type="academy", max_players=4, color="#000",
                status="active", club_id=club.id,
            )
            db.session.add(lesson)
            db.session.flush()
            return lesson

        # a series the student is enrolled in, taught by the "lesson" coach
        series = _lesson("S483 series")
        db.session.add(Association_CoachLesson(coach_id=coaches["lesson"].id, lesson_id=series.id))
        db.session.add(Association_PlayerLesson(player_id=student.id, lesson_id=series.id))

        # one occurrence the student is enrolled in, taught by the "instance" coach
        one_off = _lesson("S483 one-off")
        instance = LessonInstance(
            lesson_id=one_off.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
            max_players=4, status="scheduled",
        )
        db.session.add(instance)
        db.session.flush()
        db.session.add(Association_CoachLessonInstance(
            coach_id=coaches["instance"].id, lesson_instance_id=instance.id))
        db.session.add(Presence(player_id=student.id, lesson_instance_id=instance.id))
        db.session.commit()

        return {
            "student_user_id": users["student"].id,
            "student_player_id": student.id,
            "user_ids": {n: users[n].id for n in names[1:]},
            "coach_ids": {n: coaches[n].id for n in names[1:]},
        }


LINKED = ["roster", "club", "lesson", "instance"]


def _messageable_ids(client, app, user_id):
    resp = client.get("/api/app/messageable-users", headers=_auth_header(app, user_id))
    assert resp.status_code == 200
    return {int(u["id"]) for u in resp.get_json()}


def _start(client, app, user_id, body):
    return client.post("/api/app/conversation", json=body, headers=_auth_header(app, user_id))


def test_student_picker_lists_only_linked_coaches(client, app, scope):
    ids = _messageable_ids(client, app, scope["student_user_id"])
    assert ids == {scope["user_ids"][n] for n in LINKED}
    assert scope["user_ids"]["stranger"] not in ids


@pytest.mark.parametrize("link", LINKED)
def test_student_may_start_a_conversation_with_a_linked_coach(client, app, scope, link):
    resp = _start(client, app, scope["student_user_id"],
                  {"otherParticipants": [scope["user_ids"][link]]})
    assert resp.status_code in (200, 201), resp.get_json()


def test_student_cannot_start_a_conversation_with_an_unlinked_coach(client, app, scope):
    resp = _start(client, app, scope["student_user_id"],
                  {"otherParticipants": [scope["user_ids"]["stranger"]]})
    assert resp.status_code == 403


def test_exact_username_still_reaches_an_unlinked_coach(client, app, scope):
    """messaging.direct-by-username stays as the 2026-09-06 decision made it."""
    resp = _start(client, app, scope["student_user_id"], {"otherUsername": "s483_stranger"})
    assert resp.status_code in (200, 201), resp.get_json()


def test_an_existing_thread_keeps_working_after_the_link_is_removed(client, app, scope):
    """Rule 8: the scope governs starting a conversation, never sending inside one."""
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer

    resp = _start(client, app, scope["student_user_id"],
                  {"otherParticipants": [scope["user_ids"]["roster"]]})
    conversation_id = resp.get_json()["id"]

    with app.app_context():
        Association_CoachPlayer.query.filter_by(
            coach_id=scope["coach_ids"]["roster"], player_id=scope["student_player_id"]
        ).delete()
        db.session.commit()

    assert scope["user_ids"]["roster"] not in _messageable_ids(client, app, scope["student_user_id"])
    sent = client.post(
        "/api/app/message",
        json={"conversationId": conversation_id, "text": "still here"},
        headers=_auth_header(app, scope["student_user_id"]),
    )
    assert sent.status_code in (200, 201), sent.get_json()


def test_automatic_messages_ignore_the_picker_scope(app, scope):
    """System sends (reminders, invitations, join/class-request notices) create their own
    direct conversation and never consult the messageable set, so the fix cannot silence
    them — even between a coach and a student who share no link."""
    from padel_app.models import Message
    from padel_app.services.notification_service import _send_system_message

    with app.app_context():
        msg = _send_system_message(
            scope["user_ids"]["stranger"], scope["student_user_id"], "Automatic notice",
            push=False,
        )
        assert msg is not None
        assert db.session.get(Message, msg.id).conversation_id is not None


def test_a_join_request_still_reaches_the_coach(app):
    """The student-initiated automatic flow (join request to an open class) is delivered.
    It already requires the roster row (class_join_request_service), so the requester is
    always linked under rule 7."""
    from padel_app.tests.test_pad131_join_requests import _config, _messages_for, _request, _student
    from padel_app.tests.test_pad128_eligibility import _seed

    ids = _seed(app, eligibility_rules=[{"attribute": "level", "operation": "same_as_class"}])
    _config(app, ids, open_spots_visible=True)
    pid = _student(app, ids, "s483_asker")
    _rid, status, created = _request(app, ids, pid)
    assert (status, created) == ("pending", True)
    msgs = _messages_for(app, ids, pid)
    assert len(msgs) == 1 and msgs[0][0] is True


def test_coach_side_is_unchanged(client, app, scope):
    """A coach still cannot start a conversation with a student off their roster and clubs."""
    resp = _start(client, app, scope["user_ids"]["stranger"],
                  {"otherParticipants": [scope["student_user_id"]]})
    assert resp.status_code == 403
