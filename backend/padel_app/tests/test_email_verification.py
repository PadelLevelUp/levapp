"""auth.email-verification — a 6-digit code proves the self-signup email (PAD-234)."""
from datetime import datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


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


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _register(client, role="student", username="ana", email="ana@example.com"):
    res = client.post(
        "/api/auth/register",
        json={"role": role, "name": "Ana Silva", "username": username, "email": email, "password": "Segura123",
              "birthDate": "2000-01-01", "country": "PT"},
    )
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def _code_from(mail):
    import re

    return re.search(r"\b(\d{6})\b", mail["body"]).group(1)


def _user(app, username="ana"):
    from padel_app.models import User

    with app.app_context():
        return User.query.filter_by(username=username).first()


def _with_code(app, client, outbox, issued_at):
    """Register `ana` and re-stamp the issued code at `issued_at`."""
    from padel_app.models import User
    from padel_app.services.email_verification_service import CODE_TTL

    body = _register(client)
    code = _code_from(outbox[-1])
    with app.app_context():
        user = User.query.filter_by(username="ana").first()
        user.email_verification_sent_at = issued_at
        user.email_verification_expires_at = issued_at + CODE_TTL
        db.session.commit()
        user_id = user.id
    return user_id, code, body


# --- Signup issues a code and reports pending ------------------------------

def test_signup_issues_code_and_reports_pending(client, app, outbox):
    body = _register(client)
    assert body["user"]["emailVerification"] == "pending"
    assert len(outbox) == 1
    assert outbox[0]["recipients"] == ["ana@example.com"]
    code = _code_from(outbox[0])
    assert outbox[0]["html"] and code in outbox[0]["html"]
    user = _user(app)
    assert user.email_verification_required is True
    assert user.email_verified_at is None
    assert user.email_verification_code_hash and user.email_verification_code_hash != code

    me = client.get("/api/auth/me", headers=_auth(app, user.id)).get_json()
    assert me["emailVerification"] == "pending"


def test_verification_mail_is_in_the_users_language(client, app, outbox):
    _register(client)
    assert outbox[0]["subject"].startswith("O teu código LevApp: ")
    assert "15 minutos" in outbox[0]["body"]


# --- Correct code verifies and routes -----------------------------------------

def test_correct_code_verifies(client, app, outbox):
    user_id, code, _ = _with_code(app, client, outbox, datetime(2026, 9, 7, 10, 0))
    from padel_app.services.email_verification_service import confirm_code
    from padel_app.models import User

    with app.app_context():
        user = User.query.get(user_id)
        confirm_code(user, code, now=datetime(2026, 9, 7, 10, 5))
        assert user.email_verified_at == datetime(2026, 9, 7, 10, 5)
        assert user.email_verification_code_hash is None
        assert user.email_verification_expires_at is None
        assert user.email_verification_attempts == 0

    me = client.get("/api/auth/me", headers=_auth(app, user_id)).get_json()
    assert me["emailVerification"] == "verified"
    # The same code a second time: nothing to check against.
    res = client.post("/api/auth/email-verification/confirm", json={"code": code}, headers=_auth(app, user_id))
    assert res.status_code == 410
    assert res.get_json()["error"] == "CODE_EXPIRED"


def test_confirm_route_answers_with_the_me_payload(client, app, outbox):
    body = _register(client)
    code = _code_from(outbox[0])
    user = _user(app)
    res = client.post("/api/auth/email-verification/confirm", json={"code": code}, headers=_auth(app, user.id))
    assert res.status_code == 200, res.get_json()
    assert res.get_json()["emailVerification"] == "verified"
    assert res.get_json()["username"] == "ana"


# --- Wrong code counts attempts and locks on the fifth --------------------------

