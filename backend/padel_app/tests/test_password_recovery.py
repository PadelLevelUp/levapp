"""auth.password-recovery — email-based password and username recovery (PAD-139)."""
from datetime import datetime, timedelta

import pytest
from werkzeug.security import generate_password_hash

from padel_app.sql_db import db

OLD = "OldPass123"
NEW = "NewPass456"


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture
def outbox(monkeypatch):
    """Capture every mail as (subject, recipients, body, html)."""
    from padel_app.tools import email_tools

    sent = []

    def fake(subject, recipients, body=None, html=None):
        sent.append({"subject": subject, "recipients": list(recipients), "body": body, "html": html})
        return "Sent"

    monkeypatch.setattr(email_tools, "send_email", fake)
    return sent


@pytest.fixture
def ana(app):
    from padel_app.models import User

    with app.app_context():
        user = User(
            name="Ana Silva",
            username="ana.silva",
            email="ana@example.com",
            password=generate_password_hash(OLD),
            status="active",
            language="pt",
        )
        db.session.add(user)
        db.session.commit()
        return user.id


def _code_from(mail):
    import re

    return re.search(r"\b(\d{6})\b", mail["body"]).group(1)


def _user(app, user_id):
    from padel_app.models import User

    with app.app_context():
        return db.session.get(User, user_id)


def _request(client, email="ana@example.com"):
    return client.post("/api/auth/password-recovery/request", json={"email": email})


def _confirm(client, code, password=NEW, email="ana@example.com"):
    return client.post(
        "/api/auth/password-recovery/confirm",
        json={"email": email, "code": code, "newPassword": password},
    )


def _issue(app, client, outbox, issued_at=None):
    """Request a code for ana and optionally re-stamp it at `issued_at`."""
    res = _request(client)
    assert res.status_code == 200, res.get_json()
    code = _code_from(outbox[-1])
    if issued_at is not None:
        from padel_app.models import User
        from padel_app.services.password_recovery_service import CODE_TTL

        with app.app_context():
            user = User.query.filter_by(email="ana@example.com").first()
            user.password_reset_sent_at = issued_at
            user.password_reset_expires_at = issued_at + CODE_TTL
            db.session.commit()
    return code


STANDARD = {"ok": True, "expiresInSeconds": 900, "resendAvailableInSeconds": 60}


# --- Request issues a code and mails the username ---------------------------

def test_request_issues_code_and_mails_username(client, app, ana, outbox):
    res = _request(client, "Ana@Example.com")
    assert res.status_code == 200
    assert res.get_json() == STANDARD
    assert len(outbox) == 1
    mail = outbox[0]
    assert mail["recipients"] == ["ana@example.com"]
    assert mail["subject"] == "Recuperar o acesso à tua conta LevApp"
    assert "ana.silva" in mail["body"]
    code = _code_from(mail)
    user = _user(app, ana)
    assert user.password_reset_code_hash and user.password_reset_code_hash != code
    assert user.password_reset_expires_at - user.password_reset_sent_at == timedelta(minutes=15)


def test_english_subject_follows_language(client, app, ana, outbox):
    with app.app_context():
        user = _user(app, ana)
        user.language = "en"
        db.session.add(user)
        db.session.commit()
    _request(client)
    assert outbox[-1]["subject"] == "Recover access to your LevApp account"


# --- Unknown email answers exactly like a known one -------------------------

def test_unknown_email_answers_like_known_and_sends_nothing(client, ana, outbox):
    res = _request(client, "nobody@example.com")
    assert res.status_code == 200
    assert res.get_json() == STANDARD
    assert outbox == []


def test_invalid_email_is_400(client, outbox):
    res = _request(client, "not-an-email")
    assert res.status_code == 400
    assert res.get_json()["error"] == "INVALID_EMAIL"
    assert outbox == []


# --- Confirm sets the password and signs in ---------------------------------

def test_confirm_sets_password_and_signs_in(client, app, ana, outbox):
    code = _issue(app, client, outbox, datetime(2026, 9, 9, 10, 0))
    from padel_app.services import password_recovery_service as svc

    with app.app_context():
        from padel_app.models import User

        user = db.session.get(User, ana)
        body = svc.confirm_recovery("ana@example.com", code, NEW, now=datetime(2026, 9, 9, 10, 5))
        assert body["user"]["id"] == user.id
        assert body["accessToken"]

    assert client.post("/api/auth/login", json={"username": "ana.silva", "password": NEW}).status_code == 200
    assert client.post("/api/auth/login", json={"username": "ana.silva", "password": OLD}).status_code == 401
    user = _user(app, ana)
    assert user.password_reset_code_hash is None
    assert user.password_reset_expires_at is None
    assert user.password_reset_sent_at is None
    assert user.password_reset_attempts == 0
    assert user.email_verified_at is not None


def test_confirm_route_returns_login_shape(client, app, ana, outbox):
    code = _issue(app, client, outbox)
    res = _confirm(client, code)
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert body["accessToken"]
    assert body["user"]["id"] == ana
    assert body["user"]["role"] == "player"


# --- A code is single-use ---------------------------------------------------

def test_code_is_single_use(client, app, ana, outbox):
    code = _issue(app, client, outbox)
    assert _confirm(client, code).status_code == 200
    res = _confirm(client, code, "AnotherPass789")
    assert res.status_code == 410
    assert res.get_json()["error"] == "CODE_EXPIRED"
    assert client.post("/api/auth/login", json={"username": "ana.silva", "password": NEW}).status_code == 200


