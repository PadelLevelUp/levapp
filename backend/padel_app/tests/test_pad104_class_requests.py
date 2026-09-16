"""PAD-104 — classes.class-requests: a student books a class in the coach's
free time; the coach accepts, declines or proposes another time.

Seed: the Phase-1 eligibility fixture (one coach, one club, one class three
days out) plus a coach ↔ club link so accepting can create a class. Times are
the calendar's local wall-clock; the seeded class lands at "now + 3 days" so
every test works on a day of its own (+10 days) that starts empty.
"""
from datetime import datetime, timedelta

import pytest
from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _seed
from padel_app.utils.dates import utcnow_naive


def _setup(app):
    from padel_app.models import Association_CoachClub, Club, Coach

    ids = _seed(app, eligibility_rules=None)
    with app.app_context():
        club = Club.query.first()
        db.session.add(Association_CoachClub(coach_id=ids["coach_id"], club_id=club.id))
        pid = _add_student(ids["coach_id"], "booker", level_id=ids["level_ids"]["5"])
        db.session.commit()
        ids["coach_user_id"] = db.session.get(Coach, ids["coach_id"]).user_id
    ids["player_id"] = pid
    return ids


DAY = (utcnow_naive() + timedelta(days=10)).date()


def _coach(ids):
    from padel_app.models import Coach

    return db.session.get(Coach, ids["coach_id"])


def _player(pid):
    from padel_app.models.players import Player

    return db.session.get(Player, pid)


def _busy(app, ids, *, class_at=None, block_at=None):
    """Put a class and/or a calendar block on DAY."""
    from padel_app.models import Association_CoachLesson, Club
    from padel_app.models.lessons import Lesson
    from padel_app.services.calendar_service import add_event_service

    with app.app_context():
        if class_at:
            s, e = class_at
            lesson = Lesson(
                title="Busy", start_datetime=datetime.combine(DAY, s), end_datetime=datetime.combine(DAY, e),
                is_recurring=False, type="academy", max_players=4, color="#000", status="active",
                club_id=Club.query.first().id,
            )
            db.session.add(lesson)
            db.session.flush()
            db.session.add(Association_CoachLesson(coach_id=ids["coach_id"], lesson_id=lesson.id))
        if block_at:
            s, e = block_at
            add_event_service(ids["coach_user_id"], {
                "type": "personal", "title": "Dentist", "date": DAY.isoformat(),
                "startTime": s.strftime("%H:%M"), "endTime": e.strftime("%H:%M"), "isRecurring": False,
            })
        db.session.commit()


def _free(app, ids, day=None):
    from padel_app.services.class_request_service import free_blocks

    day = day or DAY
    with app.app_context():
        blocks = free_blocks(_coach(ids), datetime.combine(day, datetime.min.time()),
                             datetime.combine(day, datetime.max.time()))
        return [(b["startTime"], b["endTime"]) for b in blocks if b["date"] == day.isoformat()]


def _request(app, ids, start="11:00", end="12:00", pid=None, note=None):
    from padel_app.services.class_request_service import create_class_request_service

    with app.app_context():
        row = create_class_request_service(
            _player(pid or ids["player_id"]),
            {"coachId": ids["coach_id"], "date": DAY.isoformat(), "startTime": start, "endTime": end, "note": note},
        )
        return row.id


def _row(app, rid):
    from padel_app.models import ClassRequest

    with app.app_context():
        r = db.session.get(ClassRequest, rid)
        return {"status": r.status, "hold": r.hold_block_id, "lesson": r.lesson_id,
                "start": r.start_datetime, "end": r.end_datetime, "by": r.decided_by}


def _decide(app, ids, rid, action, **data):
    from padel_app.services.class_request_service import decide_class_request_service

    with app.app_context():
        return decide_class_request_service(rid, _coach(ids), action=action, data=data).status


def _messages(app, ids, pid=None):
    from padel_app.models import Message, Player
    from padel_app.services.notification_service import _get_or_create_direct_conversation

    with app.app_context():
        player_uid = db.session.get(Player, pid or ids["player_id"]).user_id
        conv = _get_or_create_direct_conversation(ids["coach_user_id"], player_uid)
        return [
            ((m.msg_metadata or {}).get("classRequest", {}).get("kind"), m.sender_id == player_uid)
            for m in Message.query.filter_by(conversation_id=conv.id).order_by(Message.id.asc()).all()
        ]


def _refusal(exc_info):
    return exc_info.value.response.get_json()


# ── AC: free blocks are what the coach's calendar leaves open ────────────────