def test_wrong_code_counts_down_and_locks(client, app, outbox):
    _register(client)
    code = _code_from(outbox[0])
    wrong = "000000" if code != "000000" else "111111"
    headers = _auth(app, _user(app).id)

    for expected in (4, 3, 2, 1):
        res = client.post("/api/auth/email-verification/confirm", json={"code": wrong}, headers=headers)
        assert res.status_code == 400
        assert res.get_json() == {"error": "INVALID_CODE", "attemptsLeft": expected}

    res = client.post("/api/auth/email-verification/confirm", json={"code": wrong}, headers=headers)
    assert res.status_code == 400
    assert res.get_json()["attemptsLeft"] == 0

    res = client.post("/api/auth/email-verification/confirm", json={"code": code}, headers=headers)
    assert res.status_code == 410
    assert _user(app).email_verified_at is None


# --- Expired code ---------------------------------------------------------------

def test_expired_code(client, app, outbox):
    user_id, code, _ = _with_code(app, client, outbox, datetime(2026, 9, 7, 10, 0))
    from padel_app.services.email_verification_service import EmailVerificationError, confirm_code
    from padel_app.models import User

    with app.app_context():
        user = User.query.get(user_id)
        with pytest.raises(EmailVerificationError) as exc:
            confirm_code(user, code, now=datetime(2026, 9, 7, 10, 16))
        assert exc.value.code == "CODE_EXPIRED" and exc.value.status == 410
    me = client.get("/api/auth/me", headers=_auth(app, user_id)).get_json()
    assert me["emailVerification"] == "pending"


# --- Resend is rate-limited and replaces the code ------------------------------

def test_resend_rate_limited_and_replaces(client, app, outbox):
    user_id, code_a, _ = _with_code(app, client, outbox, datetime(2026, 9, 7, 10, 0, 0))
    from padel_app.services.email_verification_service import EmailVerificationError, confirm_code, send_code
    from padel_app.models import User

    with app.app_context():
        user = User.query.get(user_id)
        with pytest.raises(EmailVerificationError) as exc:
            send_code(user, now=datetime(2026, 9, 7, 10, 0, 30))
        assert exc.value.status == 429
        assert exc.value.payload() == {"error": "RESEND_TOO_SOON", "retryAfterSeconds": 30}

        body = send_code(user, now=datetime(2026, 9, 7, 10, 1, 0))
        assert body == {"email": "ana@example.com", "expiresInSeconds": 900, "resendAvailableInSeconds": 60}
        assert len(outbox) == 2
        code_b = _code_from(outbox[1])

        if code_a != code_b:
            with pytest.raises(EmailVerificationError) as exc:
                confirm_code(user, code_a, now=datetime(2026, 9, 7, 10, 1, 5))
            assert exc.value.code == "INVALID_CODE"
        confirm_code(user, code_b, now=datetime(2026, 9, 7, 10, 1, 10))
        assert user.email_verified_at is not None


def test_send_route_is_429_right_after_signup(client, app, outbox):
    _register(client)
    res = client.post("/api/auth/email-verification/send", headers=_auth(app, _user(app).id))
    assert res.status_code == 429
    assert res.get_json()["error"] == "RESEND_TOO_SOON"
    assert 0 < res.get_json()["retryAfterSeconds"] <= 60


# --- Malformed code does not consume an attempt ---------------------------------

def test_malformed_code_does_not_consume_an_attempt(client, app, outbox):
    _register(client)
    code = _code_from(outbox[0])
    headers = _auth(app, _user(app).id)
    for bad in ("12 34", "abcdef", "", None):
        res = client.post("/api/auth/email-verification/confirm", json={"code": bad}, headers=headers)
        assert res.status_code == 400
        assert res.get_json() == {"error": "INVALID_CODE", "attemptsLeft": 5}
    res = client.post("/api/auth/email-verification/confirm", json={"code": f" {code} "}, headers=headers)
    assert res.status_code == 200


# --- Already verified and no email ----------------------------------------------

