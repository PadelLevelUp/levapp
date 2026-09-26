"""PAD-457 — the guardian/parental-consent flow is gone.

LevApp accepts adults only (PAD-445, auth.register rule 18): no minor can ever sign up, so the
guardian-consent machinery (routes, service, mails) is removed. `guardian_consent_status` stays on
`User` only as a dead-code safety net for any row left over from before — a login for one still
answers exactly like a disabled account, never the old `GUARDIAN_CONSENT_PENDING` code. Every
`/api/auth/guardian-consent/*` route is gone (404). A `guardianEmail` in a signup body is inert:
the account is created as a normal adult, no `GuardianConsent` row, no pending status.

    pytest padel_app/tests/test_pad457_no_guardian_flow.py -v
"""
from datetime import datetime

import pytest
from werkzeug.security import generate_password_hash

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock

PASSWORD = "Segura1234"


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _user(app, username, *, guardian_consent_status, player=True):
    from padel_app.models import Player, User

    with app.app_context():
        user = User(
            name=username.title(),
            username=username,
            email=f"{username}@example.com",
            password=generate_password_hash(PASSWORD),
            status="active",
            guardian_consent_status=guardian_consent_status,
        )
        db.session.add(user)
        db.session.flush()
        if player:
            db.session.add(Player(user_id=user.id))
        db.session.commit()
        return user.id


def _login(client, username, password=PASSWORD):
    return client.post("/api/auth/login", json={"username": username, "password": password})


@pytest.mark.parametrize("status", ["pending", "revoked"])
def test_pending_or_revoked_guardian_status_logs_in_like_a_disabled_account(client, app, status):
    _user(app, "leftover", guardian_consent_status=status)
    res = _login(client, "leftover")
    assert res.status_code == 401
    body = res.get_json()
    assert body == {"error": "ACCOUNT_DISABLED"}
    assert "accessToken" not in body


def test_a_normal_active_account_still_signs_in(client, app):
    _user(app, "bruno", guardian_consent_status=None)
    res = _login(client, "bruno")
    assert res.status_code == 200
    assert res.get_json()["accessToken"]


@pytest.mark.parametrize("method,path", [
    ("get", "/api/auth/guardian-consent/anything"),
    ("post", "/api/auth/guardian-consent/anything"),
    ("post", "/api/auth/guardian-consent/resend"),
    ("get", "/api/auth/guardian-consent/debug/last-link"),
    ("get", "/api/auth/guardian-consent/revoke/anything"),
    ("post", "/api/auth/guardian-consent/revoke/anything"),
    ("post", "/api/auth/guardian-consent/anything/decline"),
])
def test_every_guardian_consent_route_is_gone(client, method, path):
    res = getattr(client, method)(path, json={})
    assert res.status_code == 404


def test_register_with_a_guardian_email_in_the_body_is_just_a_normal_adult_signup(client, app, monkeypatch):
    pin_clock(monkeypatch, datetime(2026, 9, 25, 12, 0))
    res = client.post("/api/auth/register", json={
        "role": "student",
        "name": "Ana Silva",
        "username": "ana457",
        "email": "ana457@example.com",
        "password": "Segura123",
        "birthDate": "1990-01-01",
        "country": "PT",
        "guardianEmail": "mae@example.com",
    })
    assert res.status_code == 201, res.get_json()
    assert res.get_json()["accessToken"]

    from padel_app.models import GuardianConsent, User

    with app.app_context():
        user = User.query.filter_by(username="ana457").first()
        assert user is not None
        assert user.guardian_consent_status is None
        assert GuardianConsent.query.count() == 0
