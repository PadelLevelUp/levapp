"""PAD-281 / B-077 — classes.class-requests rule 10: the student counter-proposes
and the loop continues; rule 6: every class-request message carries the slot
it is about, so the chat bubble can tell a live proposal from a stale one.

Reuses PAD-104's seed and helpers (one coach, one club, DAY = today + 10).
"""
import pytest
from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db
from padel_app.tests.test_pad104_class_requests import (
    DAY, _busy, _coach, _decide, _free, _messages, _player, _refusal, _request, _row, _setup,
)


def _counter(app, ids, rid, start, end, *, pid=None, day=None):
    from padel_app.services.class_request_service import counter_proposal_service

    with app.app_context():
        row = counter_proposal_service(
            rid, _player(pid or ids["player_id"]),
            {"date": (day or DAY).isoformat(), "startTime": start, "endTime": end},
        )
        return row.status


def _last_meta(app, ids):
    from padel_app.models import Message, Player
    from padel_app.services.notification_service import _get_or_create_direct_conversation

    with app.app_context():
        player_uid = db.session.get(Player, ids["player_id"]).user_id
        conv = _get_or_create_direct_conversation(ids["coach_user_id"], player_uid)
        m = Message.query.filter_by(conversation_id=conv.id).order_by(Message.id.desc()).first()
        return dict((m.msg_metadata or {}).get("classRequest", {}))


# ── AC: the student counter-proposes and the loop continues ──────────────────

def test_counter_proposal_moves_the_slot_back_to_pending_and_tells_the_coach(app):
    ids = _setup(app)
    rid = _request(app, ids, "11:00", "12:00")
    assert _decide(app, ids, rid, "propose", date=DAY.isoformat(), startTime="15:00", endTime="16:00") == "countered"
    # Rule 6: the coach's proposal message says which slot it is about.
    assert _last_meta(app, ids)["slot"] == {"date": DAY.isoformat(), "startTime": "15:00", "endTime": "16:00"}

    assert _counter(app, ids, rid, "17:00", "18:00") == "pending"
    row = _row(app, rid)
    assert row["start"].hour == 17 and row["end"].hour == 18 and row["hold"] is not None
    assert _free(app, ids) == [("08:00", "17:00"), ("18:00", "22:00")]
    # Told from the student's side, with the new slot.
    assert _messages(app, ids)[-1] == ("countered", True)
    meta = _last_meta(app, ids)
    assert meta["status"] == "pending" and meta["slot"]["startTime"] == "17:00"

    # The coach accepts the student's time and the class lands there.
    assert _decide(app, ids, rid, "accept") == "accepted"
    row = _row(app, rid)
    assert row["lesson"] is not None and row["start"].hour == 17 and row["hold"] is None


def test_rounds_are_unlimited(app):
    ids = _setup(app)
    rid = _request(app, ids, "11:00", "12:00")
    _decide(app, ids, rid, "propose", date=DAY.isoformat(), startTime="15:00", endTime="16:00")
    assert _counter(app, ids, rid, "17:00", "18:00") == "pending"
    assert _decide(app, ids, rid, "propose", date=DAY.isoformat(), startTime="19:00", endTime="20:00") == "countered"
    assert _counter(app, ids, rid, "09:00", "10:00") == "pending"
    assert _decide(app, ids, rid, "accept") == "accepted"
    assert _row(app, rid)["start"].hour == 9
    kinds = [k for k, _ in _messages(app, ids)]
    assert kinds == ["requested", "proposed", "countered", "proposed", "countered", "accepted"]


def test_counter_proposal_may_overlap_its_own_hold(app):
    ids = _setup(app)
    rid = _request(app, ids, "11:00", "12:00")
    _decide(app, ids, rid, "propose", date=DAY.isoformat(), startTime="15:00", endTime="16:00")
    # 15:30–16:30 overlaps the hold placed for the coach's proposal — that hold is ours.
    assert _counter(app, ids, rid, "15:30", "16:30") == "pending"
    assert _free(app, ids) == [("08:00", "15:30"), ("16:30", "22:00")]