# --- Expired code -----------------------------------------------------------

def test_expired_code(client, app, ana, outbox):
    code = _issue(app, client, outbox, datetime(2026, 9, 9, 10, 0))
    from padel_app.services import password_recovery_service as svc

    with app.app_context():
        with pytest.raises(svc.PasswordRecoveryError) as exc:
            svc.confirm_recovery("ana@example.com", code, NEW, now=datetime(2026, 9, 9, 10, 16))
    assert exc.value.code == "CODE_EXPIRED" and exc.value.status == 410
    assert client.post("/api/auth/login", json={"username": "ana.silva", "password": OLD}).status_code == 200


# --- Wrong code counts attempts and locks on the fifth ----------------------

def test_wrong_code_counts_attempts_and_locks(client, app, ana, outbox):
    code = _issue(app, client, outbox)
    wrong = "000000" if code != "000000" else "111111"
    for left in (4, 3, 2, 1):
        res = _confirm(client, wrong)
        assert res.status_code == 400
        assert res.get_json() == {"error": "INVALID_CODE", "attemptsLeft": left}
    res = _confirm(client, wrong)
    assert res.status_code == 400
    assert res.get_json()["attemptsLeft"] == 0
    res = _confirm(client, code)
    assert res.status_code == 410
    assert res.get_json()["error"] == "CODE_EXPIRED"


# --- Confirm for an unknown email looks like an expired code ----------------

def test_confirm_unknown_email_is_410(client, ana):
    res = _confirm(client, "123456", email="nobody@example.com")
    assert res.status_code == 410
    assert res.get_json()["error"] == "CODE_EXPIRED"


# --- Weak password and malformed code do not consume an attempt -------------

def test_weak_password_and_malformed_code_do_not_consume(client, app, ana, outbox):
    code = _issue(app, client, outbox)
    res = _confirm(client, code, "short")
    assert res.status_code == 400
    assert res.get_json()["error"] == "WEAK_PASSWORD"
    res = _confirm(client, "12 34")
    assert res.status_code == 400
    assert res.get_json() == {"error": "INVALID_CODE", "attemptsLeft": 5}
    res = _confirm(client, "abcdef")
    assert res.get_json() == {"error": "INVALID_CODE", "attemptsLeft": 5}
    assert _user(app, ana).password_reset_attempts == 0
    assert _confirm(client, f" {code} ").status_code == 200


# --- Cooldown does not resend and does not leak -----------------------------

def test_cooldown_does_not_resend_and_does_not_leak(client, app, ana, outbox):
    from padel_app.services import password_recovery_service as svc

    with app.app_context():
        body = svc.request_recovery("ana@example.com", now=datetime(2026, 9, 9, 10, 0, 0))
        assert body == STANDARD
        first = _code_from(outbox[-1])
        body = svc.request_recovery("ana@example.com", now=datetime(2026, 9, 9, 10, 0, 30))
        assert body == STANDARD
        assert len(outbox) == 1
        body = svc.request_recovery("ana@example.com", now=datetime(2026, 9, 9, 10, 1, 0))
        assert body == STANDARD
        assert len(outbox) == 2
        second = _code_from(outbox[-1])
        with pytest.raises(svc.PasswordRecoveryError) as exc:
            svc.confirm_recovery("ana@example.com", first, NEW, now=datetime(2026, 9, 9, 10, 1, 5))
        assert exc.value.code == "INVALID_CODE" and exc.value.status == 400
        body = svc.confirm_recovery("ana@example.com", second, NEW, now=datetime(2026, 9, 9, 10, 1, 10))
        assert body["accessToken"]


def test_cooldown_keeps_first_code_valid(client, app, ana, outbox):
    from padel_app.services import password_recovery_service as svc

    with app.app_context():
        svc.request_recovery("ana@example.com", now=datetime(2026, 9, 9, 10, 0, 0))
        first = _code_from(outbox[-1])
        svc.request_recovery("ana@example.com", now=datetime(2026, 9, 9, 10, 0, 30))
        assert len(outbox) == 1
        body = svc.confirm_recovery("ana@example.com", first, NEW, now=datetime(2026, 9, 9, 10, 0, 40))
        assert body["accessToken"]


# --- Mail failure still answers 200 and leaves no code ----------------------

def test_mail_failure_answers_200_and_leaves_no_code(client, app, ana, monkeypatch):
    from padel_app.tools import email_tools

    def boom(*a, **k):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(email_tools, "send_email", boom)
    res = _request(client)
    assert res.status_code == 200
    assert res.get_json() == STANDARD
    assert _user(app, ana).password_reset_code_hash is None


# --- Users without an email or disabled get nothing -------------------------

def test_disabled_user_gets_nothing(client, app, outbox):
    from padel_app.models import User

    with app.app_context():
        db.session.add(User(name="Off", username="off", email="off@example.com",
                            password=generate_password_hash(OLD), status="disabled"))
        db.session.add(User(name="No Mail", username="nomail", email=None,
                            password=generate_password_hash(OLD), status="active"))
        db.session.commit()
    res = _request(client, "off@example.com")
    assert res.status_code == 200
    assert res.get_json() == STANDARD
    assert outbox == []


# --- The legacy routes are gone ---------------------------------------------

def test_legacy_forgot_password_route_is_gone(client):
    assert client.get("/auth/forgot_password").status_code == 404
    assert client.get("/auth/verify_generated_code/1").status_code == 404
    assert client.get("/auth/generate_new_code/1").status_code == 404
