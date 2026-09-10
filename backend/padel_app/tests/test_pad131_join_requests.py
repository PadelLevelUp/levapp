"""PAD-131 — classes.join-requests: request, accept, reject, first fill wins.

Seed: the Phase-1 eligibility fixture (ladder `4 → 5 → 5-`, one class at level
`5`, max 4, one instance linked to the coach). Students are added with
`_add_student` and committed so the service's own contexts see them.
"""
from datetime import timedelta

import pytest
from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _cp, _seed
from padel_app.utils.dates import utcnow_naive

LEVEL_SAME = [{"attribute": "level", "operation": "same_as_class"}]


def _config(app, ids, **fields):
    from padel_app.models.notification_config import NotificationConfig

    with app.app_context():
        cfg = NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).first()
        for k, v in fields.items():
            setattr(cfg, k, v)
        db.session.commit()


def _student(app, ids, name, level="5"):
    with app.app_context():
        pid = _add_student(ids["coach_id"], name, level_id=ids["level_ids"][level])
        db.session.commit()
    return pid


def _player(pid):
    from padel_app.models.players import Player

    return db.session.get(Player, pid)


def _coach(cid):
    from padel_app.models import Coach

    return db.session.get(Coach, cid)


def _request(app, ids, pid, *, model="LessonInstance", original_id=None, date=None):
    from padel_app.services.class_join_request_service import create_join_request_service

    with app.app_context():
        row, created = create_join_request_service(
            _player(pid), model, original_id or ids["instance_id"], date
        )
        return row.id, row.status, created


def _decide(app, ids, request_id, *, accept, confirm=False):
    from padel_app.services.class_join_request_service import decide_join_request_service

    with app.app_context():
        row = decide_join_request_service(request_id, _coach(ids["coach_id"]), accept=accept, confirm=confirm)
        return row.status


def _refusal(exc_info):
    """The `{code, ...}` body of a 409 raised through `abort(make_response(...))`."""
    return exc_info.value.response.get_json()


def _messages_for(app, ids, pid):
    from padel_app.models import Message, Player, Coach
    from padel_app.services.notification_service import _get_or_create_direct_conversation

    with app.app_context():
        coach_uid = db.session.get(Coach, ids["coach_id"]).user_id
        player_uid = db.session.get(Player, pid).user_id
        conv = _get_or_create_direct_conversation(coach_uid, player_uid)
        return [
            (m.sender_id == player_uid, m.text, m.msg_metadata or {})
            for m in Message.query.filter_by(conversation_id=conv.id).order_by(Message.id.asc()).all()
        ]


def _enrolled(app, ids, pid):
    from padel_app.models.Association_PlayerLessonInstance import Association_PlayerLessonInstance
    from padel_app.models.presences import Presence

    with app.app_context():
        assoc = Association_PlayerLessonInstance.query.filter_by(player_id=pid, lesson_instance_id=ids["instance_id"]).first()
        pres = Presence.query.filter_by(player_id=pid, lesson_instance_id=ids["instance_id"]).first()
        return assoc is not None, pres is not None


def _status(app, request_id):
    from padel_app.models import ClassJoinRequest

    with app.app_context():
        return db.session.get(ClassJoinRequest, request_id).status


# ── AC: eligible student requests an open spot ───────────────────────────────

def test_eligible_student_requests_and_the_coach_is_told(app):
    ids = _seed(app, eligibility_rules=LEVEL_SAME)
    _config(app, ids, open_spots_visible=True)
    pid = _student(app, ids, "asker")
    rid, status, created = _request(app, ids, pid)
    assert (status, created) == ("pending", True)
    # Rule 3: a second request is the same row, not a duplicate.
    assert _request(app, ids, pid) == (rid, "pending", False)
    msgs = _messages_for(app, ids, pid)
    assert len(msgs) == 1
    from_student, text, meta = msgs[0]
    assert from_student and "asker" in text and meta["joinRequest"] == {"id": rid, "status": "pending"}


def test_server_refuses_what_the_calendar_would_not_show(app):
    from padel_app.services.class_join_request_service import create_join_request_service

    ids = _seed(app, eligibility_rules=LEVEL_SAME)
    weak = _student(app, ids, "weak", "5-")
    strong = _student(app, ids, "strong")
    with app.app_context():
        # Coach does not advertise spots (default off).
        with pytest.raises(HTTPException) as e:
            create_join_request_service(_player(strong), "LessonInstance", ids["instance_id"], None)
        assert _refusal(e)["code"] == "not_visible"
    _config(app, ids, open_spots_visible=True)
    with app.app_context():
        with pytest.raises(HTTPException) as e:
            create_join_request_service(_player(weak), "LessonInstance", ids["instance_id"], None)
        assert _refusal(e)["code"] == "ineligible"


# ── AC: a student cannot request a class they are already in ────────────────

