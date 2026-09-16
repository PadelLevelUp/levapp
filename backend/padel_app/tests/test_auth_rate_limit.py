"""PAD-228 — per-IP throttle on login, register and password recovery
(auth.login rule 7, auth.register rule 15, auth.password-recovery rule 10)."""
import pytest
from werkzeug.security import generate_password_hash

from padel_app.sql_db import db

IP_A = "203.0.113.7"
IP_B = "203.0.113.8"


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture
def outbox(monkeypatch):
    from padel_app.tools import email_tools

    sent = []
    monkeypatch.setattr(
        email_tools, "send_email",
        lambda subject, recipients, body=None, html=None: sent.append({"subject": subject, "recipients": list(recipients), "body": body, "html": html}) or "Sent",
    )
    return sent


@pytest.fixture
def ana(app):
    from padel_app.models import User

    with app.app_context():
        user = User(name="Ana", username="ana", email="ana@example.com",
                    password=generate_password_hash("OldPass123"), status="active")
        db.session.add(user)
        db.session.commit()
        return user.id


def _post(client, path, ip, **json):
    return client.post(path, json=json, environ_base={"REMOTE_ADDR": ip})


def _clock(app, seconds):
    """Move the limiter's clock forward (R-008: inject time, never sleep)."""
    from padel_app.utils.rate_limit import limiter_for

    limiter_for(app).clock = lambda: seconds


# --- auth.login rule 7 ------------------------------------------------------

def test_login_is_throttled_per_ip(client, app, ana):
    app.config["AUTH_RATE_LIMIT_LOGIN"] = "3/60"
    _clock(app, 1000)
    for _ in range(3):
        assert _post(client, "/api/auth/login", IP_A, username="ana", password="wrong").status_code == 401
    res = _post(client, "/api/auth/login", IP_A, username="ana", password="OldPass123")
    assert res.status_code == 429
    body = res.get_json()
    assert body["error"] == "RATE_LIMITED"
    assert 0 < body["retryAfterSeconds"] <= 60
    assert res.headers["Retry-After"] == str(body["retryAfterSeconds"])
    # Another IP is not affected.
    assert _post(client, "/api/auth/login", IP_B, username="ana", password="OldPass123").status_code == 200
    # The window slides: 60 s later the first IP is served again.
    _clock(app, 1061)
    assert _post(client, "/api/auth/login", IP_A, username="ana", password="OldPass123").status_code == 200


def test_forwarded_for_names_the_client(client, app, ana):
    app.config["AUTH_RATE_LIMIT_LOGIN"] = "1/60"
    _clock(app, 1000)
    hdr = {"X-Forwarded-For": f"{IP_A}, 10.0.0.1"}
    assert client.post("/api/auth/login", json={"username": "ana", "password": "x"}, headers=hdr,
                       environ_base={"REMOTE_ADDR": "10.0.0.1"}).status_code == 401
    assert client.post("/api/auth/login", json={"username": "ana", "password": "x"}, headers=hdr,
                       environ_base={"REMOTE_ADDR": "10.0.0.1"}).status_code == 429
    hdr_b = {"X-Forwarded-For": f"{IP_B}, 10.0.0.1"}
    assert client.post("/api/auth/login", json={"username": "ana", "password": "x"}, headers=hdr_b,
                       environ_base={"REMOTE_ADDR": "10.0.0.1"}).status_code == 401


def test_limiter_can_be_switched_off(client, app, ana):
    app.config["AUTH_RATE_LIMIT_LOGIN"] = "1/60"
    app.config["AUTH_RATE_LIMIT_ENABLED"] = False
    for _ in range(5):
        assert _post(client, "/api/auth/login", IP_A, username="ana", password="x").status_code == 401
    app.config["AUTH_RATE_LIMIT_ENABLED"] = True
    app.config["AUTH_RATE_LIMIT_LOGIN"] = "0"
    for _ in range(5):
        assert _post(client, "/api/auth/login", IP_A, username="ana", password="x").status_code == 401


# --- auth.register rule 15 ---------------------------------------------------

def test_register_is_throttled_per_ip(client, app, outbox):
    from padel_app.models import User

    app.config["AUTH_RATE_LIMIT_REGISTER"] = "2/600"
    _clock(app, 1000)

    def body(i):
        return dict(role="student", name=f"S {i}", username=f"stu{i}", email=f"stu{i}@example.com", password="Segura123", birthDate="2000-01-01", country="PT")

    assert _post(client, "/api/auth/register", IP_A, **body(1)).status_code == 201
    assert _post(client, "/api/auth/register", IP_A, **body(2)).status_code == 201
    res = _post(client, "/api/auth/register", IP_A, **body(3))
    assert res.status_code == 429
    assert res.get_json()["error"] == "RATE_LIMITED"
    with app.app_context():
        assert User.query.filter_by(username="stu3").first() is None
    assert _post(client, "/api/auth/register", IP_B, **body(3)).status_code == 201


# --- auth.password-recovery rule 10 -----------------------------------------

def test_recovery_request_and_confirm_share_one_bucket(client, app, ana, outbox):
    import re

    app.config["AUTH_RATE_LIMIT_RECOVERY"] = "2/600"
    _clock(app, 1000)
    assert _post(client, "/api/auth/password-recovery/request", IP_A, email="ana@example.com").status_code == 200
    code = re.search(r"\b(\d{6})\b", outbox[-1]["body"]).group(1)
    wrong = "000000" if code != "000000" else "111111"
    res = _post(client, "/api/auth/password-recovery/confirm", IP_A, email="ana@example.com", code=wrong, newPassword="NewPass456")
    assert res.status_code == 400
    res = _post(client, "/api/auth/password-recovery/confirm", IP_A, email="ana@example.com", code=code, newPassword="NewPass456")
    assert res.status_code == 429
    assert res.get_json()["retryAfterSeconds"] > 0
    with app.app_context():
        from padel_app.models import User

        user = db.session.get(User, ana)
        assert user.password_reset_attempts == 1  # the throttled call consumed nothing
    assert client.post("/api/auth/login", json={"username": "ana", "password": "OldPass123"}).status_code == 200
    res = _post(client, "/api/auth/password-recovery/confirm", IP_B, email="ana@example.com", code=code, newPassword="NewPass456")
    assert res.status_code == 200
