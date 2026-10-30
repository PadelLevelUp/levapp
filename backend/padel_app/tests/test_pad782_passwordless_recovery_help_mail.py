"""PAD-782 (B-708) — an account without a password that asks for recovery gets a mail that says
what to do instead (auth.password-recovery rule 5b; option (a), assumed: the owner had not answered).

Before: `_find` skipped every account whose password is NULL, so a Google/Apple account and a
coach-created student who never finished the invite saw "code sent" and received nothing. The
response stays the one standard 200 (rule 2): the address is confirmed as known only inside the mail.
"""
import logging
import re
from datetime import datetime, timedelta

import pytest
from werkzeug.security import generate_password_hash

from padel_app.sql_db import db

T0 = datetime(2026, 10, 30, 10, 0, 0)
STANDARD = {"ok": True, "expiresInSeconds": 900, "resendAvailableInSeconds": 60}


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture
def outbox(monkeypatch):
    from padel_app.tools import email_tools

    sent = []

    def fake(subject, recipients, body=None, html=None):
        sent.append({"subject": subject, "recipients": list(recipients), "body": body, "html": html})
        return "Sent"

    monkeypatch.setattr(email_tools, "send_email", fake)
    return sent


def _request(app, email, now=T0):
    from padel_app.services.password_recovery_service import request_recovery

    with app.app_context():
        body = request_recovery(email, now=now)
        db.session.remove()
        return body


def _social_user(app, provider="google", language="pt", email="social782@example.com", status="active"):
    from padel_app.models import User, UserIdentity

    with app.app_context():
        user = User(name="Sofia Social", username="social782", email=email, password=None,
                    status=status, language=language)
        db.session.add(user)
        db.session.flush()
        db.session.add(UserIdentity(user_id=user.id, provider=provider, subject=f"sub-{provider}-782",
                                    email=email))
        db.session.commit()
        return user.id


def _coach(app):
    from padel_app.models import Coach, User

    with app.app_context():
        user = User(name="Coach 782", username="coach782", password=generate_password_hash("Secret123!"),
                    status="active")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id)
        db.session.add(coach)
        db.session.commit()
        return coach.id


def _invited_student(app, coach_id, *, with_invitation=True, email="invited782@example.com"):
    """A coach-created student with an email who never accepted (players.create)."""
    from padel_app.models import Association_CoachPlayer, Player, PlayerInvitation, User

    with app.app_context():
        user = User(name="Ines Invited", username="placeholder782", email=email, password=None,
                    status="inactive")
        db.session.add(user)
        db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player)
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach_id, player_id=player.id))
        if with_invitation:
            db.session.add(PlayerInvitation(player_id=player.id, token="old-token-782",
                                            invited_by_coach_id=coach_id, status="expired",
                                            expires_at=T0 - timedelta(days=1)))
        db.session.commit()
        return user.id, player.id


# --- A Google or Apple account is told how it signs in ---------------------------------------

@pytest.mark.parametrize("provider, language, subject, word", [
    ("google", "pt", "A tua conta LevApp entra com o Google", "Google"),
    ("apple", "en", "Your LevApp account signs in with Apple", "Apple"),
])
def test_a_social_account_gets_a_mail_naming_its_provider(app, outbox, provider, language, subject, word):
    _social_user(app, provider=provider, language=language)

    assert _request(app, "Social782@Example.com") == STANDARD

    assert len(outbox) == 1
    mail = outbox[0]
    assert mail["recipients"] == ["social782@example.com"]
    assert mail["subject"] == subject
    assert word in mail["body"]
    assert "/auth" in mail["body"]
    assert not re.search(r"\b\d{6}\b", mail["body"])  # no recovery code: there is no password to reset


def test_a_social_account_still_cannot_confirm_a_code(client, app, outbox):
    _social_user(app)
    _request(app, "social782@example.com")

    res = client.post("/api/auth/password-recovery/confirm",
                      json={"email": "social782@example.com", "code": "123456", "newPassword": "NewPass456"})
    assert res.status_code == 410


# --- A student who never finished the invite gets a fresh invite link -------------------------

def test_an_unfinished_invite_gets_a_mail_with_a_fresh_invite_link(app, outbox):
    from padel_app.models import PlayerInvitation

    coach_id = _coach(app)
    _, player_id = _invited_student(app, coach_id)

    assert _request(app, "invited782@example.com") == STANDARD

    assert len(outbox) == 1
    mail = outbox[0]
    assert mail["recipients"] == ["invited782@example.com"]
    assert mail["subject"] == "Termina a tua conta LevApp"
    token = re.search(r"/invite/player/([A-Za-z0-9_-]+)", mail["body"]).group(1)
    with app.app_context():
        invitation = PlayerInvitation.by_token(token)
        assert invitation is not None and invitation.player_id == player_id
        assert invitation.status == "pending"
        assert invitation.invited_by_coach_id == coach_id
        assert invitation.expires_at == T0 + timedelta(days=7)