def test_free_blocks_are_the_day_minus_classes_and_blocks(app):
    from datetime import time

    ids = _setup(app)
    _busy(app, ids, class_at=(time(10, 0), time(11, 0)), block_at=(time(14, 0), time(16, 0)))
    assert _free(app, ids) == [("08:00", "10:00"), ("11:00", "14:00"), ("16:00", "22:00")]


def test_an_empty_day_is_one_free_block_and_the_past_is_never_offered(app):
    ids = _setup(app)
    assert _free(app, ids) == [("08:00", "22:00")]
    yesterday = (utcnow_naive() - timedelta(days=1)).date()
    assert _free(app, ids, day=yesterday) == []


# ── AC: a request holds its slot ─────────────────────────────────────────────

def test_a_request_holds_its_slot_on_the_coach_calendar(app):
    from padel_app.models import CalendarBlock

    ids = _setup(app)
    rid = _request(app, ids, "11:00", "12:00", note="backhand")
    row = _row(app, rid)
    assert row["status"] == "pending" and row["hold"] is not None
    with app.app_context():
        hold = db.session.get(CalendarBlock, row["hold"])
        assert hold.user_id == ids["coach_user_id"] and "booker" in hold.title
    assert _free(app, ids) == [("08:00", "11:00"), ("12:00", "22:00")]
    # Another student cannot take the same slot.
    other = _add = None
    with app.app_context():
        other = _add_student(ids["coach_id"], "other", level_id=ids["level_ids"]["5"])
        db.session.commit()
    from padel_app.services.class_request_service import create_class_request_service
    with app.app_context():
        with pytest.raises(HTTPException) as e:
            create_class_request_service(_player(other), {"coachId": ids["coach_id"], "date": DAY.isoformat(),
                                                          "startTime": "11:30", "endTime": "12:30"})
        assert _refusal(e)["code"] == "slot_taken"
    assert _messages(app, ids) == [("requested", True)]


# ── AC: accept creates the class and releases the hold ───────────────────────

def test_accept_creates_a_private_class_with_the_student_and_releases_the_hold(app):
    from padel_app.models import CalendarBlock
    from padel_app.models.lessons import Lesson

    ids = _setup(app)
    rid = _request(app, ids, "11:00", "12:00")
    hold = _row(app, rid)["hold"]
    assert _decide(app, ids, rid, "accept") == "accepted"
    row = _row(app, rid)
    with app.app_context():
        assert db.session.get(CalendarBlock, hold) is None
        lesson = db.session.get(Lesson, row["lesson"])
        assert lesson.type == "private" and lesson.max_players == 1
        assert lesson.start_datetime == datetime.combine(DAY, datetime.min.time()) + timedelta(hours=11)
        assert [r.player_id for r in lesson.players_relations] == [ids["player_id"]]
        assert [r.coach_id for r in lesson.coaches_relations] == [ids["coach_id"]]
    assert row["by"] == "coach"
    assert _messages(app, ids)[-1] == ("accepted", False)
    # The class now occupies the slot instead of the hold.
    assert _free(app, ids) == [("08:00", "11:00"), ("12:00", "22:00")]


# ── AC: counter-proposal round-trips ─────────────────────────────────────────

def test_counter_proposal_moves_the_hold_and_the_student_accepts(app):
    from padel_app.services.class_request_service import answer_proposal_service

    ids = _setup(app)
    rid = _request(app, ids, "11:00", "12:00")
    assert _decide(app, ids, rid, "propose", date=DAY.isoformat(), startTime="15:00", endTime="16:00") == "countered"
    row = _row(app, rid)
    assert row["start"].hour == 15 and row["hold"] is not None
    assert _free(app, ids) == [("08:00", "15:00"), ("16:00", "22:00")]
    assert _messages(app, ids)[-1] == ("proposed", False)
    # The coach cannot accept while the ball is with the student.
    with app.app_context():
        with pytest.raises(HTTPException) as e:
            _decide(app, ids, rid, "accept")
        assert _refusal(e)["code"] == "not_pending"
    with app.app_context():
        assert answer_proposal_service(rid, _player(ids["player_id"]), accept=True).status == "accepted"
    row = _row(app, rid)
    assert row["lesson"] is not None and row["by"] == "student" and row["hold"] is None
    assert _messages(app, ids)[-1] == ("accepted", True)


def test_student_declines_a_proposal(app):
    from padel_app.services.class_request_service import answer_proposal_service

    ids = _setup(app)
    rid = _request(app, ids)
    _decide(app, ids, rid, "propose", date=DAY.isoformat(), startTime="15:00", endTime="16:00")
    with app.app_context():
        assert answer_proposal_service(rid, _player(ids["player_id"]), accept=False).status == "declined"
    assert _row(app, rid)["hold"] is None
    assert _free(app, ids) == [("08:00", "22:00")]


