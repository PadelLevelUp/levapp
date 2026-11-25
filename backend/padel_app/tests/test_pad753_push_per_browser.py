"""PAD-753 — one web-push subscription per browser (auth.push-subscription rules 1, 3, 10, 11;
auth.logout rule 4; messaging.push-notifications rule 10a).

A row is keyed by its endpoint: a user's laptop and phone browser each keep their own, the latest
sign-in owns the browser, a user keeps at most five, and a push is one delivery (and one outbox row)
per browser.
"""
import json
from datetime import timedelta
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import text

from padel_app.models.push_subscriptions import WEB_PUSH_SUBSCRIPTIONS_PER_USER
from padel_app.sql_db import db
from padel_app.utils import push_outbox as po
from padel_app.utils.dates import utcnow_naive

LAPTOP, PHONE, OTHER = (f"https://push.example.com/{n}" for n in ("laptop", "phone", "other"))


@pytest.fixture(autouse=True)
def _env(app, monkeypatch):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    monkeypatch.setenv("VAPID_PUBLIC_KEY", "pub")
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "priv")
    monkeypatch.setenv("VAPID_CLAIMS_EMAIL", "mailto:ops@levapp.app")


def _user(app, username="p753"):
    from padel_app.models import User

    with app.app_context():
        user = User(name=username, username=username, email=f"{username}@t.test", password="x", status="active")
        db.session.add(user)
        db.session.commit()
        return user.id


