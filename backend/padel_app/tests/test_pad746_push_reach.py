"""PAD-746 — admin.engine-health rule 8: the push reach of active students on the engine-health
summary, and `POST /api/notifications/registration-failure`, which records a client's failed push
registration (closed fields only) as a `push_registration_failed` incident. One test per
acceptance criterion of rule 8, plus the endpoint's refusals."""
import logging
from datetime import datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, bearer, make_role, signing
from padel_app.tests.helpers import pin_clock
from padel_app.utils.dates import utcnow_naive

NOW = datetime(2027, 7, 12, 10, 0)
VALID = {"platform": "ios", "phase": "post", "permission": "granted", "build": "33",
         "errorClass": "http_503"}


def _user_headers(app, user_id):
    signing(app)
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _support(app):
    return bearer(admin_token(app, make_role(app, "sam@levapp.app", "support")))


def _user(username, *, player=True, coach=False, read_at=None, token=False, webpush=False,
          status="active"):
    """A user; with `read_at`, a conversation they marked read at that time."""
    from padel_app.models import (Coach, Conversation, ConversationParticipant, DeviceToken,
                                  Player, PushSubscription, User)

    u = User(name=username, username=username, email=f"{username}@t.test", password="x",
             status=status)
    db.session.add(u)
    db.session.flush()
    if player:
        db.session.add(Player(user_id=u.id))
    if coach:
        db.session.add(Coach(user_id=u.id))
    if read_at is not None:
        conv = Conversation(participant_key=f"p746-{username}")
        db.session.add(conv)
        db.session.flush()
        db.session.add(ConversationParticipant(conversation_id=conv.id, user_id=u.id,
                                               last_read_at=read_at))
    if token:
        db.session.add(DeviceToken(user_id=u.id, token=f"ExponentPushToken[{username}]",
                                   platform="ios"))
    if webpush:
        db.session.add(PushSubscription(user_id=u.id, subscription_json="{}"))
    db.session.flush()
    return u.id


def _incidents():
    from padel_app.models.delivery_incident import DeliveryIncident
    return DeliveryIncident.query.filter_by(kind="push_registration_failed").all()


def test_the_summary_counts_active_students_by_push_channel(app, client):
    # The real clock: the admin gate checks its token against it, so the summary is not pinned.
    now = utcnow_naive()
    headers = _support(app)
    recent = now - timedelta(days=2)
    with app.app_context():
        _user("p746none1", read_at=recent)
        _user("p746none2", read_at=recent, status="inactive")  # no status filter (PAD-741)
        _user("p746web", read_at=recent, webpush=True)
        _user("p746ios", read_at=recent, token=True)
        _user("p746both", read_at=recent, token=True, webpush=True)
        _user("p746coachplayer", read_at=recent, coach=True)  # coaches who play count too
        _user("p746stale", read_at=now - timedelta(days=8))  # outside the window
        _user("p746coachonly", player=False, coach=True, read_at=recent)  # not a student
        _user("p746neverread", read_at=None)
        db.session.commit()
    body = client.get("/admin/api/engine-health", headers=headers).get_json()
    assert body["push"]["activeStudents7d"] == {
        "total": 6, "noChannel": 3, "webPushOnly": 1, "nativeOnly": 1, "nativeAndWebPush": 1,
    }


def test_a_student_in_two_read_conversations_counts_once(app, client):
    from padel_app.models import Conversation, ConversationParticipant

    now = utcnow_naive()
    headers = _support(app)
    with app.app_context():
        uid = _user("p746twice", read_at=now - timedelta(days=1))
        conv = Conversation(participant_key="p746-twice-2")
        db.session.add(conv)
        db.session.flush()
        db.session.add(ConversationParticipant(conversation_id=conv.id, user_id=uid,
                                               last_read_at=now - timedelta(hours=1)))
        db.session.commit()
    body = client.get("/admin/api/engine-health", headers=headers).get_json()
    assert body["push"]["activeStudents7d"]["total"] == 1


def test_a_reported_failure_is_logged_recorded_and_counted(app, client, caplog):
    with app.app_context():
        uid = _user("p746reporter")
        db.session.commit()
    with caplog.at_level(logging.WARNING, logger="padel_app.modules.notifications_api"):
        resp = client.post("/api/notifications/registration-failure", json=VALID,
                           headers=_user_headers(app, uid))
    assert resp.status_code == 204
    with app.app_context():
        (row,) = _incidents()
        assert (row.channel, row.user_id, row.error_class) == ("apns", uid, "http_503")
        assert row.detail == "phase=post permission=granted build=33"
    (line,) = [r.getMessage() for r in caplog.records if "push registration failed" in r.getMessage()]
    assert "platform=ios" in line and "phase=post" in line and "error=http_503" in line
    body = client.get("/admin/api/engine-health", headers=_support(app)).get_json()
    assert body["push"]["registrationFailures7d"] == {"ios": 1, "android": 0, "web": 0}
    assert body["incidents"]["last24h"]["push_registration_failed"] == 1


def test_a_web_failure_maps_to_webpush(app, client):
    with app.app_context():
        uid = _user("p746webreporter")
        db.session.commit()
    body = dict(VALID, platform="web", phase="subscribe", errorClass="NotAllowedError",
                build="web-abc1234")
    assert client.post("/api/notifications/registration-failure", json=body,
                       headers=_user_headers(app, uid)).status_code == 204
    with app.app_context():
        assert [r.channel for r in _incidents()] == ["webpush"]


@pytest.mark.parametrize("change", [
    {"platform": "windows"},
    {"phase": "subscribe"},                      # not an iOS phase
    {"permission": "maybe"},
    {"errorClass": "Error: could not reach https://exp.host/--/api"},  # free text
    {"build": "33 (beta)"},
    {"errorClass": "x" * 61},
    {"token": "ExponentPushToken[abc]"},         # an extra field is refused, never stored
    {"build": None},
])
def test_anything_but_the_closed_fields_is_refused(app, client, change):
    with app.app_context():
        uid = _user(f"p746bad{abs(hash(str(change))) % 10_000}")
        db.session.commit()
    body = {k: v for k, v in {**VALID, **change}.items()}
    resp = client.post("/api/notifications/registration-failure", json=body,
                       headers=_user_headers(app, uid))
    assert resp.status_code == 400
    with app.app_context():
        assert _incidents() == []


def test_the_report_needs_a_signed_in_user(client):
    assert client.post("/api/notifications/registration-failure", json=VALID).status_code == 401


def test_a_user_adds_at_most_twenty_rows_a_day(app, client, monkeypatch):
    pin_clock(monkeypatch, NOW)
    with app.app_context():
        uid = _user("p746flood")
        db.session.commit()
    headers = _user_headers(app, uid)
    codes = {client.post("/api/notifications/registration-failure", json=VALID,
                         headers=headers).status_code for _ in range(25)}
    assert codes == {204}
    with app.app_context():
        assert len(_incidents()) == 20
