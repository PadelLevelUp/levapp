"""
PAD-173 / B-008 — the browser Web-Push registration contract is ONE route.

`subscribe_notifications` (POST /subscribe) and `save_subscription`
(POST /save-subscription) were byte-for-byte duplicate implementations of the
same upsert. Two implementations of one contract drift silently, which is what
the B-008 ledger entry recorded.

`/save-subscription` is the survivor, not the tidier-sounding `/subscribe`:
it is the only path any client has ever called
(frontend/apps/web/src/utils/pushNotifications.ts), so keeping `/subscribe`
instead would have broken push registration for every already-cached web
bundle and service worker. Native iOS is unaffected — it registers device
tokens at /api/notifications/device, a separate contract.

Covers auth.push-subscription rules 1, 2, 5, 6 and both acceptance criteria.
"""
import json

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _create_user(name, username):
    from padel_app.models import User
    u = User(
        name=name,
        username=username,
        email=f"{username}@test.com",
        password="x",
        status="active",
    )
    db.session.add(u)
    db.session.flush()
    return u


def _subscription(endpoint="https://push.example.com/ep-1"):
    return {
        "endpoint": endpoint,
        "keys": {"p256dh": "BKxQ_fake_key", "auth": "fake_auth"},
    }


# ---------------------------------------------------------------------------
# The surviving contract: POST /api/notifications/save-subscription
# ---------------------------------------------------------------------------

def test_save_subscription_creates_row(client, app):
    from padel_app.models import PushSubscription

    with app.app_context():
        user = _create_user("Coach A", "pad173-user-1")
        db.session.commit()
        user_id = user.id

    resp = client.post(
        "/api/notifications/save-subscription",
        json={"subscription": _subscription()},
        headers=_auth_header(app, user_id),
    )
    assert resp.status_code == 201

    with app.app_context():
        row = PushSubscription.query.filter_by(user_id=user_id).one()
        # Assert on the stored payload, not just row existence — a route that
        # created an empty row would otherwise pass.
        assert json.loads(row.subscription_json)["endpoint"] == (
            "https://push.example.com/ep-1"
        )


def test_save_subscription_upserts_one_row_per_user(client, app):
    """Rule 1: one subscription per user. Re-registering replaces, never adds."""
    from padel_app.models import PushSubscription

    with app.app_context():
        user = _create_user("Coach B", "pad173-user-2")
        db.session.commit()
        user_id = user.id

    headers = _auth_header(app, user_id)
    first = client.post(
        "/api/notifications/save-subscription",
        json={"subscription": _subscription("https://push.example.com/first")},
        headers=headers,
    )
    assert first.status_code == 201

    second = client.post(
        "/api/notifications/save-subscription",
        json={"subscription": _subscription("https://push.example.com/second")},
        headers=headers,
    )
    assert second.status_code == 201

    with app.app_context():
        rows = PushSubscription.query.filter_by(user_id=user_id).all()
        assert len(rows) == 1
        # The endpoint must be the SECOND one — a no-op upsert would leave the
        # first and still yield exactly one row.
        assert json.loads(rows[0].subscription_json)["endpoint"] == (
            "https://push.example.com/second"
        )


def test_save_subscription_rejects_missing_subscription(client, app):
    with app.app_context():
        user = _create_user("Coach C", "pad173-user-3")
        db.session.commit()
        user_id = user.id

    resp = client.post(
        "/api/notifications/save-subscription",
        json={},
        headers=_auth_header(app, user_id),
    )
    assert resp.status_code == 400


def test_save_subscription_requires_authentication(client, app):
    resp = client.post(
        "/api/notifications/save-subscription",
        json={"subscription": _subscription()},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# The collapse: POST /api/notifications/subscribe must be gone
# ---------------------------------------------------------------------------

def test_subscribe_alias_no_longer_exists(client, app):
    """
    Acceptance criterion "Only one registration endpoint exists".

    Asserts 404 AND that no row was written. The status code alone is weak
    evidence — a route that 404'd after committing would still be a duplicate
    implementation.
    """
    from padel_app.models import PushSubscription

    with app.app_context():
        user = _create_user("Coach D", "pad173-user-4")
        db.session.commit()
        user_id = user.id

    resp = client.post(
        "/api/notifications/subscribe",
        json={"subscription": _subscription()},
        headers=_auth_header(app, user_id),
    )
    assert resp.status_code == 404, (
        "POST /api/notifications/subscribe still resolves — the B-008 duplicate "
        "route is back"
    )

    with app.app_context():
        assert PushSubscription.query.filter_by(user_id=user_id).first() is None


def test_only_one_route_registers_push_subscriptions(client, app):
    """
    Guards the rule rather than one URL: exactly one rule on the notifications
    blueprint may accept a POST that upserts push_subscriptions. Catches a
    duplicate reintroduced under any new name.
    """
    registration_rules = [
        str(rule)
        for rule in app.url_map.iter_rules()
        if "POST" in (rule.methods or set())
        and str(rule).startswith("/api/notifications/")
        and "subscri" in str(rule).lower()
    ]
    assert registration_rules == ["/api/notifications/save-subscription"], (
        f"expected exactly one push-registration route, found {registration_rules}"
    )