def test_an_unfinished_invite_with_no_invitation_row_uses_the_coach_link(app, outbox):
    from padel_app.models import PlayerInvitation

    coach_id = _coach(app)
    _, player_id = _invited_student(app, coach_id, with_invitation=False)

    _request(app, "invited782@example.com")

    assert len(outbox) == 1
    token = re.search(r"/invite/player/([A-Za-z0-9_-]+)", outbox[0]["body"]).group(1)
    with app.app_context():
        assert PlayerInvitation.by_token(token).invited_by_coach_id == coach_id


def test_the_fresh_link_completes_the_account(client, app, outbox):
    coach_id = _coach(app)
    _invited_student(app, coach_id)
    _request(app, "invited782@example.com")
    token = re.search(r"/invite/player/([A-Za-z0-9_-]+)", outbox[0]["body"]).group(1)

    res = client.post(f"/api/app/player-invitations/{token}/accept",
                      json={"birthDate": "1990-01-01", "username": "ines782", "password": "Secret123!"})
    assert res.status_code == 200, res.get_json()


# --- The cooldown and the cases that still get nothing ------------------------------------------

def test_the_help_mail_honours_the_cooldown(app, outbox):
    from padel_app.models import PlayerInvitation

    coach_id = _coach(app)
    _invited_student(app, coach_id)
    _request(app, "invited782@example.com", now=T0)
    _request(app, "invited782@example.com", now=T0 + timedelta(seconds=30))

    assert len(outbox) == 1
    with app.app_context():
        assert PlayerInvitation.query.filter_by(status="pending").count() == 1

    _request(app, "invited782@example.com", now=T0 + timedelta(seconds=61))
    assert len(outbox) == 2


def test_a_disabled_passwordless_account_gets_nothing(app, outbox):
    _social_user(app, status="disabled")

    assert _request(app, "social782@example.com") == STANDARD
    assert outbox == []


def test_a_passwordless_account_with_no_provider_and_no_coach_gets_nothing(app, outbox):
    from padel_app.models import User

    with app.app_context():
        db.session.add(User(name="Orphan", username="orphan782", email="orphan782@example.com",
                            password=None, status="inactive"))
        db.session.commit()

    assert _request(app, "orphan782@example.com") == STANDARD
    assert outbox == []


def test_an_account_with_a_password_still_gets_the_code_mail(app, outbox):
    from padel_app.models import User

    with app.app_context():
        db.session.add(User(name="Ana", username="ana782", email="ana782@example.com",
                            password=generate_password_hash("OldPass123"), status="active", language="pt"))
        db.session.commit()

    _request(app, "ana782@example.com")

    assert outbox[0]["subject"] == "Recuperar o acesso à tua conta LevApp"


# --- The log says which way it went (rule 5b with rule 5a, after PAD-781) ---------------------

def _lines(caplog, needle):
    return [r.getMessage() for r in caplog.records if needle in r.getMessage()]


def test_a_sent_help_mail_logs_sent_and_not_sent_nothing(app, outbox, caplog):
    coach_id = _coach(app)
    uid, _ = _invited_student(app, coach_id)

    with caplog.at_level(logging.INFO):
        _request(app, "invited782@example.com")

    assert _lines(caplog, "recovery help mail") == [f"recovery help mail to user {uid} sent"]
    assert _lines(caplog, "sent nothing") == []
    assert not any("invited782@example.com" in r.getMessage() for r in caplog.records)


@pytest.mark.parametrize("case, reason", [
    ("disabled", "disabled"),
    ("orphan", "no_password"),
    ("cooldown", "cooldown"),
])
def test_a_help_mail_not_sent_logs_its_reason(app, outbox, caplog, case, reason):
    from padel_app.models import User

    if case == "disabled":
        _social_user(app, status="disabled", email="help782@example.com")
    else:
        with app.app_context():
            db.session.add(User(name="Orphan", username="orphan782", email="help782@example.com",
                                password=None, status="inactive",
                                password_reset_sent_at=T0 - timedelta(seconds=30) if case == "cooldown" else None))
            db.session.commit()

    with caplog.at_level(logging.INFO):
        _request(app, "help782@example.com")

    assert outbox == []
    assert _lines(caplog, "sent nothing") == [f"recovery request sent nothing: {reason}"]