def test_counter_proposal_refusals(app):
    from datetime import timedelta

    ids = _setup(app)
    rid = _request(app, ids, "11:00", "12:00")

    # Rule 10: only a countered request can be counter-proposed.
    with app.app_context():
        with pytest.raises(HTTPException) as e:
            _counter(app, ids, rid, "17:00", "18:00")
        assert _refusal(e)["code"] == "not_countered"

    _decide(app, ids, rid, "propose", date=DAY.isoformat(), startTime="15:00", endTime="16:00")

    # Another student's request is not ours.
    from padel_app.tests.test_pad128_eligibility import _add_student
    with app.app_context():
        other = _add_student(ids["coach_id"], "other", level_id=ids["level_ids"]["5"])
        db.session.commit()
    with app.app_context():
        with pytest.raises(HTTPException) as e:
            _counter(app, ids, rid, "17:00", "18:00", pid=other)
        assert e.value.code == 403

    # Rule 7 via rule 10: the past is refused.
    with app.app_context():
        with pytest.raises(HTTPException) as e:
            _counter(app, ids, rid, "10:00", "11:00", day=DAY - timedelta(days=20))
        assert _refusal(e)["code"] == "in_the_past"

    # Rule 2 via rule 10: length bounds are a 400.
    with app.app_context():
        with pytest.raises(HTTPException) as e:
            _counter(app, ids, rid, "17:00", "17:20")
        assert e.value.code == 400

    # A slot the coach's calendar does not leave free.
    _busy(app, ids, class_at=(__import__("datetime").time(17, 0), __import__("datetime").time(18, 0)))
    with app.app_context():
        with pytest.raises(HTTPException) as e:
            _counter(app, ids, rid, "17:00", "18:00")
        assert _refusal(e)["code"] == "slot_taken"

    # Nothing moved: the coach's proposal is still on the table.
    row = _row(app, rid)
    assert row["status"] == "countered" and row["start"].hour == 15

    # Once decided, a late counter-proposal is the same 409 (the bubble degrades, never 500).
    from padel_app.services.class_request_service import answer_proposal_service
    with app.app_context():
        answer_proposal_service(rid, _player(ids["player_id"]), accept=False)
    with app.app_context():
        with pytest.raises(HTTPException) as e:
            _counter(app, ids, rid, "19:00", "20:00")
        assert _refusal(e)["code"] == "not_countered"


# ── wire: the route, and free blocks that leave the caller's own hold out ────

def test_route_and_free_blocks_exclude_own_hold(app, client):
    from flask_jwt_extended import create_access_token
    from padel_app.models.players import Player

    ids = _setup(app)
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        student = {"Authorization": f"Bearer {create_access_token(identity=str(db.session.get(Player, ids['player_id']).user_id))}"}
        coach = {"Authorization": f"Bearer {create_access_token(identity=str(ids['coach_user_id']))}"}

    rid = _request(app, ids, "11:00", "12:00")
    res = client.post(f"/api/app/class-requests/{rid}/propose", headers=coach,
                      json={"date": DAY.isoformat(), "startTime": "15:00", "endTime": "16:00"})
    assert res.status_code == 200 and res.get_json()["status"] == "countered"

    base = f"/api/app/class-requests/free-blocks?coachId={ids['coach_id']}&from={DAY.isoformat()}T00:00:00&to={DAY.isoformat()}T23:59:00"
    assert client.get(base, headers=student).get_json() == [
        {"date": DAY.isoformat(), "startTime": "08:00", "endTime": "15:00"},
        {"date": DAY.isoformat(), "startTime": "16:00", "endTime": "22:00"},
    ]
    assert client.get(f"{base}&excludeRequestId={rid}", headers=student).get_json() == [
        {"date": DAY.isoformat(), "startTime": "08:00", "endTime": "22:00"},
    ]

    # The coach may not counter-propose (that is `propose`), and the student's route works.
    assert client.post(f"/api/app/class-requests/{rid}/counter-proposal", headers=coach,
                       json={"date": DAY.isoformat(), "startTime": "17:00", "endTime": "18:00"}).status_code == 403
    res = client.post(f"/api/app/class-requests/{rid}/counter-proposal", headers=student,
                      json={"date": DAY.isoformat(), "startTime": "17:00", "endTime": "18:00"})
    assert res.status_code == 200, res.get_json()
    assert res.get_json()["status"] == "pending" and res.get_json()["startTime"] == "17:00"

    res = client.post(f"/api/app/class-requests/{rid}/accept", headers=coach)
    assert res.status_code == 200 and res.get_json()["status"] == "accepted" and res.get_json()["lessonId"]

    res = client.post(f"/api/app/class-requests/{rid}/counter-proposal", headers=student,
                      json={"date": DAY.isoformat(), "startTime": "19:00", "endTime": "20:00"})
    assert res.status_code == 409 and res.get_json()["code"] == "not_countered"
