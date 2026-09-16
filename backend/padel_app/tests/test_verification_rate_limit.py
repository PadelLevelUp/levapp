"""PAD-269 — per-IP throttle on email-verification send and confirm
(auth.email-verification rule 13), on PAD-228's limiter."""
from datetime import timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

IP_A = "203.0.113.7"
IP_B = "203.0.113.8"
SEND = "/api/auth/email-verification/send"
CONFIRM = "/api/auth/email-verification/confirm"


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture
def outbox(monkeypatch):
    from padel_app.tools import email_tools

    sent = []
    monkeypatch.setattr(
        email_tools, "send_email",
        lambda subject, recipients, body=None, html=None: sent.append({"subject": subject, "recipients": list(recipients)}) or "Sent",
    )
    return sent


def _clock(app, seconds):
    """Move the limiter's clock (R-008: inject time, never sleep)."""
    from padel_app.utils.rate_limit import limiter_for

    limiter_for(app).clock = lambda: seconds


def _signed_up(app, client):
    """Self-signup `ana` (which mails the first code) and return her auth header."""
    res = client.post(
        "/api/auth/register",
        json={"role": "student", "name": "Ana Silva", "username": "ana", "email": "ana@example.com",
              "password": "Segura123", "birthDate": "2000-01-01", "country": "PT"},
    )
    assert res.status_code == 201, res.get_json()
    from padel_app.models import User

    with app.app_context():
        user_id = User.query.filter_by(username="ana").one().id
        token = create_access_token(identity=str(user_id))
    return user_id, {"Authorization": f"Bearer {token}"}


def _past_cooldown(app, user_id):
    """Back-date the last send so the per-user 60 s cooldown does not answer first."""
    from padel_app.models import User
    from padel_app.utils.dates import utcnow_naive

    with app.app_context():
        user = db.session.get(User, user_id)
        user.email_verification_sent_at = utcnow_naive() - timedelta(minutes=5)
        db.session.commit()


def _call(client, path, ip, headers, **json):
    return client.post(path, json=json, headers=headers, environ_base={"REMOTE_ADDR": ip})


def test_confirm_is_throttled_per_ip_without_consuming_an_attempt(client, app, outbox):
    app.config["AUTH_RATE_LIMIT_VERIFICATION"] = "2/600"
    _clock(app, 1000)
    _, headers = _signed_up(app, client)

    first = _call(client, CONFIRM, IP_A, headers, code="000000")
    assert first.status_code == 400
    left = first.get_json()["attemptsLeft"]
    assert _call(client, CONFIRM, IP_A, headers, code="000000").status_code == 400

    third = _call(client, CONFIRM, IP_A, headers, code="000000")
    assert third.status_code == 429
    assert third.get_json()["error"] == "RATE_LIMITED"
    assert third.get_json()["retryAfterSeconds"] > 0
    assert int(third.headers["Retry-After"]) > 0

    # the throttled call consumed nothing: another IP sees one attempt fewer than after the
    # second call, not two
    other = _call(client, CONFIRM, IP_B, headers, code="000000")
    assert other.status_code == 400
    assert other.get_json()["attemptsLeft"] == left - 2


def test_send_and_confirm_share_the_bucket_and_a_throttled_send_mails_nothing(client, app, outbox):
    app.config["AUTH_RATE_LIMIT_VERIFICATION"] = "2/600"
    _clock(app, 1000)
    user_id, headers = _signed_up(app, client)
    _past_cooldown(app, user_id)
    mails = len(outbox)

    assert _call(client, SEND, IP_A, headers).status_code == 200
    assert len(outbox) == mails + 1
    assert _call(client, CONFIRM, IP_A, headers, code="000000").status_code == 400

    _past_cooldown(app, user_id)
    throttled = _call(client, SEND, IP_A, headers)
    assert throttled.status_code == 429
    assert throttled.get_json()["error"] == "RATE_LIMITED"
    assert len(outbox) == mails + 1

    # the window moves on
    _clock(app, 1000 + 601)
    assert _call(client, SEND, IP_A, headers).status_code == 200


def test_verification_throttle_is_off_when_the_knob_is_zero(client, app, outbox):
    app.config["AUTH_RATE_LIMIT_VERIFICATION"] = "0"
    _, headers = _signed_up(app, client)
    for _ in range(5):
        assert _call(client, CONFIRM, IP_A, headers, code="000000").status_code in (400, 410)
