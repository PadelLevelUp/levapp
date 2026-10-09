"""
B-254: a failing send never puts an address in the logs.

Every mail path that logged `user.email`, a recipient list, or the exception's TEXT now logs the
user id (or a count) and the exception's CLASS. The exception text is out because it can carry the
recipient itself: an SMTP refusal names it, and `MailRecipientNotAllowed` used to list them.

Most tests make the send fail with an exception whose message contains the address. Each asserts two
things: the warning WAS logged (so a disabled logger cannot pass the test vacuously), and neither a
record's message nor the captured text (tracebacks included) contains the sensitive value.

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
    assert ADDRESS not in caplog.text.lower(), "an address reached the captured log text"


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
    # PAD-532: the pending-coach alert points at the staff console; without its URL it is skipped.
    app.config["ADMIN_CONSOLE_URL"] = "https://admin.levapp.app"
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
        send_email("Your LevApp code: 123456", ["ana@levapp.app", ADDRESS], body="y")

    _assert_logged_without_address(caplog, "dropped")
    assert "123456" not in caplog.text, "the subject (a verification code) reached the log"


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


# --- Part two (coordinator, 2026-10-02): raw LLM output and whole device tokens ---------------


def test_bad_llm_json_logs_its_length_and_error_class_not_the_content(caplog):
    """helpers/llm.py parse_json logged up to 500 chars of the raw output: in the roster and
    evaluation import that is players' names and coaching notes."""
    from padel_app.helpers.llm import parse_json

    caplog.set_level(logging.WARNING)
    raw = "Players: Ana Silva (backhand weak), Bruno Costa — this is not JSON"
    with pytest.raises(ValueError) as caught:
        parse_json(raw, label="roster")
    # The raised message is shown to callers and logged by ai_service: it must not carry content.
    assert "Ana Silva" not in str(caught.value)

    records = [r.getMessage() for r in caplog.records if r.levelno >= logging.WARNING]
    assert any("bad JSON" in m and str(len(raw)) in m and "JSONDecodeError" in m for m in records), records
    assert "Ana Silva" not in caplog.text and "Bruno Costa" not in caplog.text


def test_llm_json_that_is_not_an_object_carries_no_content(caplog):
    """The other ValueError branch (an array): neither the log nor the raised message carries it."""
    from padel_app.helpers.llm import parse_json

    caplog.set_level(logging.WARNING)
    with pytest.raises(ValueError) as caught:
        parse_json('["Ana Silva", "Bruno Costa"]', label="roster")

    assert "Ana Silva" not in str(caught.value)
    assert any("bad JSON" in r.getMessage() for r in caplog.records)
    assert "Ana Silva" not in caplog.text


def test_a_clean_send_and_a_clean_parse_log_nothing(client, app, monkeypatch, caplog):
    """The trigger-absent cell: a successful send logs no warning at all; valid JSON stays silent."""
    from padel_app.helpers.llm import parse_json
    from padel_app.tools import email_tools

    caplog.set_level(logging.WARNING)
    monkeypatch.setattr(email_tools, "send_email", lambda *a, **k: "Sent")
    user_id = _user(app)

    assert client.post("/api/auth/email-verification/send", headers=_auth(app, user_id)).status_code == 200
    assert parse_json('{"players": []}') == {"players": []}
    assert [r.getMessage() for r in caplog.records if r.levelno >= logging.WARNING] == []


TOKEN = "ExponentPushToken[abcdefghijklmnop]"


@pytest.mark.parametrize("receipt", [
    {"status": "error", "message": f'"{TOKEN}" is not a registered push notification recipient',
     "details": {"error": "DeviceNotRegistered"}},
    {"status": "error", "message": f'Message to "{TOKEN}" is too big', "details": {"error": "MessageTooBig"}},
])
def test_expo_receipts_log_a_token_tail_never_the_token(app, caplog, receipt):
    """utils/expo_push.py logged whole device tokens (and :125 the whole receipt, whose message quotes
    the token). A short tail keeps two devices apart in a log (PAD-118's diagnosability)."""
    from unittest.mock import patch

    from padel_app.tests.test_native_push import _mock_response
    from padel_app.utils.expo_push import send_expo_push

    caplog.set_level(logging.WARNING)
    with app.app_context():
        with patch("padel_app.utils.expo_push.requests.post") as mock_post:
            mock_post.return_value = _mock_response({"data": [receipt]})
            send_expo_push([TOKEN], "Title", "Body", {})

    messages = [r.getMessage() for r in caplog.records]
    assert any("...klmnop" in m for m in messages if "token" in m.lower()), messages
    assert not any(TOKEN in m or "abcdefghij" in m for m in messages), messages
    assert any(receipt["details"]["error"] in m for m in messages), messages


def test_an_expo_error_receipt_without_details_still_logs_only_the_tail(app, caplog):
    """No `details` (error code None) and the receipt's message quotes the token: tail only."""
    from unittest.mock import patch

    from padel_app.tests.test_native_push import _mock_response
    from padel_app.utils.expo_push import send_expo_push

    caplog.set_level(logging.WARNING)
    with app.app_context():
        with patch("padel_app.utils.expo_push.requests.post") as mock_post:
            mock_post.return_value = _mock_response({"data": [{"status": "error", "message": f"bad {TOKEN}"}]})
            send_expo_push([TOKEN], "Title", "Body", {})

    assert "...klmnop" in caplog.text
    assert TOKEN not in caplog.text and "abcdefghij" not in caplog.text


