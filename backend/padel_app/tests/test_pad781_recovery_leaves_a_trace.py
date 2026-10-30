"""PAD-781 (B-707) — a password recovery leaves a trace, and every writer stores an email in one form.

auth.password-recovery rules 3a, 5a and 12. Before: a successful recovery mail logged nothing, a
request that matched no recoverable user logged nothing, and a failed send cleared
`password_reset_sent_at` with the code, so after the 15-minute window "never attempted", "sent"
and "lost in flight" looked the same in the database and the log. The coach-created student path
stored the email as typed, so a padded address never matched the recovery lookup.

Log lines carry the user id or a reason class, never the address (B-254).
"""
import logging
from datetime import datetime, timedelta

import pytest
from werkzeug.security import generate_password_hash

from padel_app.sql_db import db

T0 = datetime(2026, 10, 30, 10, 0, 0)


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture
def outbox(monkeypatch):
    from padel_app.tools import email_tools

    sent = []

    def fake(subject, recipients, body=None, html=None):
        sent.append({"subject": subject, "recipients": list(recipients), "body": body})
        return "Sent"

    monkeypatch.setattr(email_tools, "send_email", fake)
    return sent


def _user(app, **fields):
    from padel_app.models import User

    values = dict(name="Ana", username="ana781", email="ana781@example.com",
                  password=generate_password_hash("OldPass123"), status="active")
    values.update(fields)
    with app.app_context():
        user = User(**values)
        db.session.add(user)
        db.session.commit()
        return user.id


def _request(app, email, now=T0):
    from padel_app.services.password_recovery_service import request_recovery

    with app.app_context():
        body = request_recovery(email, now=now)
        db.session.remove()
        return body


def _lines(caplog, needle):
    return [r.getMessage() for r in caplog.records if needle in r.getMessage()]


# --- Rule 3a: a sent recovery mail logs one INFO line, the user id only ----------------------

def test_a_sent_recovery_mail_logs_the_user_id(app, outbox, caplog):
    uid = _user(app)
    with caplog.at_level(logging.INFO):
        _request(app, "ana781@example.com")

    assert len(outbox) == 1
    assert _lines(caplog, "recovery mail to user") == [f"recovery mail to user {uid} sent"]
    assert not any("ana781@example.com" in r.getMessage() for r in caplog.records)


# --- Rule 5a: a request that matches no recoverable user logs the reason class ----------------

@pytest.mark.parametrize("reason, fields, email", [
    ("no_user", None, "nobody781@example.com"),
    ("no_password", {"password": None, "status": "inactive"}, "ana781@example.com"),
    ("disabled", {"status": "disabled"}, "ana781@example.com"),
])
def test_a_request_matching_no_recoverable_user_logs_the_reason(app, outbox, caplog, reason, fields, email):
    if fields is not None:
        _user(app, **fields)
    with caplog.at_level(logging.INFO):
        _request(app, email)

    assert outbox == []
    assert _lines(caplog, "recovery request") == [f"recovery request sent nothing: {reason}"]
    assert not any(email in r.getMessage() for r in caplog.records)


def test_a_request_inside_the_cooldown_logs_cooldown(app, outbox, caplog):
    _user(app)
    _request(app, "ana781@example.com", now=T0)
    with caplog.at_level(logging.INFO):
        _request(app, "ana781@example.com", now=T0 + timedelta(seconds=30))

    assert len(outbox) == 1
    assert _lines(caplog, "recovery request") == ["recovery request sent nothing: cooldown"]


# --- Rule 3: a failed send clears the code but keeps the attempt's time -----------------------

def test_a_failed_send_keeps_the_attempt_time_and_clears_the_code(app, monkeypatch):
    from padel_app.models import User
    from padel_app.tools import email_tools

    def boom(*a, **k):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(email_tools, "send_email", boom)
    uid = _user(app)
    _request(app, "ana781@example.com", now=T0)

    with app.app_context():
        user = db.session.get(User, uid)
        assert user.password_reset_code_hash is None
        assert user.password_reset_expires_at is None
        assert user.password_reset_sent_at == T0


def test_a_request_after_a_failed_send_and_the_cooldown_issues_a_new_code(app, outbox, monkeypatch):
    """The kept time only holds the 60-second cooldown; it never blocks the retry after it."""
    from padel_app.models import User
    from padel_app.tools import email_tools

    real = email_tools.send_email

    def boom(*a, **k):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(email_tools, "send_email", boom)
    uid = _user(app)
    _request(app, "ana781@example.com", now=T0)
    monkeypatch.setattr(email_tools, "send_email", real)  # the outbox fake

    _request(app, "ana781@example.com", now=T0 + timedelta(seconds=61))

    assert len(outbox) == 1
    with app.app_context():
        assert db.session.get(User, uid).password_reset_code_hash is not None


# --- Rule 12: every writer stores an email trimmed and lower-cased ----------------------------

def test_normalise_email_trims_and_lowercases_and_empties_to_none():
    from padel_app.utils.emails import normalise_email

    assert normalise_email("  Ana.Silva@Example.COM ") == "ana.silva@example.com"
    assert normalise_email("   ") is None
    assert normalise_email(None) is None
    assert normalise_email(42) is None


def _make_coach(app):
    from padel_app.tests.test_player_invitation import make_coach

    return make_coach(app, username="coach781")


def _auth(app, user_id):
    from padel_app.tests.test_player_invitation import _auth_header

    return _auth_header(app, user_id)


def test_a_coach_created_student_is_stored_with_the_normalised_email(client, app):
    from padel_app.models import User

    user_id, coach_id = _make_coach(app)
    res = client.post("/api/app/incomplete_player",
                      json={"coachId": coach_id, "name": "Padded", "email": "  Padded.Student@Example.COM ",
                            "adultsConfirmed": True},
                      headers=_auth(app, user_id))
    assert res.status_code == 201, res.get_json()

    with app.app_context():
        assert User.query.filter_by(name="Padded").one().email == "padded.student@example.com"


def test_an_invitation_accept_stores_the_normalised_email(client, app):
    from padel_app.models import User

    user_id, coach_id = _make_coach(app)
    token = client.post("/api/app/incomplete_player",
                        json={"coachId": coach_id, "name": "Accepting", "adultsConfirmed": True},
                        headers=_auth(app, user_id)).get_json()["token"]
    res = client.post(f"/api/app/player-invitations/{token}/accept",
                      json={"birthDate": "1990-01-01", "username": "accepting781", "password": "Secret123!",
                            "email": " Accepting@Example.COM"})
    assert res.status_code == 200, res.get_json()

    with app.app_context():
        assert User.query.filter_by(username="accepting781").one().email == "accepting@example.com"


def test_a_padded_mixed_case_address_recovers_end_to_end(client, app, outbox):
    """Coach creates the student with a padded address, the student accepts, then recovers."""
    user_id, coach_id = _make_coach(app)
    token = client.post("/api/app/incomplete_player",
                        json={"coachId": coach_id, "name": "End To End",
                              "email": " End.To.End@Example.COM ", "adultsConfirmed": True},
                        headers=_auth(app, user_id)).get_json()["token"]
    accepted = client.post(f"/api/app/player-invitations/{token}/accept",
                           json={"birthDate": "1990-01-01", "username": "endtoend781", "password": "Secret123!"})
    assert accepted.status_code == 200, accepted.get_json()

    res = client.post("/api/auth/password-recovery/request", json={"email": "end.to.end@example.com"})

    assert res.status_code == 200
    assert [m["recipients"] for m in outbox] == [["end.to.end@example.com"]]