def test_an_enrolled_student_cannot_request(app):
    from padel_app.models.Association_PlayerLessonInstance import Association_PlayerLessonInstance
    from padel_app.services.class_join_request_service import create_join_request_service

    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    pid = _student(app, ids, "member")
    with app.app_context():
        db.session.add(Association_PlayerLessonInstance(player_id=pid, lesson_instance_id=ids["instance_id"]))
        db.session.commit()
        with pytest.raises(HTTPException) as e:
            create_join_request_service(_player(pid), "LessonInstance", ids["instance_id"], None)
        assert _refusal(e)["code"] == "already_enrolled"


# ── AC: coach accepts / rejects ──────────────────────────────────────────────

def test_coach_accepts_and_the_student_is_enrolled_with_the_vacancy_attributed(app):
    from padel_app.models import Vacancy

    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    pid = _student(app, ids, "asker")
    with app.app_context():
        db.session.add(Vacancy(lesson_instance_id=ids["instance_id"], coach_id=ids["coach_id"], status="open"))
        db.session.commit()
    rid, _, _ = _request(app, ids, pid)
    assert _decide(app, ids, rid, accept=True) == "accepted"
    assert _enrolled(app, ids, pid) == (True, True)
    with app.app_context():
        v = Vacancy.query.filter_by(lesson_instance_id=ids["instance_id"]).first()
        assert (v.status, v.filled_by_player_id) == ("filled", pid)
    assert any((not from_student) and meta.get("joinRequest", {}).get("status") == "accepted"
               for from_student, _, meta in _messages_for(app, ids, pid))


def test_coach_rejects_and_nothing_else_happens(app):
    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    pid = _student(app, ids, "asker")
    rid, _, _ = _request(app, ids, pid)
    assert _decide(app, ids, rid, accept=False) == "rejected"
    assert _enrolled(app, ids, pid) == (False, False)
    assert any((not from_student) and meta.get("joinRequest", {}).get("status") == "rejected"
               for from_student, _, meta in _messages_for(app, ids, pid))
    # The spot stays open: another student can still request it.
    other = _student(app, ids, "other")
    assert _request(app, ids, other)[1] == "pending"


# ── AC: requesting a virtual occurrence materializes it ──────────────────────

def test_requesting_a_virtual_occurrence_materializes_it(app):
    from padel_app.models import ClassJoinRequest
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.Association_CoachLesson import Association_CoachLesson

    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    with app.app_context():
        lesson = db.session.get(Lesson, ids["lesson_id"])
        db.session.add(Association_CoachLesson(coach_id=ids["coach_id"], lesson_id=lesson.id))
        lesson.is_recurring = True
        lesson.recurrence_rule = '{"frequency": "weekly", "daysOfWeek": [%d]}' % ((lesson.start_datetime.weekday() + 1) % 7)
        lesson.recurrence_end = (lesson.start_datetime + timedelta(weeks=6)).date()
        db.session.commit()
        next_week = (lesson.start_datetime + timedelta(weeks=1)).date()
        before = LessonInstance.query.count()
    pid = _student(app, ids, "asker")
    rid, status, _ = _request(app, ids, pid, model="Lesson", original_id=ids["lesson_id"], date=next_week.isoformat())
    with app.app_context():
        assert LessonInstance.query.count() == before + 1
        row = db.session.get(ClassJoinRequest, rid)
        inst = db.session.get(LessonInstance, row.lesson_instance_id)
        assert inst.original_lesson_occurence_date == next_week and status == "pending"


# ── AC: first fill wins ──────────────────────────────────────────────────────

def _fill_to_one_spot(app, ids, count=3):
    from padel_app.models.Association_PlayerLessonInstance import Association_PlayerLessonInstance

    with app.app_context():
        for i in range(count):
            pid = _add_student(ids["coach_id"], f"filler{i}", level_id=ids["level_ids"]["5"])
            db.session.add(Association_PlayerLessonInstance(player_id=pid, lesson_instance_id=ids["instance_id"]))
        db.session.commit()


@pytest.mark.parametrize("auto_reply", [True, False])
def test_an_invitation_filling_the_spot_supersedes_pending_requests(app, auto_reply):
    from padel_app.helpers.calendar_helpers import load_open_spot_events_for_player
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import _add_player_to_instance

    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True, auto_notify_enabled=auto_reply)
    _fill_to_one_spot(app, ids)
    a, b = _student(app, ids, "asker_a"), _student(app, ids, "asker_b")
    invited = _student(app, ids, "invited")
    ra, _, _ = _request(app, ids, a)
    rb, _, _ = _request(app, ids, b)
    with app.app_context():
        # The invitation "yes" path enrols through this very function.
        _add_player_to_instance(invited, db.session.get(LessonInstance, ids["instance_id"]))
        db.session.commit()
    assert (_status(app, ra), _status(app, rb)) == ("superseded", "superseded")
    for pid in (a, b):
        msgs = _messages_for(app, ids, pid)
        coach_alerts = [m for m in msgs if m[0] and m[2].get("joinRequest", {}).get("status") == "superseded"]
        auto_replies = [m for m in msgs if (not m[0]) and m[2].get("joinRequest", {}).get("status") == "superseded"]
        assert len(coach_alerts) == 1, "the coach is alerted either way"
        assert len(auto_replies) == (1 if auto_reply else 0)
    with app.app_context():
        now = utcnow_naive()
        for pid in (a, b):
            assert load_open_spot_events_for_player(pid, now - timedelta(days=1), now + timedelta(days=30)) == []


