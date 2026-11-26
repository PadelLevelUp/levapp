"""PAD-789 item 3 — admin.engine-health rule 8e: a refused notification permission is reported as a
state (`phase: refused`, `permission: denied`, no `errorClass`), stored as its own incident kind,
and counted on the summary as distinct students whose refusal no later channel has ended."""
import itertools
import json
from contextlib import contextmanager
from datetime import datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import event

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, bearer, make_role, signing
from padel_app.utils.dates import utcnow_naive

NOW = datetime(2027, 7, 12, 10, 0)
WINDOW_DAYS = 7  # const:MESSAGE_RECIPIENT_WINDOW_DAYS
REFUSAL = {"platform": "ios", "phase": "refused", "permission": "denied", "build": "33"}
URL = "/api/notifications/registration-failure"
_seq = itertools.count()


def _headers(app, user_id):
    signing(app)
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _user(username, *, player=True, coach=False):
    from padel_app.models import Coach, Player, User

    u = User(name=f"Name {username}", username=username, email=f"{username}@t.test", password="x",
             status="active")
    db.session.add(u)
    db.session.flush()
    if player:
        db.session.add(Player(user_id=u.id))
    if coach:
        db.session.add(Coach(user_id=u.id))
    db.session.flush()
    return u.id


def _refusal(user_id, channel, at):
    from padel_app.models.delivery_incident import DeliveryIncident

    db.session.add(DeliveryIncident(kind="push_permission_refused", channel=channel, user_id=user_id,
                                    created_at=at, updated_at=at, detail="build=33"))
    db.session.flush()


def _token(user_id, platform, at):
    from padel_app.models import DeviceToken

    db.session.add(DeviceToken(user_id=user_id, token=f"ExponentPushToken[t{next(_seq)}]",
                               platform=platform, created_at=at, updated_at=at))
    db.session.flush()


def _kind(kind):
    from padel_app.models.delivery_incident import DeliveryIncident
    return DeliveryIncident.query.filter_by(kind=kind).all()


@contextmanager
def _statements(app):
    with app.app_context():
        engine = db.engine
    recorded = []

    def _record(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            recorded.append(statement)

    event.listen(engine, "before_cursor_execute", _record)
    try:
        yield recorded
    finally:
        event.remove(engine, "before_cursor_execute", _record)


@pytest.mark.criterion("ADMIN-ENGINE-HEALTH-35")
def test_a_refusal_report_is_closed_and_stored_apart_from_failures(app, client):
    with app.app_context():
        uid = _user("p789r1")
        db.session.commit()
    h = _headers(app, uid)
    assert client.post(URL, json=REFUSAL, headers=h).status_code == 204
    with app.app_context():
        rows = _kind("push_permission_refused")
        assert [(r.channel, r.detail, r.error_class) for r in rows] == [("apns", "build=33", None)]
        assert _kind("push_registration_failed") == []
    bad = [
        {**REFUSAL, "errorClass": "http_503"},
        {**REFUSAL, "permission": "granted"},
        {**REFUSAL, "token": "ExponentPushToken[x]"},
        {"platform": "ios", "phase": "token", "permission": "denied", "build": "33"},
    ]
    for body in bad:
        assert client.post(URL, json=body, headers=h).status_code == 400, body
    assert client.post(URL, json=REFUSAL).status_code == 401
    # five rows a day: the sixth is acknowledged and dropped
    for _ in range(5):
        assert client.post(URL, json=REFUSAL, headers=h).status_code == 204
    with app.app_context():
        assert len(_kind("push_permission_refused")) == 5
    # the summary: no failure moves, and no refusal row, kind or user id is in the incidents block
    admin = bearer(admin_token(app, make_role(app, "sam@levapp.app", "support")))
    body = client.get("/admin/api/engine-health", headers=admin).get_json()
    assert body["push"]["registrationFailures7d"] == {"ios": 0, "android": 0, "web": 0}
    inc = body["incidents"]
    assert "push_permission_refused" not in inc["last24h"] and "push_permission_refused" not in inc["last7d"]
    assert inc["recent"] == []
    assert "push_permission_refused" not in json.dumps(inc)


@pytest.mark.criterion("ADMIN-ENGINE-HEALTH-36")
def test_the_refused_count_is_distinct_students_with_no_channel_and_apart_from_no_channel(app):
    from padel_app.services.admin.engine_health import _push

    two = NOW - timedelta(days=2)
    with app.app_context():
        a = _user("p789a")
        _refusal(a, "apns", two)                                   # counts: ios
        b = _user("p789b")
        _refusal(b, "webpush", two)
        _refusal(b, "apns", two)                                   # counts once in total
        c = _user("p789c")
        _refusal(c, "apns", NOW - timedelta(days=WINDOW_DAYS + 1))  # outside the window
        d = _user("p789d")
        _refusal(d, "apns", two)
        _token(d, "ios", two + timedelta(hours=1))                 # registered after: out
        g = _user("p789g")
        _token(g, "ios", two - timedelta(days=30))                 # token older than the refusal
        _refusal(g, "apns", two)                                   # refused in Settings: counts
        h = _user("p789h")
        _token(h, None, two - timedelta(days=30))                  # legacy NULL-platform token, older
        _refusal(h, "apns", two)                                   # counts
        coach = _user("p789coach", player=False, coach=True)
        _refusal(coach, "apns", two)                               # not a student
        _user("p789never")                                         # never reported
        db.session.commit()
        push = _push(NOW)
        assert push["permissionRefused"] == {"windowDays": WINDOW_DAYS, "total": 4, "ios": 4,
                                             "android": 0, "web": 1}
        # "never asked" is not a refusal: noChannel still counts only what rule 13 says
        assert push["messageRecipients"]["noChannel"] == 0


@pytest.mark.criterion("ADMIN-ENGINE-HEALTH-37")
def test_the_refused_count_does_not_grow_with_students(app):
    from padel_app.services.admin.engine_health import _push

    def seed(n, prefix):
        with app.app_context():
            for i in range(n):
                _refusal(_user(f"{prefix}{i}"), "apns", NOW - timedelta(days=1))
            db.session.commit()

    def count():
        with app.app_context(), _statements(app) as recorded:
            push = _push(NOW)
        return push["permissionRefused"]["total"], len(recorded)

    seed(3, "p789few")
    total3, statements3 = count()
    seed(27, "p789many")
    total30, statements30 = count()
    assert (total3, total30) == (3, 30)
    assert statements3 == statements30


@pytest.mark.criterion("ADMIN-ENGINE-HEALTH-40")
def test_registering_the_same_token_again_refreshes_it_and_ends_the_refusal(app, client):
    from padel_app.services.admin.engine_health import _push

    token = "ExponentPushToken[p789refresh]"
    with app.app_context():
        uid = _user("p789refresh")
        from padel_app.models import DeviceToken
        old = utcnow_naive() - timedelta(days=1)
        db.session.add(DeviceToken(user_id=uid, token=token, platform="ios", created_at=old,
                                   updated_at=old, sound_capable=False))
        db.session.commit()
    h = _headers(app, uid)
    assert client.post(URL, json=REFUSAL, headers=h).status_code == 204
    with app.app_context():
        assert _push(utcnow_naive())["permissionRefused"]["total"] == 1
    assert client.post("/api/notifications/device", json={"token": token, "platform": "ios"},
                       headers=h).status_code == 200
    with app.app_context():
        assert _push(utcnow_naive())["permissionRefused"]["total"] == 0
