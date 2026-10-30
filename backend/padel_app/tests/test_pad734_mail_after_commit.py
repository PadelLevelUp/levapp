"""PAD-734: sign-up and password-recovery mail goes out after the commit, off the request thread,
with an SMTP timeout (auth.register rule 14, auth.password-recovery rule 3,
auth.email-verification rule 6)."""
import smtplib
import socket
import threading
import time

import pytest
from werkzeug.security import generate_password_hash

from padel_app.sql_db import db

pytestmark = pytest.mark.usefixtures("no_test_may_hang")


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture
def commits():
    """Counts real commits from now on (a SAVEPOINT release is not one). A second connection is no
    witness here: the test database may share one connection, where flushed rows look committed."""
    from sqlalchemy import event
    from sqlalchemy.orm import Session

    state = {"n": 0}

    def on_commit(session):
        if not session.in_nested_transaction():
            state["n"] += 1

    event.listen(Session, "after_commit", on_commit)
    yield state
    event.remove(Session, "after_commit", on_commit)


@pytest.fixture
def silent_smtp(app, monkeypatch):
    """A mail server that accepts the connection and never says a word, through the real Flask-Mail
    path (send_email → mail.send → our Connection), with a half-second MAIL_TIMEOUT."""
    from padel_app.tools import email_tools

    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(16)  # never accepted: the handshake completes, the banner never comes
    state = app.extensions["mail"]
    monkeypatch.setattr(state, "server", "127.0.0.1")
    monkeypatch.setattr(state, "port", server.getsockname()[1])
    monkeypatch.setattr(state, "use_ssl", False)
    monkeypatch.setattr(state, "use_tls", False)
    monkeypatch.setattr(state, "suppress", False)  # Flask-Mail suppresses under TESTING by default
    monkeypatch.setitem(app.config, "MAIL_TIMEOUT", 0.5)
    monkeypatch.setattr(email_tools, "debug_endpoints_enabled", lambda: False)
    monkeypatch.setattr(email_tools, "_sender", lambda: "noreply@levapp.app")
    monkeypatch.setattr(email_tools, "allowed_recipients", lambda recipients: list(recipients))
    yield
    server.close()


@pytest.fixture
def stalled_mail(app, monkeypatch, commits):
    """send_email blocks until the test ends; each call records how many commits came before it.
    Dispatch runs on its real thread (MAIL_DISPATCH_INLINE off)."""
    from padel_app.tools import email_tools

    release = threading.Event()
    calls = []

    def stall(subject, recipients, body=None, html=None):
        calls.append(commits["n"])
        release.wait(10)
        return "Sent"

    monkeypatch.setattr(email_tools, "send_email", stall)
    monkeypatch.setitem(app.config, "MAIL_DISPATCH_INLINE", False)
    yield calls
    release.set()
    for thread in threading.enumerate():
        if thread.name == "mail-send":
            thread.join(5)


def _wait_for(calls):
    deadline = time.monotonic() + 3
    while not calls and time.monotonic() < deadline:
        time.sleep(0.01)
    return calls


def _register(client):
    return client.post(
        "/api/auth/register",
        json={"role": "student", "name": "Ana Silva", "username": "ana734", "email": "ana734@example.com",
              "password": "Segura123", "birthDate": "2000-01-01", "country": "PT"},
    )


def _user(username="ana734"):
    from padel_app.models import User

    return User.query.filter_by(username=username).first()


@pytest.fixture
def ana(app):
    from padel_app.models import User

    with app.app_context():
        user = User(name="Ana Silva", username="ana734", email="ana734@example.com",
                    password=generate_password_hash("Segura123"), status="active")
        db.session.add(user)
        db.session.commit()
        return user.id


def _recover(client):
    return client.post("/api/auth/password-recovery/request", json={"email": "ana734@example.com"})


def _incidents():
    from padel_app.models.delivery_incident import DeliveryIncident

    return DeliveryIncident.query.filter_by(kind="email_failed").all()


# ── the SMTP timeout ─────────────────────────────────────────────────────────

def test_a_silent_mail_server_times_out_and_is_recorded(app, silent_smtp):
    from padel_app.tools import email_tools

    with app.app_context():
        started = time.monotonic()
        # smtplib reports the read timeout on the banner as a disconnect "timed out".
        with pytest.raises(smtplib.SMTPServerDisconnected, match="timed out"):
            email_tools.send_email("Hello", ["someone@example.com"], body="x")
        assert time.monotonic() - started < 3
        assert len(_incidents()) == 1


# ── the response never waits for the mail ────────────────────────────────────

def test_signup_answers_while_the_mail_server_hangs(client, app, stalled_mail):
    started = time.monotonic()
    res = _register(client)

    assert res.status_code == 201, res.get_json()
    assert time.monotonic() - started < 2  # the mail is still blocked for up to 10 s
    assert res.get_json()["user"]["emailVerification"] == "pending"
    calls = _wait_for(stalled_mail)
    assert len(calls) == 1 and calls[0] > 0  # the send began only after a commit
    with app.app_context():
        user = _user()
        assert user is not None and user.email_verification_code_hash is not None


def test_recovery_answers_while_the_mail_server_hangs(client, app, ana, stalled_mail, commits):
    commits["n"] = 0
    started = time.monotonic()
    res = _recover(client)

    assert res.status_code == 200
    assert time.monotonic() - started < 2
    calls = _wait_for(stalled_mail)
    assert len(calls) == 1 and calls[0] > 0  # the code had committed before the send began
    with app.app_context():
        assert _user().password_reset_code_hash is not None


# ── a mail that times out leaves the account and clears the code ─────────────

def test_a_timed_out_signup_mail_keeps_the_account_and_clears_the_code(client, app, silent_smtp):
    res = _register(client)

    assert res.status_code == 201, res.get_json()
    with app.app_context():
        user = _user()
        assert user is not None and user.status == "active"
        assert user.email_verification_code_hash is None and user.email_verification_sent_at is None
        assert [i.user_id for i in _incidents()] == [user.id]


def test_a_timed_out_recovery_mail_still_answers_200_and_clears_the_code(client, app, ana, silent_smtp):
    res = _recover(client)

    assert res.status_code == 200 and res.get_json()["ok"] is True
    with app.app_context():
        user = _user()
        assert user.password_reset_code_hash is None and user.password_reset_expires_at is None
        # Rule 3a (PAD-781): the attempt's time stays, so the failure is still readable.
        assert user.password_reset_sent_at is not None
        assert [i.user_id for i in _incidents()] == [ana]


def test_a_failed_mail_does_not_clear_a_newer_code(client, app, ana, monkeypatch):
    """The cleanup clears only the code its own mail carried."""
    from sqlalchemy import update
    from sqlalchemy.orm import Session

    from padel_app.models import User
    from padel_app.tools import email_tools

    def newer_code_then_fail(subject, recipients, body=None, html=None):
        with Session(db.engine) as other:
            other.execute(update(User).where(User.id == ana).values(password_reset_code_hash="newer"))
            other.commit()
        raise ConnectionRefusedError("smtp down")

    monkeypatch.setattr(email_tools, "send_email", newer_code_then_fail)
    assert _recover(client).status_code == 200
    with app.app_context():
        assert _user().password_reset_code_hash == "newer"
