"""
B-254: a failing send never puts an address in the logs.

Every mail path that logged `user.email`, a recipient list, or the exception's TEXT now logs the
user id (or a count) and the exception's CLASS. The exception text is out because it can carry the
recipient itself: an SMTP refusal names it, and `MailRecipientNotAllowed` used to list them.

Each test makes the send fail with an exception whose message contains the address, then asserts
two things: the warning WAS logged (so a disabled logger cannot pass the test vacuously), and no
log record contains the address.

Run:
    pytest padel_app/tests/test_b254_no_addresses_in_logs.py -v
"""
import logging

import pytest
from werkzeug.security import generate_password_hash

from padel_app.sql_db import db

ADDRESS = "rita@example.com"


class LeakyFailure(RuntimeError):
    """What an SMTP refusal looks like: the address is in the message."""


def _boom(*args, **kwargs):
    raise LeakyFailure(f"550 5.1.1 <{ADDRESS}>: recipient address rejected")


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture
def failing_mail(monkeypatch):
    from padel_app.tools import email_tools

    monkeypatch.setattr(email_tools, "send_email", _boom)


def _warnings(caplog):
    return [r for r in caplog.records if r.levelno >= logging.WARNING]


def _assert_logged_without_address(caplog, must_contain):
    records = _warnings(caplog)
    assert any(must_contain in r.getMessage() for r in records), (
        f"expected a warning containing {must_contain!r}; got {[r.getMessage() for r in records]}"
    )
    leaked = [r.getMessage() for r in caplog.records if ADDRESS in r.getMessage().lower()]
    assert leaked == [], f"an address reached the log: {leaked}"


def _user(app, **over):
    from padel_app.models import User

    with app.app_context():
        user = User(
            name="Rita", username="rita", email=ADDRESS, status="active",
            password=generate_password_hash("Segura123"), **over,
        )
        db.session.add(user)
        db.session.commit()
        return user.id


def _auth(app, user_id):
    from flask_jwt_extended import create_access_token

    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def test_email_verification_send_logs_no_address(client, app, failing_mail, caplog):
    """email_verification_service.send_code (was: "verification mail to <email> failed: <exc>")."""
    caplog.set_level(logging.WARNING)
    user_id = _user(app)

    res = client.post("/api/auth/email-verification/send", headers=_auth(app, user_id))

    assert res.status_code == 503
    _assert_logged_without_address(caplog, "LeakyFailure")


def test_signup_first_code_logs_no_address(client, app, failing_mail, caplog):
    """email_verification_service.begin_verification (was: "first verification mail to <email>")."""
    caplog.set_level(logging.WARNING)
    res = client.post("/api/auth/register", json={
        "role": "student", "name": "Rita Silva", "username": "rita", "email": ADDRESS,
        "password": "Segura123", "birthDate": "2000-01-01", "country": "PT",
    })

    assert res.status_code == 201, res.get_json()
    _assert_logged_without_address(caplog, "LeakyFailure")


def test_password_recovery_logs_no_address(client, app, failing_mail, caplog):
    """password_recovery_service (was: "recovery mail to <email> failed: <exc>")."""
    caplog.set_level(logging.WARNING)
    _user(app)

    res = client.post("/api/auth/password-recovery/request", json={"email": ADDRESS})

    assert res.status_code == 200
    _assert_logged_without_address(caplog, "LeakyFailure")


def test_request_alert_mail_logs_no_address(app, monkeypatch, failing_mail, caplog):
    """request_alert_service (was: "request-alert mail to <email> failed: <exc>")."""
    from padel_app.models import User
    from padel_app.services import request_alert_service

    caplog.set_level(logging.WARNING)
    # Imported inside notify_request_event, so patched where they live.
    monkeypatch.setattr("padel_app.utils.push_notifications.send_push_notification", lambda *a, **k: None)
    monkeypatch.setattr("padel_app.utils.expo_push.send_expo_push_to_user", lambda *a, **k: None)
    monkeypatch.setattr(request_alert_service, "wants_request_alerts", lambda user: True)
    user_id = _user(app)

    with app.test_request_context():
        request_alert_service.notify_request_event(
            "coach_approval.received", [db.session.get(User, user_id)], actor="Someone"
        )

    _assert_logged_without_address(caplog, "LeakyFailure")