# ── AC: decline and withdraw release the hold ────────────────────────────────

def test_decline_and_withdraw_release_the_hold(app):
    from padel_app.services.class_request_service import withdraw_class_request_service

    ids = _setup(app)
    rid = _request(app, ids, "11:00", "12:00")
    assert _decide(app, ids, rid, "decline") == "declined"
    assert _row(app, rid)["hold"] is None and _free(app, ids) == [("08:00", "22:00")]
    assert _messages(app, ids)[-1] == ("declined", False)

    rid2 = _request(app, ids, "11:00", "12:00")
    with app.app_context():
        assert withdraw_class_request_service(rid2, _player(ids["player_id"])).status == "withdrawn"
    assert _row(app, rid2)["hold"] is None and _free(app, ids) == [("08:00", "22:00")]
    assert _messages(app, ids)[-1] == ("withdrawn", True)


# ── AC: refusals ─────────────────────────────────────────────────────────────

def test_refusals(app):
    from datetime import time
    from padel_app.services.class_request_service import create_class_request_service

    ids = _setup(app)
    _busy(app, ids, class_at=(time(10, 0), time(11, 0)))
    with app.app_context():
        player = _player(ids["player_id"])
        base = {"coachId": ids["coach_id"], "date": DAY.isoformat()}
        with pytest.raises(HTTPException) as e:
            create_class_request_service(player, {**base, "startTime": "10:30", "endTime": "11:30"})
        assert _refusal(e)["code"] == "slot_taken"
        with pytest.raises(HTTPException) as e:
            create_class_request_service(player, {**base, "date": (utcnow_naive() - timedelta(days=1)).date().isoformat(),
                                                  "startTime": "10:00", "endTime": "11:00"})
        assert _refusal(e)["code"] == "in_the_past"
        with pytest.raises(HTTPException) as e:
            create_class_request_service(player, {**base, "startTime": "12:00", "endTime": "16:00"})
        assert e.value.code == 400  # longer than 180 minutes
        # A coach the student is not rostered with.
        stranger = _add_student(ids["coach_id"], "stranger", level_id=ids["level_ids"]["5"])
        from padel_app.models import Association_CoachPlayer
        Association_CoachPlayer.query.filter_by(player_id=stranger).delete()
        db.session.commit()
        with pytest.raises(HTTPException) as e:
            create_class_request_service(_player(stranger), {**base, "startTime": "12:00", "endTime": "13:00"})
        assert e.value.code == 403


# ── rule 8 + wire: listing and routes ────────────────────────────────────────

def test_routes_list_per_role_and_decide(app, client):
    from flask_jwt_extended import create_access_token
    from padel_app.models.players import Player

    ids = _setup(app)
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        student = {"Authorization": f"Bearer {create_access_token(identity=str(db.session.get(Player, ids['player_id']).user_id))}"}
        coach = {"Authorization": f"Bearer {create_access_token(identity=str(ids['coach_user_id']))}"}

    coaches = client.get("/api/app/class-requests/coaches", headers=student).get_json()
    assert coaches == [{"id": str(ids["coach_id"]), "name": "Coach"}]
    free = client.get(f"/api/app/class-requests/free-blocks?coachId={ids['coach_id']}&from={DAY.isoformat()}T00:00:00&to={DAY.isoformat()}T23:59:00",
                      headers=student).get_json()
    assert free == [{"date": DAY.isoformat(), "startTime": "08:00", "endTime": "22:00"}]

    res = client.post("/api/app/class-requests", headers=student,
                      json={"coachId": ids["coach_id"], "date": DAY.isoformat(), "startTime": "11:00", "endTime": "12:00"})
    assert res.status_code == 201, res.get_json()
    rid = res.get_json()["id"]
    assert [r["id"] for r in client.get("/api/app/class-requests", headers=student).get_json()] == [rid]
    listed = client.get("/api/app/class-requests", headers=coach).get_json()
    assert [(r["id"], r["playerName"], r["status"]) for r in listed] == [(rid, "booker", "pending")]

    assert client.post(f"/api/app/class-requests/{rid}/accept", headers=student).status_code == 403
    res = client.post(f"/api/app/class-requests/{rid}/propose", headers=coach,
                      json={"date": DAY.isoformat(), "startTime": "15:00", "endTime": "16:00"})
    assert res.status_code == 200 and res.get_json()["status"] == "countered"
    res = client.post(f"/api/app/class-requests/{rid}/accept-proposal", headers=student)
    assert res.status_code == 200 and res.get_json()["status"] == "accepted" and res.get_json()["lessonId"]