def test_already_verified_and_no_email(client, app, outbox):
    _register(client)
    code = _code_from(outbox[0])
    headers = _auth(app, _user(app).id)
    assert client.post("/api/auth/email-verification/confirm", json={"code": code}, headers=headers).status_code == 200
    res = client.post("/api/auth/email-verification/send", headers=headers)
    assert res.status_code == 409 and res.get_json()["error"] == "ALREADY_VERIFIED"

    from padel_app.models import User

    with app.app_context():
        nobody = User(name="No Mail", username="nomail", password="pw", status="active")
        db.session.add(nobody)
        db.session.commit()
        nobody_id = nobody.id
    res = client.post("/api/auth/email-verification/send", headers=_auth(app, nobody_id))
    assert res.status_code == 400 and res.get_json()["error"] == "NO_EMAIL"
    me = client.get("/api/auth/me", headers=_auth(app, nobody_id)).get_json()
    assert me["emailVerification"] == "unverified"


# --- Mail failure at signup does not fail the signup ------------------------------

def test_mail_failure_does_not_fail_signup(client, app, monkeypatch):
    from padel_app.tools import email_tools

    def boom(*args, **kwargs):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(email_tools, "send_email", boom)
    body = _register(client)
    assert body["user"]["emailVerification"] == "pending"
    user = _user(app)
    assert user.email_verification_code_hash is None
    assert user.email_verification_sent_at is None

    res = client.post("/api/auth/email-verification/send", headers=_auth(app, user.id))
    assert res.status_code == 503
    assert res.get_json()["error"] == "MAIL_FAILED"
    assert _user(app).email_verification_code_hash is None


def test_mail_not_configured_is_a_clean_failure(app, monkeypatch):
    """Without MAIL_USERNAME the door raises MailNotConfigured instead of an SMTP stack trace."""
    from padel_app.tools.email_tools import MailNotConfigured, send_email

    monkeypatch.delenv("MAIL_USERNAME", raising=False)
    with app.app_context():
        app.config["MAIL_USERNAME"] = ""
        app.config["E2E_DEBUG_ENDPOINTS"] = None
        with pytest.raises(MailNotConfigured):
            send_email("x", ["a@example.com"], body="y")


# --- Recipient guard (rule 12): staging may hold a sender but never mail a real coach --

@pytest.fixture
def smtp(monkeypatch):
    """Capture what would reach SMTP (recipients per message)."""
    from padel_app import mail as mail_module

    sent = []
    monkeypatch.setattr(mail_module.mail, "send", lambda msg: sent.append(list(msg.recipients)))
    return sent


def _configure_sender(app, allowed):
    app.config["MAIL_USERNAME"] = "sender@example.com"
    app.config["E2E_DEBUG_ENDPOINTS"] = None
    app.config["MAIL_ALLOWED_RECIPIENTS"] = allowed


def test_allowlist_keeps_domain_and_exact_matches_only(app, smtp):
    from padel_app.tools.email_tools import MailRecipientNotAllowed, send_email

    with app.app_context():
        _configure_sender(app, ("@levapp.app", "tester@gmail.com"))
        send_email("x", ["Ana@LevApp.app", "tester@gmail.com", "coach@clubreal.pt"], body="y")
        assert smtp == [["Ana@LevApp.app", "tester@gmail.com"]]
        with pytest.raises(MailRecipientNotAllowed):
            send_email("x", ["coach@clubreal.pt"], body="y")
        assert len(smtp) == 1
        # `@levapp.app` is a domain suffix, not a substring: no lookalike domains.
        with pytest.raises(MailRecipientNotAllowed):
            send_email("x", ["ana@levapp.app.evil.com", "levapp.app@gmail.com"], body="y")


def test_empty_allowlist_allows_everyone(app, smtp):
    from padel_app.tools.email_tools import send_email

    with app.app_context():
        _configure_sender(app, ())
        send_email("x", ["coach@clubreal.pt"], body="y")
        assert smtp == [["coach@clubreal.pt"]]


