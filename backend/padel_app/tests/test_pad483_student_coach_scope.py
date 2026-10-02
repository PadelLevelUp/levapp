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


# ── review round (#514): a class is a link only while it is not over ─────────

def _make_user_coach(username, status="active"):
    from padel_app.models import User
    from padel_app.models.coaches import Coach

    user = User(name=username, username=username, password="x", status=status)
    db.session.add(user)
    db.session.flush()
    coach = Coach(user_id=user.id)
    db.session.add(coach)
    db.session.flush()
    return user, coach


def _make_lesson(club_id, start, *, recurring=False, recurrence_end=None, title="S483 class"):
    from padel_app.models.lessons import Lesson

    lesson = Lesson(
        title=title, start_datetime=start, end_datetime=start + timedelta(hours=1),
        is_recurring=recurring, recurrence_end=recurrence_end, type="academy", max_players=4,
        color="#000", status="active", club_id=club_id,
    )
    db.session.add(lesson)
    db.session.flush()
    return lesson


@pytest.fixture
def class_links(app, scope):
    """Coaches linked to the student ONLY through a class, each in a different tense."""
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.clubs import Club
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence

    now = utcnow_naive()
    with app.app_context():
        club = Club(name="S483 Club 2", description="", location="x")
        db.session.add(club)
        db.session.flush()
        sid = scope["student_player_id"]
        users = {}

        def occurrence(name, start, *, status="scheduled", response="none"):
            user, coach = _make_user_coach(f"s483_{name}")
            lesson = _make_lesson(club.id, start, title=f"S483 {name}")
            inst = LessonInstance(
                lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                max_players=4, status=status,
            )
            db.session.add(inst)
            db.session.flush()
            db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))
            db.session.add(Presence(player_id=sid, lesson_instance_id=inst.id, response=response))
            users[name] = user.id

        def series(name, start, *, recurring, recurrence_end=None):
            user, coach = _make_user_coach(f"s483_{name}")
            lesson = _make_lesson(club.id, start, recurring=recurring, recurrence_end=recurrence_end,
                                  title=f"S483 {name}")
            db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
            db.session.add(Association_PlayerLesson(player_id=sid, lesson_id=lesson.id))
            users[name] = user.id

        occurrence("taught_once_past", now - timedelta(days=90))
        occurrence("future_declined", now + timedelta(days=2), response="declined")
        occurrence("future_cancelled", now + timedelta(days=2), status="canceled")
        series("ended_series", now - timedelta(days=200), recurring=True,
               recurrence_end=(now - timedelta(days=10)).date())
        series("open_series", now - timedelta(days=200), recurring=True)
        series("future_series_end", now - timedelta(days=200), recurring=True,
               recurrence_end=(now + timedelta(days=30)).date())
        series("past_one_off", now - timedelta(days=5), recurring=False)
        db.session.commit()
        return users


@pytest.mark.parametrize("name", ["taught_once_past", "ended_series", "past_one_off", "future_cancelled"])
def test_a_class_that_is_over_is_not_a_link(client, app, scope, class_links, name):
    uid = class_links[name]
    assert uid not in _messageable_ids(client, app, scope["student_user_id"])
    resp = _start(client, app, scope["student_user_id"], {"otherParticipants": [uid]})
    assert resp.status_code == 403


@pytest.mark.parametrize("name", ["future_declined", "open_series", "future_series_end"])
def test_a_class_not_yet_over_is_a_link(client, app, scope, class_links, name):
    """A declined ('not coming') enrolment on a future class still links: still enrolled."""
    assert class_links[name] in _messageable_ids(client, app, scope["student_user_id"])


def test_removing_the_roster_row_unlinks_a_coach_whose_classes_are_over(client, app, scope, class_links):
    """The reviewer's shape: taught once, roster row deleted, coach must drop out."""
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.coaches import Coach

    uid = class_links["taught_once_past"]
    with app.app_context():
        coach_id = Coach.query.filter_by(user_id=uid).one().id
        db.session.add(Association_CoachPlayer(coach_id=coach_id, player_id=scope["student_player_id"]))
        db.session.commit()
    assert uid in _messageable_ids(client, app, scope["student_user_id"])

    with app.app_context():
        Association_CoachPlayer.query.filter_by(
            coach_id=coach_id, player_id=scope["student_player_id"]
        ).delete()
        db.session.commit()
    assert uid not in _messageable_ids(client, app, scope["student_user_id"])
    resp = _start(client, app, scope["student_user_id"], {"otherParticipants": [uid]})
    assert resp.status_code == 403


def test_a_group_with_one_unlinked_coach_is_refused(client, app, scope):
    """Every participant is checked, not just the first."""
    resp = _start(client, app, scope["student_user_id"], {
        "otherParticipants": [scope["user_ids"]["roster"], scope["user_ids"]["stranger"]],
    })
    assert resp.status_code == 403


def test_an_inactive_linked_coach_is_refused(client, app, scope):
    from padel_app.models import User

    with app.app_context():
        db.session.get(User, scope["user_ids"]["roster"]).status = "inactive"
        db.session.commit()
    assert scope["user_ids"]["roster"] not in _messageable_ids(client, app, scope["student_user_id"])
    resp = _start(client, app, scope["student_user_id"],
                  {"otherParticipants": [scope["user_ids"]["roster"]]})
    assert resp.status_code == 403


def test_not_over_reads_the_club_clock_not_utc(client, app, scope, monkeypatch):
    """Class times are stored on the club's wall clock (R-023). Pinned at 12:00 UTC on a July day
    (13:00 in Lisbon), a class that ended at 12:30 Lisbon time is over; compared with UTC it would
    still look 30 minutes from ending. One that ends at 13:30 Lisbon time still links."""
    from datetime import datetime

    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.clubs import Club
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, datetime(2026, 7, 15, 12, 0))
    ids = {}
    with app.app_context():
        club = Club.query.filter_by(name="S483 Club").one()
        for name, wall_end in (("ended_1230_wall", datetime(2026, 7, 15, 12, 30)),
                               ("ends_1330_wall", datetime(2026, 7, 15, 13, 30))):
            user, coach = _make_user_coach(f"s483_{name}")
            lesson = _make_lesson(club.id, wall_end - timedelta(hours=1), title=f"S483 {name}")
            inst = LessonInstance(lesson_id=lesson.id, start_datetime=wall_end - timedelta(hours=1),
                                  end_datetime=wall_end, max_players=4, status="scheduled")
            db.session.add(inst)
            db.session.flush()
            db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))
            db.session.add(Presence(player_id=scope["student_player_id"], lesson_instance_id=inst.id))
            ids[name] = user.id
        db.session.commit()

    listed = _messageable_ids(client, app, scope["student_user_id"])
    assert ids["ended_1230_wall"] not in listed
    assert ids["ends_1330_wall"] in listed