def test_coach_approval_mail_logs_no_recipients(app, failing_mail, caplog):
    """coach_approval_service._send (was: "coach-approval mail to <recipients> failed: <exc>")."""
    from padel_app.services import coach_approval_service

    caplog.set_level(logging.WARNING)
    with app.test_request_context():
        coach_approval_service._send("subject", [ADDRESS], "body")

    _assert_logged_without_address(caplog, "LeakyFailure")


def test_coach_approval_superadmin_alert_logs_no_exception_text(app, monkeypatch, caplog):
    """coach_approval_service.notify_admin_of_pending_coach (was: "... alert failed: <exc>")."""
    from padel_app.models import Coach, User
    from padel_app.services import coach_approval_service, request_alert_service

    caplog.set_level(logging.WARNING)
    monkeypatch.setattr(request_alert_service, "notify_request_event", _boom)
    user_id = _user(app)
    with app.test_request_context():
        coach = Coach(user_id=user_id)
        db.session.add(coach)
        db.session.commit()
        app.config["ADMIN_NOTIFY_EMAIL"] = None
        coach_approval_service.notify_admin_of_pending_coach(coach)

    _assert_logged_without_address(caplog, "LeakyFailure")


def test_invited_coach_code_failure_logs_no_exception_text(client, app, monkeypatch, caplog):
    """club_service accept (PAD-477 rule 9; was: "... invited coach <id> failed: <exc>")."""
    from padel_app.services import email_verification_service
    from padel_app.tests.test_coach_invitation import _make_coach_with_club, _make_invitation

    caplog.set_level(logging.WARNING)
    monkeypatch.setattr(email_verification_service, "begin_verification", _boom)
    _, coach_id, club_id = _make_coach_with_club(app)
    token = _make_invitation(app, club_id, coach_id)

    res = client.post(
        f"/api/app/coach-invitations/{token}/accept",
        json={"name": "Rita Coach", "username": "rita_coach", "password": "Secret123!",
              "birthDate": "1990-01-01", "email": ADDRESS},
        headers={"X-LevApp-Capabilities": "coach-invite-email"},
    )

    assert res.status_code == 200, res.get_json()
    _assert_logged_without_address(caplog, "LeakyFailure")


def test_the_allowlist_guard_logs_a_count_not_the_dropped_addresses(app, monkeypatch, caplog):
    """email_tools.send_email's MAIL_ALLOWED_RECIPIENTS guard (was: "mail to <dropped list> dropped")."""
    from padel_app import mail as mail_module
    from padel_app.tools.email_tools import send_email

    caplog.set_level(logging.WARNING)
    monkeypatch.setattr(mail_module.mail, "send", lambda msg: None)
    app.config["MAIL_USERNAME"] = "sender@example.com"
    app.config["E2E_DEBUG_ENDPOINTS"] = None
    app.config["MAIL_ALLOWED_RECIPIENTS"] = ("@levapp.app",)
    with app.app_context():
        send_email("x", ["ana@levapp.app", ADDRESS], body="y")

    _assert_logged_without_address(caplog, "dropped")


def test_the_not_allowed_exception_names_no_address(app):
    """email_tools.MailRecipientNotAllowed carried the recipient list in its message; any caller
    logging the exception wrote the addresses."""
    from padel_app.tools.email_tools import MailRecipientNotAllowed, send_email

    app.config["MAIL_USERNAME"] = "sender@example.com"
    app.config["E2E_DEBUG_ENDPOINTS"] = None
    app.config["MAIL_ALLOWED_RECIPIENTS"] = ("@levapp.app",)
    with app.app_context():
        with pytest.raises(MailRecipientNotAllowed) as caught:
            send_email("x", [ADDRESS], body="y")

    assert ADDRESS not in str(caught.value).lower()
