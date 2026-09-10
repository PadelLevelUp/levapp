"""B-053 — auth.login rule 12: a disabled account cannot sign in."""
import pytest
from werkzeug.security import generate_password_hash

from padel_app.sql_db import db

PASSWORD = "Segura1234"


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    # The legacy /auth/login uses Flask-Session. The mapping-built test app gets
    # no SESSION_TYPE, so Flask-Session installs its null interface at startup;
    # mirror production's filesystem sessions (they can hold the User object
    # the legacy route stores) so "no session is opened" means something.
    import tempfile

    from flask_session import Session

    app.config["SECRET_KEY"] = "test-secret"
    app.config["SESSION_TYPE"] = "filesystem"
    app.config["SESSION_FILE_DIR"] = tempfile.mkdtemp()
    Session(app)


def _user(app, username, *, status="active", coach=None, reason=None, player=False):
    from padel_app.models import Coach, Player, User

    with app.app_context():
        user = User(name=username.title(), username=username, email=f"{username}@example.com",
                    password=generate_password_hash(PASSWORD), status=status)
        db.session.add(user)
        db.session.flush()
        if player:
            db.session.add(Player(user_id=user.id))
        if coach:
            db.session.add(Coach(user_id=user.id, approval_status=coach, rejection_reason=reason))
        db.session.commit()
        return user.id


def _login(client, username, password=PASSWORD):
    return client.post("/api/auth/login", json={"username": username, "password": password})


@pytest.mark.parametrize("make", [
    lambda app: _user(app, "ana", status="disabled", player=True),        # deleted student
    lambda app: _user(app, "ana", status="disabled", coach="approved"),   # deleted coach
])
def test_disabled_account_gets_a_clear_401(client, app, make):
    make(app)
    res = _login(client, "ana")
    assert res.status_code == 401
    body = res.get_json()
    assert body == {"error": "ACCOUNT_DISABLED"}
    assert "accessToken" not in body


def test_disabled_account_with_wrong_password_leaks_nothing(client, app):
    _user(app, "ana", status="disabled", player=True)
    res = _login(client, "ana", "not-the-password")
    assert res.status_code == 401
    assert res.get_json() == {"error": "Invalid credentials"}


def test_rejected_coach_still_gets_the_reason(client, app):
    _user(app, "rita", status="disabled", coach="rejected", reason="not a coach")
    res = _login(client, "rita")
    assert res.status_code == 403
    assert res.get_json() == {"error": "COACH_REJECTED", "reason": "not a coach"}


def test_active_account_still_signs_in(client, app):
    _user(app, "bruno", player=True)
    res = _login(client, "bruno")
    assert res.status_code == 200
    assert res.get_json()["accessToken"]


def test_legacy_login_refuses_a_disabled_account(client, app):
    _user(app, "ana", status="disabled", player=True)
    res = client.post("/auth/login", data={"username": "ana", "password": PASSWORD})
    assert res.status_code == 401
    with client.session_transaction() as sess:
        assert "_user_id" not in sess and "user" not in sess