# --- Coordinator, after the independent check: web-push endpoints ------------------------------

ENDPOINT = "https://fcm.googleapis.com/fcm/send/cap-abcdef0123456789"


@pytest.mark.parametrize("kind", ["webpush", "unexpected"])
def test_a_failed_web_push_logs_the_class_and_status_never_the_endpoint(app, monkeypatch, caplog, kind):
    """utils/push_notifications.py logged the pywebpush exception text, which quotes the subscription
    endpoint: a URL that works as a capability for that browser."""
    import json
    from types import SimpleNamespace

    from pywebpush import WebPushException

    from padel_app.utils import push_notifications

    def failing(**kwargs):
        if kind == "webpush":
            raise WebPushException(f"Push failed: 500 Server Error for {ENDPOINT}",
                                   response=SimpleNamespace(status_code=500))
        raise RuntimeError(f"connection reset talking to {ENDPOINT}")

    caplog.set_level(logging.WARNING)
    monkeypatch.setattr(push_notifications, "webpush", failing)
    with app.app_context():
        ok = push_notifications._deliver_web_push(
            7, 1, json.dumps({"endpoint": ENDPOINT, "keys": {}}), "{}", "key", {"sub": "mailto:x@y"}
        )

    assert ok is False
    messages = [r.getMessage() for r in caplog.records if r.levelno >= logging.WARNING]
    expected = "WebPushException" if kind == "webpush" else "RuntimeError"
    assert any("user_id=7" in m and expected in m for m in messages), messages
    if kind == "webpush":
        assert any("500" in m for m in messages), messages
    assert "cap-abcdef0123456789" not in caplog.text and "fcm.googleapis.com" not in caplog.text


# --- PAD-534: the delivery incident log carries no address, endpoint or token either ----------

def _incident_text():
    from padel_app.models.delivery_incident import DeliveryIncident

    return " ".join(
        " ".join(str(getattr(r, c.name)) for c in DeliveryIncident.__table__.columns)
        for r in DeliveryIncident.query.all()
    )


# #589 review: a real subscription's keys, so a stored subscription is caught too.
P256DH = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM"
AUTH = "tBHItJI5svbpez7KI4CCXg"


def test_the_incident_rows_hold_no_endpoint_address_or_token(app, monkeypatch):
    """admin.engine-health rule 3 under B-254: every failure path that now writes a
    `delivery_incidents` row is driven with an exception or receipt quoting the secret it must not
    keep, and no column of any row holds it."""
    import json
    from types import SimpleNamespace
    from unittest.mock import patch

    from pywebpush import WebPushException

    from padel_app.models import User
    from padel_app.sql_db import db
    from padel_app.tests.test_native_push import _mock_response
    from padel_app.tools import email_tools
    from padel_app.utils import push_notifications
    from padel_app.utils.expo_push import send_expo_push

    address = "victim.b254@levapp-test.example"
    with app.app_context():
        u = User(name="B254", username="b254inc", email=address, password="x", status="active")
        db.session.add(u)
        db.session.commit()

        # Web push: the exception text quotes the endpoint (both branches).
        for exc in (WebPushException(f"500 for {ENDPOINT}", response=SimpleNamespace(status_code=500)),
                    RuntimeError(f"reset talking to {ENDPOINT}")):
            monkeypatch.setattr(push_notifications, "webpush", lambda exc=exc, **k: (_ for _ in ()).throw(exc))
            push_notifications._deliver_web_push(
                u.id, 1, json.dumps({"endpoint": ENDPOINT, "keys": {"p256dh": P256DH, "auth": AUTH}}),
                "{}", "key", {"sub": "mailto:x@y"})

        # Email: the transport's error quotes the recipient.
        with patch.object(email_tools, "debug_endpoints_enabled", return_value=False), \
                patch.object(email_tools, "_sender", return_value="noreply@levapp.app"), \
                patch.object(email_tools, "allowed_recipients", side_effect=lambda r: list(r)), \
                patch.object(email_tools.mail, "send", side_effect=ConnectionRefusedError(f"refused <{address}>")):
            try:
                email_tools.send_email("Hello", [address], body="x")
            except ConnectionRefusedError:
                pass

        # Expo: the receipt's message quotes the whole token.
        with patch("padel_app.utils.expo_push.requests.post") as post:
            post.return_value = _mock_response({"data": [{"status": "error", "message": f"bad {TOKEN}",
                                                          "details": {"error": "MessageRateExceeded"}}]})
            send_expo_push([TOKEN], "Title", "Body", {})

        text = _incident_text()
        from padel_app.models.delivery_incident import DeliveryIncident
        assert DeliveryIncident.query.count() >= 4, "every failure path wrote its row"
        for secret in (ENDPOINT, "cap-abcdef0123456789", "fcm.googleapis.com", address, "victim.b254",
                       TOKEN, "abcdefghij", P256DH, AUTH):
            assert secret not in text, f"an incident row holds {secret!r}"