def test_an_accepted_request_retires_outstanding_invitations(app):
    from padel_app.models import Coach, Message, NotificationEvent, Player, Vacancy
    from padel_app.services.notification_service import _get_or_create_direct_conversation

    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    _fill_to_one_spot(app, ids)
    asker = _student(app, ids, "asker")
    invitees = [_student(app, ids, "inv1"), _student(app, ids, "inv2")]
    with app.app_context():
        coach_uid = db.session.get(Coach, ids["coach_id"]).user_id
        vacancy = Vacancy(lesson_instance_id=ids["instance_id"], coach_id=ids["coach_id"], status="open")
        db.session.add(vacancy)
        db.session.flush()
        event_ids = []
        for pid in invitees:
            conv = _get_or_create_direct_conversation(coach_uid, db.session.get(Player, pid).user_id)
            msg = Message(text="invite", sender_id=coach_uid, conversation_id=conv.id,
                          message_type="class_invitation", msg_metadata={"responded": False})
            db.session.add(msg)
            db.session.flush()
            ev = NotificationEvent(coach_id=ids["coach_id"], lesson_instance_id=ids["instance_id"], player_id=pid,
                                   type="auto", status="sent", message_id=msg.id, vacancy_id=vacancy.id)
            db.session.add(ev)
            db.session.flush()
            event_ids.append(ev.id)
        db.session.commit()
    rid, _, _ = _request(app, ids, asker)
    assert _decide(app, ids, rid, accept=True) == "accepted"
    with app.app_context():
        v = Vacancy.query.filter_by(lesson_instance_id=ids["instance_id"]).first()
        assert (v.status, v.filled_by_player_id) == ("filled", asker)
        for eid in event_ids:
            ev = db.session.get(NotificationEvent, eid)
            assert ev.status == "expired"
            assert db.session.get(Message, ev.message_id).msg_metadata.get("response") == "spot_filled"


# ── AC: a student who fell below the bar is not silently enrolled ───────────

def test_a_student_who_fell_below_the_bar_needs_the_coach_to_confirm(app):
    from padel_app.services.class_join_request_service import decide_join_request_service

    ids = _seed(app, eligibility_rules=LEVEL_SAME)
    _config(app, ids, open_spots_visible=True)
    pid = _student(app, ids, "slipped")
    rid, _, _ = _request(app, ids, pid)
    with app.app_context():
        _cp(ids["coach_id"], pid).level_id = ids["level_ids"]["5-"]
        db.session.commit()
        with pytest.raises(HTTPException) as e:
            decide_join_request_service(rid, _coach(ids["coach_id"]), accept=True)
        body = _refusal(e)
        assert body["code"] == "ineligible" and body["ineligible"][0]["failures"]
    assert _status(app, rid) == "pending"
    assert _decide(app, ids, rid, accept=True, confirm=True) == "accepted"
    assert _enrolled(app, ids, pid) == (True, True)


# ── Rule 15: the class payload and the HTTP surface ─────────────────────────

def test_class_payload_carries_requests_per_role_and_routes_work(app, client):
    from flask_jwt_extended import create_access_token
    from padel_app.models.players import Player

    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    pid = _student(app, ids, "asker")
    with app.app_context():
        student = {"Authorization": f"Bearer {create_access_token(identity=str(db.session.get(Player, pid).user_id))}"}
        coach = {"Authorization": f"Bearer {create_access_token(identity=str(ids['coach_user_id']))}"}

    res = client.post("/api/app/class-join-requests", headers=student,
                      json={"model": "LessonInstance", "originalId": ids["instance_id"], "date": None})
    assert res.status_code == 201, res.get_json()
    rid = res.get_json()["id"]

    url = f"/api/app/class_instance?model=LessonInstance&id={ids['instance_id']}"
    as_student = client.post(url, headers=student).get_json()
    assert as_student["myJoinRequest"]["id"] == rid and "joinRequests" not in as_student
    as_coach = client.post(url, headers=coach).get_json()
    assert [r["id"] for r in as_coach["joinRequests"]] == [rid] and as_coach["joinRequests"][0]["playerName"]

    # A student cannot decide; the coach can.
    assert client.post(f"/api/app/class-join-requests/{rid}/accept", headers=student).status_code == 403
    res = client.post(f"/api/app/class-join-requests/{rid}/accept", headers=coach, json={})
    assert res.status_code == 200 and res.get_json()["status"] == "accepted"
    assert _enrolled(app, ids, pid) == (True, True)