def test_allowlist_is_parsed_from_the_environment(monkeypatch):
    import importlib

    from padel_app import config as config_module

    monkeypatch.setenv("MAIL_ALLOWED_RECIPIENTS", " @levapp.app, Tester@Gmail.com ,,")
    reloaded = importlib.reload(config_module)
    try:
        assert reloaded.Config.MAIL_ALLOWED_RECIPIENTS == ("@levapp.app", "tester@gmail.com")
    finally:
        monkeypatch.delenv("MAIL_ALLOWED_RECIPIENTS")
        importlib.reload(config_module)


def test_dropped_verification_mail_is_a_503_not_a_silent_success(client, app, smtp):
    with app.app_context():
        _configure_sender(app, ("@levapp.app",))
    body = _register(client, email="ana@outside.example")  # first mail dropped, account still created
    assert body["user"]["emailVerification"] == "pending"
    assert smtp == []
    res = client.post("/api/auth/email-verification/send", headers=_auth(app, _user(app).id))
    assert res.status_code == 503 and res.get_json()["error"] == "MAIL_FAILED"


# --- Coach-created players are not stopped -----------------------------------------

def test_coach_created_player_is_not_stopped(client, app, outbox):
    from padel_app.models import Player, User

    with app.app_context():
        user = User(name="Bruno", username="bruno", email="bruno@example.com", password="pw", status="active")
        db.session.add(user)
        db.session.flush()
        db.session.add(Player(user_id=user.id))
        db.session.commit()
        user_id = user.id
    me = client.get("/api/auth/me", headers=_auth(app, user_id)).get_json()
    assert me["emailVerification"] == "unverified"
    assert outbox == []


# --- Existing users are grandfathered by the migration ------------------------------

