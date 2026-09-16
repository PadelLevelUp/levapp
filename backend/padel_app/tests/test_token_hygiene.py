"""PAD-269 (audit M11), code-only part: auth.login rules 4 and 11,
auth.token-refresh rules 5 and 6, auth.logout rule 3."""
from datetime import datetime, timedelta, timezone

import pytest
from flask_jwt_extended import create_access_token, decode_token
from werkzeug.security import generate_password_hash

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    """The test app is built from a mapping, not from `Config`, so it runs on
    flask-jwt-extended's defaults (header-only tokens, a query parameter named
    `jwt`, 15-minute lifetime). These tests are about production's token
    settings, so copy them from `Config` — read each time, so the tests follow
    whatever the config says rather than a hard-coded copy of it."""
    from padel_app.config import Config

    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    for key in ("JWT_TOKEN_LOCATION", "JWT_QUERY_STRING_NAME", "JWT_ACCESS_TOKEN_EXPIRES", "JWT_ABSOLUTE_SESSION_DAYS"):
        if hasattr(Config, key):
            app.config[key] = getattr(Config, key)


@pytest.fixture
def coach(app):
    from padel_app.models import User

    with app.app_context():
        user = User(name="Coach", username="coach1", email="coach1@example.com",
                    password=generate_password_hash("SecurePass1!"), status="active")
        db.session.add(user)
        db.session.commit()
        return user.id


def _ts(days_ago):
    return int((datetime.now(timezone.utc) - timedelta(days=days_ago)).timestamp())


def _token(app, user_id, *, expires_in_days=30, auth_time_days_ago=None):
    claims = {} if auth_time_days_ago is None else {"auth_time": _ts(auth_time_days_ago)}
    with app.app_context():
        return create_access_token(
            identity=str(user_id), expires_delta=timedelta(days=expires_in_days), additional_claims=claims,
        )


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


def _claims(app, token):
    with app.app_context():
        return decode_token(token)


# --- auth.login rule 4: the query string only on the SSE endpoint ----------

def test_query_string_token_refused_outside_sse(client, app, coach):
    token = _token(app, coach)
    assert client.get(f"/api/auth/me?token={token}").status_code == 401
    assert client.get("/api/auth/me", headers=_hdr(token)).status_code == 200


def test_query_string_token_accepted_on_sse(client, app, coach):
    res = client.get(f"/api/app/events?token={_token(app, coach)}")
    try:
        assert res.status_code == 200
        assert res.mimetype == "text/event-stream"
    finally:
        res.close()


# --- auth.login rule 11: an unactivated account is an ordinary 401 ---------

def test_unactivated_account_login_is_401(client, app):
    from padel_app.models import User

    with app.app_context():
        db.session.add(User(name="Bruno", username="bruno", password=None, status="inactive"))
        db.session.commit()
    res = client.post("/api/auth/login", json={"username": "bruno", "password": "anything"})
    assert res.status_code == 401
    assert res.get_json()["error"] == "Invalid credentials"


# --- auth.token-refresh rule 5: no fresh token on the way out --------------

def test_logout_never_returns_a_fresh_token(client, app, coach):
    near_expiry = _token(app, coach, expires_in_days=10)
    control = client.get("/api/auth/me", headers=_hdr(near_expiry))
    assert control.headers.get("X-New-Token"), "precondition: a 10-day token is refreshed elsewhere"
    res = client.post("/api/auth/logout", headers=_hdr(near_expiry))
    assert res.status_code == 200
    assert "X-New-Token" not in res.headers


def test_account_deletion_never_returns_a_fresh_token(client, app, coach):
    res = client.delete("/api/auth/me", headers=_hdr(_token(app, coach, expires_in_days=10)))
    assert res.status_code == 200
    assert "X-New-Token" not in res.headers


# --- auth.token-refresh rule 6: the absolute session cap -------------------

def test_login_token_carries_auth_time(client, app, coach):
    res = client.post("/api/auth/login", json={"username": "coach1", "password": "SecurePass1!"})
    claims = _claims(app, res.get_json()["accessToken"])
    assert abs(claims["auth_time"] - _ts(0)) < 60


def test_session_older_than_cap_is_refused(client, app, coach):
    token = _token(app, coach, expires_in_days=10, auth_time_days_ago=91)
    assert client.get("/api/auth/me", headers=_hdr(token)).status_code == 401


def test_refresh_keeps_the_original_auth_time(client, app, coach):
    token = _token(app, coach, expires_in_days=10, auth_time_days_ago=80)
    res = client.get("/api/auth/me", headers=_hdr(token))
    assert res.status_code == 200
    fresh = res.headers.get("X-New-Token")
    assert fresh
    assert _claims(app, fresh)["auth_time"] == _claims(app, token)["auth_time"]


def test_token_without_auth_time_gets_its_iat_stamped(client, app, coach):
    token = _token(app, coach, expires_in_days=10)  # minted before PAD-269: no auth_time
    res = client.get("/api/auth/me", headers=_hdr(token))
    fresh = res.headers.get("X-New-Token")
    assert fresh
    assert _claims(app, fresh)["auth_time"] == _claims(app, token)["iat"]


def test_cap_is_configurable(client, app, coach):
    app.config["JWT_ABSOLUTE_SESSION_DAYS"] = 30
    token = _token(app, coach, expires_in_days=10, auth_time_days_ago=31)
    assert client.get("/api/auth/me", headers=_hdr(token)).status_code == 401


# --- auth.logout rule 3: the blocklist is pruned ---------------------------

def test_logout_prunes_expired_blocklist_rows(client, app, coach):
    from padel_app.models import TokenBlocklist

    now = datetime.now(timezone.utc)
    with app.app_context():
        db.session.add(TokenBlocklist(jti="old-row", created_at=now - timedelta(days=40)))
        db.session.add(TokenBlocklist(jti="recent-row", created_at=now - timedelta(days=1)))
        db.session.commit()
    token = _token(app, coach)
    assert client.post("/api/auth/logout", headers=_hdr(token)).status_code == 200
    with app.app_context():
        jtis = {row.jti for row in TokenBlocklist.query.all()}
    assert "old-row" not in jtis
    assert "recent-row" in jtis
    assert _claims(app, token)["jti"] in jtis