def _headers(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _sub(endpoint):
    return {"endpoint": endpoint, "keys": {"p256dh": "k", "auth": "a"}}


def _save(app, client, user_id, endpoint):
    resp = client.post("/api/notifications/save-subscription", json={"subscription": _sub(endpoint)},
                       headers=_headers(app, user_id))
    assert resp.status_code == 201, resp.get_data(as_text=True)


def _held(app, user_id):
    from padel_app.models import PushSubscription

    with app.app_context():
        rows = PushSubscription.query.filter_by(user_id=user_id).order_by(PushSubscription.id).all()
        return [r.endpoint for r in rows]


class Service:
    """The push service: records where it sent; `answers` maps an endpoint to an HTTP status."""

    def __init__(self, **answers):
        self.answers, self.sent, self.claims = answers, [], []

    def __call__(self, subscription_info, vapid_claims, **_kwargs):
        from pywebpush import WebPushException

        endpoint = subscription_info["endpoint"]
        self.sent.append(endpoint)
        self.claims.append(dict(vapid_claims))
        # As pywebpush does: it writes the endpoint's audience into the claims it is given.
        vapid_claims["aud"] = endpoint
        status = self.answers.get(endpoint.rsplit("/", 1)[1])
        if status:
            exc = WebPushException("no")
            exc.response = type("R", (), {"status_code": status})()
            raise exc


def _push(app, user_id, service):
    from padel_app.utils.push_notifications import send_push_notification

    with app.app_context(), patch("padel_app.utils.push_notifications.webpush", side_effect=service):
        return send_push_notification(user_id, "T", "B", url="/messages/1")


def _outbox(app):
    with app.app_context():
        rows = [dict(r) for r in db.session.execute(text(
            "SELECT id, channel, user_id, payload, status FROM push_outbox ORDER BY id")).mappings()]
    for r in rows:
        # SQLite hands JSON back as text in a raw query.
        r["payload"] = json.loads(r["payload"]) if isinstance(r["payload"], str) else r["payload"]
    return rows


# --- saving -------------------------------------------------------------------------------------

@pytest.mark.criterion("AUTH-PUSH-SUBSCRIPTION-9")
def test_two_browsers_keep_two_subscriptions_and_both_get_the_push(app, client):
    uid = _user(app)
    _save(app, client, uid, LAPTOP)
    _save(app, client, uid, PHONE)
    assert _held(app, uid) == [LAPTOP, PHONE]
    service = Service()
    assert _push(app, uid, service) is True
    assert service.sent == [LAPTOP, PHONE]


@pytest.mark.criterion("AUTH-PUSH-SUBSCRIPTION-10")
def test_the_latest_sign_in_owns_the_browser(app, client):
    ana, rui = _user(app, "p753ana"), _user(app, "p753rui")
    _save(app, client, ana, LAPTOP)
    _save(app, client, rui, LAPTOP)
    assert (_held(app, ana), _held(app, rui)) == ([], [LAPTOP])
    service = Service()
    assert _push(app, ana, service) is False
    assert service.sent == []


@pytest.mark.criterion("AUTH-PUSH-SUBSCRIPTION-11")
def test_a_save_beyond_the_cap_evicts_the_least_recently_updated(app, client):
    from padel_app.models import PushSubscription

    assert WEB_PUSH_SUBSCRIPTIONS_PER_USER == 5
    uid = _user(app)
    browsers = [f"https://push.example.com/b{n}" for n in range(WEB_PUSH_SUBSCRIPTIONS_PER_USER)]
    for endpoint in browsers:
        _save(app, client, uid, endpoint)
    with app.app_context():
        for n, endpoint in enumerate(browsers):
            row = PushSubscription.query.filter_by(endpoint=endpoint).one()
            row.updated_at = utcnow_naive() - timedelta(days=10 - n)
        db.session.commit()
    _save(app, client, uid, browsers[0])  # the oldest, unchanged: now the newest
    _save(app, client, uid, OTHER)
    held = _held(app, uid)
    assert set(held) == {browsers[0], *browsers[2:], OTHER}
    assert len(held) == WEB_PUSH_SUBSCRIPTIONS_PER_USER


@pytest.mark.criterion("AUTH-PUSH-SUBSCRIPTION-12")
def test_unsubscribe_by_endpoint_and_with_no_body(app, client):
    uid, other = _user(app), _user(app, "p753other")
    for endpoint in (LAPTOP, PHONE):
        _save(app, client, uid, endpoint)
    _save(app, client, other, OTHER)
    headers = _headers(app, uid)

    def unsubscribe(**kwargs):
        assert client.delete("/api/notifications/unsubscribe", headers=headers, **kwargs).status_code == 204

    unsubscribe(json={"endpoint": OTHER})  # another user's browser
    assert _held(app, uid) == [LAPTOP, PHONE] and _held(app, other) == [OTHER]
    unsubscribe(json={"endpoint": LAPTOP})
    assert _held(app, uid) == [PHONE]
    unsubscribe()
    assert _held(app, uid) == []
    unsubscribe()
    assert _held(app, other) == [OTHER]


@pytest.mark.criterion("AUTH-PUSH-SUBSCRIPTION-13")
@pytest.mark.parametrize("subscription", [
    {"keys": {}}, _sub(""), _sub(None), _sub(7), _sub("https://push.example.com/" + "x" * 2048), "text",
])
def test_a_save_without_an_endpoint_is_refused(app, client, subscription):
    uid = _user(app)
    resp = client.post("/api/notifications/save-subscription", json={"subscription": subscription},
                       headers=_headers(app, uid))
    assert resp.status_code == 400
    assert _held(app, uid) == []


@pytest.mark.criterion("AUTH-PUSH-SUBSCRIPTION-15")
def test_a_row_the_previous_release_wrote_is_replaced(app, client):
    from padel_app.models import PushSubscription

    uid, previous = _user(app), _user(app, "p753previous")
    stored = json.dumps(_sub(PHONE))
    with app.app_context():
        # What the previous release writes: an insert with no endpoint, or an update of the JSON alone.
        for owner, endpoint in ((uid, None), (uid, LAPTOP), (previous, None)):
            db.session.execute(PushSubscription.__table__.insert().values(
                user_id=owner, endpoint=endpoint, subscription_json=stored,
                created_at=utcnow_naive(), updated_at=utcnow_naive()))
        db.session.commit()
    _save(app, client, uid, PHONE)
    assert _held(app, uid) == [PHONE]
    assert _held(app, previous) == []


# --- sign-out -----------------------------------------------------------------------------------

@pytest.mark.criterion("AUTH-LOGOUT-9")
def test_logout_with_the_endpoint_removes_that_browser_only(app, client):
    from padel_app.models import TokenBlocklist

    uid, other = _user(app), _user(app, "p753other")
    for endpoint in (LAPTOP, PHONE):
        _save(app, client, uid, endpoint)
    _save(app, client, other, OTHER)
    assert client.post("/api/auth/logout", json={"pushEndpoint": LAPTOP}, headers=_headers(app, uid)).status_code == 200
    assert (_held(app, uid), _held(app, other)) == ([PHONE], [OTHER])
    for body in ({"pushEndpoint": OTHER}, {"pushEndpoint": ""}, {"pushEndpoint": 7}, {}, ["list"]):
        assert client.post("/api/auth/logout", json=body, headers=_headers(app, uid)).status_code == 200
    assert (_held(app, uid), _held(app, other)) == ([PHONE], [OTHER])
    with app.app_context():
        assert TokenBlocklist.query.count() == 6


# --- sending ------------------------------------------------------------------------------------

@pytest.mark.criterion("MESSAGING-PUSH-NOTIFICATIONS-38")
def test_a_web_push_reaches_each_browser_in_both_queues(app, client):
    uid = _user(app)
    for endpoint in (LAPTOP, PHONE):
        _save(app, client, uid, endpoint)

    service = Service()
    assert _push(app, uid, service) is True
    assert service.sent == [LAPTOP, PHONE] and _outbox(app) == []
    # Each delivery has claims of its own: pywebpush writes the audience into the dict it is given.
    assert service.claims == [{"sub": "mailto:ops@levapp.app"}] * 2

    app.config["PUSH_QUEUE"] = "outbox"
    service = Service()
    assert _push(app, uid, service) is True
    rows = _outbox(app)
    assert service.sent == [] and [r["channel"] for r in rows] == ["webpush", "webpush"]
    assert len({r["payload"]["subscriptionId"] for r in rows}) == 2
    assert not any(e in str(r["payload"]) for r in rows for e in (LAPTOP, PHONE))
    with patch("padel_app.utils.push_notifications.webpush", side_effect=service):
        assert po.Drainer(app).drain_once() == 2
    assert sorted(service.sent) == sorted([LAPTOP, PHONE])
    assert service.claims == [{"sub": "mailto:ops@levapp.app"}] * 2

    # A row from before PAD-753 names no subscription: it goes to every browser the user holds.
    service = Service(phone=410)
    with app.app_context(), patch("padel_app.utils.push_notifications.webpush", side_effect=service):
        row = {"id": 1, "channel": "webpush", "user_id": uid, "payload": {"title": "T", "body": "B"}, "attempts": 0}
        assert po.send_row(row) == (po.SENT, None)
    assert service.sent == [LAPTOP, PHONE]


@pytest.mark.criterion("MESSAGING-PUSH-NOTIFICATIONS-39")
def test_a_dead_browser_is_dropped_alone(app, client):
    from padel_app.models.delivery_incident import DeliveryIncident

    uid = _user(app)
    for endpoint in (LAPTOP, PHONE):
        _save(app, client, uid, endpoint)
    service = Service(laptop=410)
    _push(app, uid, service)
    assert service.sent == [LAPTOP, PHONE]
    assert _held(app, uid) == [PHONE]
    with app.app_context():
        assert DeliveryIncident.query.filter_by(kind="push_failed", user_id=uid).count() == 1


@pytest.mark.criterion("MESSAGING-PUSH-NOTIFICATIONS-40")
def test_a_retry_resends_only_to_its_browser(app, client):
    uid, other = _user(app), _user(app, "p753other")
    for endpoint in (LAPTOP, PHONE):
        _save(app, client, uid, endpoint)
    app.config["PUSH_QUEUE"] = "outbox"
    service = Service(phone=503)
    _push(app, uid, service)
    drainer = po.Drainer(app)
    with patch("padel_app.utils.push_notifications.webpush", side_effect=service):
        drainer.drain_once()
        assert sorted(service.sent) == sorted([LAPTOP, PHONE])
        with app.app_context():
            db.session.execute(text("UPDATE push_outbox SET due_at = :now WHERE status = 'pending'"),
                               {"now": utcnow_naive()})
            db.session.commit()
        drainer.drain_once()
        assert service.sent[2:] == [PHONE]
        assert [r["status"] for r in _outbox(app)].count("sent") == 1

        # The browser signs in to another account while the row waits: it is not sent there.
        _save(app, client, other, PHONE)
        with app.app_context():
            db.session.execute(text("UPDATE push_outbox SET due_at = :now WHERE status = 'pending'"),
                               {"now": utcnow_naive()})
            db.session.commit()
        drainer.drain_once()
    assert len(service.sent) == 3
    assert sorted(r["status"] for r in _outbox(app)) == ["sent", "skipped"]