def test_migration_backfills_users_with_an_email():
    import importlib.util, pathlib

    path = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions" / "cefe5640a35a_add_email_verification.py"
    spec = importlib.util.spec_from_file_location("mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.down_revision == "a5b6c7d8e9f0"
    src = path.read_text()
    assert "WHERE email IS NOT NULL AND email_verified_at IS NULL" in src
    assert "if column.name not in existing" in src  # idempotent on a drifted prod schema


# --- Gate switched off -----------------------------------------------------------------

def test_gate_off_verifies_at_signup(client, app, outbox):
    app.config["EMAIL_VERIFICATION_REQUIRED"] = False
    body = _register(client)
    assert body["user"]["emailVerification"] == "verified"
    assert outbox == []
    assert _user(app).email_verified_at is not None


# --- Changing the email re-verifies ----------------------------------------------------

def test_changing_email_reverifies(client, app, outbox):
    _register(client)
    code = _code_from(outbox[0])
    headers = _auth(app, _user(app).id)
    assert client.post("/api/auth/email-verification/confirm", json={"code": code}, headers=headers).status_code == 200

    res = client.patch("/api/auth/me", json={"email": "ana.silva@example.com"}, headers=headers)
    assert res.status_code == 200, res.get_json()
    assert res.get_json()["emailVerification"] == "pending"
    assert len(outbox) == 2 and outbox[1]["recipients"] == ["ana.silva@example.com"]
    assert client.get("/api/auth/me", headers=headers).get_json()["emailVerification"] == "pending"

    # Same address, different case: nothing happens.
    res = client.patch("/api/auth/me", json={"email": "ANA.silva@example.com"}, headers=headers)
    assert res.status_code == 200
    assert res.get_json()["emailVerification"] == "pending"
    assert len(outbox) == 2

    # Saving a name only never touches it either.
    res = client.patch("/api/auth/me", json={"name": "Ana S."}, headers=headers)
    assert res.get_json()["emailVerification"] == "pending" and len(outbox) == 2


# --- Admin sees the verification state ------------------------------------------------

def test_admin_list_carries_email_verified(client, app, outbox):
    from padel_app.models import User

    _register(client, role="coach", username="rui", email="rui@example.com")
    with app.app_context():
        admin = User(name="Admin", username="admin", password="pw", status="active", is_superadmin=True)
        db.session.add(admin)
        db.session.commit()
        admin_id = admin.id
    rows = client.get("/api/app/admin/coach-approvals", headers=_auth(app, admin_id)).get_json()
    assert [r["username"] for r in rows] == ["rui"]
    assert rows[0]["emailVerified"] is False

    code = _code_from(outbox[0])
    rui = _user(app, "rui")
    assert client.post("/api/auth/email-verification/confirm", json={"code": code}, headers=_auth(app, rui.id)).status_code == 200
    rows = client.get("/api/app/admin/coach-approvals", headers=_auth(app, admin_id)).get_json()
    assert rows[0]["emailVerified"] is True


def test_admin_notification_says_whether_email_is_verified(client, app, outbox):
    app.config["ADMIN_NOTIFY_EMAIL"] = "admin@levapp.app"
    _register(client, role="coach", username="rui", email="rui@example.com")
    admin_mail = [m for m in outbox if m["recipients"] == ["admin@levapp.app"]]
    assert len(admin_mail) == 1
    assert "Email verified: no" in admin_mail[0]["body"]


# --- Test transport: the E2E outbox and the debug route ----------------------------------

def test_debug_route_returns_only_the_callers_code(client, app):
    from padel_app.tools import email_tools

    email_tools.OUTBOX.clear()
    app.config["E2E_DEBUG_ENDPOINTS"] = "true"
    _register(client, username="ana", email="ana@example.com")
    _register(client, username="ben", email="ben@example.com")
    assert len(email_tools.OUTBOX) == 2

    ana, ben = _user(app, "ana"), _user(app, "ben")
    res = client.get("/api/auth/email-verification/debug/last-code", headers=_auth(app, ana.id))
    assert res.status_code == 200
    ana_code = res.get_json()["code"]
    ben_code = client.get("/api/auth/email-verification/debug/last-code", headers=_auth(app, ben.id)).get_json()["code"]
    assert ana_code == _code_from(email_tools.OUTBOX[0])
    assert ben_code == _code_from(email_tools.OUTBOX[1])

    # The code it hands out is the real one.
    res = client.post("/api/auth/email-verification/confirm", json={"code": ben_code}, headers=_auth(app, ben.id))
    assert res.status_code == 200


def test_debug_route_is_404_without_the_flag_and_401_anonymous(client, app, outbox):
    _register(client)
    headers = _auth(app, _user(app).id)
    app.config["E2E_DEBUG_ENDPOINTS"] = None
    assert client.get("/api/auth/email-verification/debug/last-code", headers=headers).status_code == 404
    assert client.get("/api/auth/email-verification/debug/last-code?email=ana@example.com").status_code == 404
    app.config["E2E_DEBUG_ENDPOINTS"] = "true"
    assert client.get("/api/auth/email-verification/debug/last-code").status_code == 401


def test_debug_route_serves_a_mailbox_by_address_for_the_maestro_runner(client, app):
    from padel_app.tools import email_tools

    email_tools.OUTBOX.clear()
    app.config["E2E_DEBUG_ENDPOINTS"] = "true"
    _register(client, username="ana", email="ana@example.com")
    res = client.get("/api/auth/email-verification/debug/last-code?email=ANA@example.com")
    assert res.status_code == 200
    assert res.get_json()["code"] == _code_from(email_tools.OUTBOX[0])
    assert client.get("/api/auth/email-verification/debug/last-code?email=nobody@example.com").status_code == 404


def test_me_carries_the_resend_timer(client, app, outbox):
    _register(client)
    headers = _auth(app, _user(app).id)
    me = client.get("/api/auth/me", headers=headers).get_json()
    assert 0 < me["emailVerificationResendInSeconds"] <= 60
    from padel_app.models import User

    with app.app_context():
        u = User.query.filter_by(username="ana").first()
        u.email_verification_sent_at = datetime(2020, 1, 1)
        db.session.commit()
    assert client.get("/api/auth/me", headers=headers).get_json()["emailVerificationResendInSeconds"] == 0
