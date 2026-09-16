"""PAD-175 / PAD-267 — settings.admin-editor: the superadmin data browser
(/api/editor/*) and the legacy Jinja editor (/editor/*, /api/*) are switched on
per environment, superadmin-only whatever the flag, and never let a secret out
(reads) or in (writes)."""
import os
import re
import tempfile
from pathlib import Path

import pytest
from flask_jwt_extended import create_access_token
from werkzeug.security import check_password_hash, generate_password_hash

from padel_app.sql_db import db

BACKEND = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _user(app, username, *, superadmin=False, admin=False, role=None):
    """role: None | "coach" | "student"."""
    from padel_app.models import User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player

    with app.app_context():
        user = User(
            name=username, username=username, password=generate_password_hash("pw"), status="active",
            is_superadmin=superadmin, is_admin=admin, generated_code=4242,
        )
        db.session.add(user)
        db.session.flush()
        if role == "coach":
            db.session.add(Coach(user_id=user.id))
        elif role == "student":
            db.session.add(Player(user_id=user.id))
        db.session.commit()
        return user.id


def _build_app(**config):
    """An app configured like production sessions (for the Jinja pages)."""
    from padel_app import create_app
    from padel_app.sql_db import init_db

    fd, path = tempfile.mkstemp()
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{path}",
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "SECRET_KEY": "test-secret",
        "SESSION_TYPE": "filesystem",
        "JWT_SECRET_KEY": "test-jwt-secret",
        **config,
    })
    with app.app_context():
        init_db(app)
        db.create_all()
    return app, fd, path


@pytest.fixture
def session_app():
    app, fd, path = _build_app()
    yield app
    os.close(fd)
    os.unlink(path)


@pytest.fixture
def editor_off_app():
    app, fd, path = _build_app(EDITOR_ENABLED=False)
    yield app
    os.close(fd)
    os.unlink(path)


def _login_session(client, user_id):
    with client.session_transaction() as session:
        session["_user_id"] = str(user_id)
        session["_fresh"] = True


# ── rule 1: switched on only where EDITOR_ENABLED is set ─────────────────────

def test_the_flag_switches_every_editor_surface_off(editor_off_app):
    client = editor_off_app.test_client()
    root = _user(editor_off_app, "root", superadmin=True)
    headers = _auth(editor_off_app, root)
    assert client.get("/api/editor/models", headers=headers).status_code == 404
    assert client.get("/api/query/user", headers=headers).status_code == 404
    _login_session(client, root)
    assert client.get("/editor/").status_code == 404


def test_the_flag_defaults_on_in_development_and_off_in_production():
    from padel_app.config import DevConfig, ProdConfig, editor_enabled_from_env

    assert DevConfig.EDITOR_ENABLED_DEFAULT is True
    assert ProdConfig.EDITOR_ENABLED_DEFAULT is False
    assert editor_enabled_from_env({}, default=False) is False
    assert editor_enabled_from_env({"EDITOR_ENABLED": "1"}, default=False) is True
    assert editor_enabled_from_env({"EDITOR_ENABLED": "0"}, default=True) is False
    assert editor_enabled_from_env({"EDITOR_ENABLED": " "}, default=True) is True


def test_staging_switches_it_on_and_production_does_not():
    assert "EDITOR_ENABLED=1" in (BACKEND / ".env.staging").read_text().splitlines()
    assert not any(line.startswith("EDITOR_ENABLED") for line in (BACKEND / ".env.prod").read_text().splitlines())


# ── rule 2: superadmin only, whatever the flag says ──────────────────────────

API_PATHS = ["/api/editor/models", "/api/editor/user", "/api/editor/user/schema", "/api/query/user"]


@pytest.mark.parametrize("who", ["coach", "student", "admin"])
def test_non_superadmins_get_403_on_every_api_surface_and_write_nothing(app, client, who):
    from padel_app.models import Club

    uid = _user(app, f"api_{who}", admin=(who == "admin"), role=None if who == "admin" else who)
    headers = _auth(app, uid)
    for path in API_PATHS:
        assert client.get(path, headers=headers).status_code == 403, path
    with app.app_context():
        clubs = Club.query.count()
    assert client.post("/api/editor/club", headers=headers, json={"values": {"name": "X"}}).status_code == 403
    assert client.post("/api/create/club", headers=headers, json={"values": {"name": "Y"}}).status_code == 403
    with app.app_context():
        assert Club.query.count() == clubs


def test_anonymous_api_calls_get_401(app, client):
    for path in API_PATHS:
        assert client.get(path).status_code == 401, path


def test_the_superadmin_gets_in(app, client):
    headers = _auth(app, _user(app, "root", superadmin=True))
    for path in API_PATHS:
        assert client.get(path, headers=headers).status_code == 200, path


@pytest.mark.parametrize("who", ["coach", "student", "admin"])
def test_the_jinja_editor_refuses_signed_in_non_superadmins(session_app, who):
    client = session_app.test_client()
    _login_session(client, _user(session_app, f"jinja_{who}", admin=(who == "admin"),
                                 role=None if who == "admin" else who))
    assert client.get("/editor/").status_code == 403


def test_the_jinja_editor_sends_anonymous_visitors_to_login(session_app):
    res = session_app.test_client().get("/editor/")
    assert res.status_code == 302 and "/auth/login" in res.headers["Location"]


def test_the_jinja_editor_admits_the_superadmin(session_app):
    client = session_app.test_client()
    _login_session(client, _user(session_app, "jinja_root", superadmin=True))
    assert client.get("/editor/").status_code == 200


# ── rule 3: secrets never leave and never change ─────────────────────────────

USER_SECRETS = {"password", "generated_code", "email_verification_code_hash"}


def test_reads_never_carry_a_secret(app, client):
    from padel_app.models.device_token import DeviceToken
    from padel_app.models.push_subscriptions import PushSubscription

    root = _user(app, "root", superadmin=True)
    target = _user(app, "target", role="student")
    with app.app_context():
        db.session.add(DeviceToken(user_id=target, token="ios-secret-token", platform="ios"))
        db.session.add(PushSubscription(user_id=target, subscription_json='{"keys": {"auth": "s3cr3t"}}'))
        db.session.commit()
    headers = _auth(app, root)

    listed = client.get("/api/editor/user", headers=headers).get_json()["items"]
    record = client.get(f"/api/editor/user/{target}", headers=headers).get_json()
    legacy = client.get("/api/query/user", headers=headers).get_json()
    for row in listed + [record] + legacy:
        assert not USER_SECRETS & set(row), row.keys()
    assert all("token" not in row for row in client.get("/api/editor/devicetoken", headers=headers).get_json()["items"])
    assert all("subscription_json" not in row
               for row in client.get("/api/editor/pushsubscription", headers=headers).get_json()["items"])


def test_invitation_and_join_tokens_are_never_serialized(app):
    from padel_app.models.coach_invitation import CoachInvitation
    from padel_app.models.coach_join_token import CoachJoinToken
    from padel_app.models.player_invitation import PlayerInvitation
    from padel_app.modules.editor_api import serialize

    with app.app_context():
        for model in (CoachInvitation, PlayerInvitation, CoachJoinToken):
            assert "token" not in serialize(model(token="t0p-secret")), model.__name__


def test_the_jinja_pages_never_render_a_secret(session_app):
    """Display pages pre-fill every form field and list pages print each
    model's list columns: neither may show a hash, a reset code or a token.

    Every page must load (200) before its content is checked, so an error page
    can never make the check pass. Tokens are checked on the coach-invitation
    pages because DeviceToken's own Jinja pages have always failed (its form
    declares an unsupported "String" field and it defines no list columns);
    that pre-existing defect is an open item in settings.admin-editor.
    """
    from datetime import datetime, timedelta

    from padel_app.models import Club, User
    from padel_app.models.coach_invitation import CoachInvitation

    client = session_app.test_client()
    _login_session(client, _user(session_app, "page_root", superadmin=True))
    target = _user(session_app, "page_target")
    with session_app.app_context():
        user = db.session.get(User, target)
        user.generated_code = 987654
        club = Club(name="Page Club", description="d", location="l")
        db.session.add(club)
        db.session.flush()
        invitation = CoachInvitation(club_id=club.id, token="inv-secret-token-ABC", email="a@b.c",
                                     expires_at=datetime.utcnow() + timedelta(days=7))
        db.session.add(invitation)
        db.session.commit()
        stored_hash, invitation_id = user.password, invitation.id

    def page(path):
        res = client.get(path)
        assert res.status_code == 200, (path, res.status_code)
        return res.get_data(as_text=True)

    user_page = page(f"/editor/display/user/{target}")
    assert stored_hash not in user_page and "987654" not in user_page
    assert "987654" not in page("/editor/display/user"), "the users list shows generated_code as a column"
    assert "inv-secret-token-ABC" not in page(f"/editor/display/coachinvitation/{invitation_id}")
    assert "inv-secret-token-ABC" not in page("/editor/display/coachinvitation")


def test_writes_never_change_a_secret(app, client):
    from padel_app.models import User

    root = _user(app, "root", superadmin=True)
    target = _user(app, "target")
    headers = _auth(app, root)
    res = client.patch(f"/api/editor/user/{target}", headers=headers,
                       json={"values": {"password": "overwritten", "name": "Renamed"}})
    assert res.status_code == 200, res.get_json()
    res = client.post(f"/api/edit/user/{target}", headers=headers,
                      json={"values": {"generated_code": 1111, "email_verification_code_hash": "x"}})
    assert res.status_code == 200, res.get_json()
    created = client.post("/api/editor/user", headers=headers,
                          json={"values": {"name": "New", "username": "new_user", "password": "set-by-editor"}})
    assert created.status_code == 201, created.get_json()
    with app.app_context():
        user = db.session.get(User, target)
        assert user.name == "Renamed" and check_password_hash(user.password, "pw")
        assert user.generated_code == 4242 and user.email_verification_code_hash is None
        assert db.session.get(User, created.get_json()["id"]).password is None


SECRET_LIKE = re.compile(r"token|password|secret|hash|subscription")


def test_every_secret_looking_column_is_redacted_or_cleared(app):
    """Guard: a new secret-looking column must be added to REDACTED_COLUMNS or
    explicitly cleared in NOT_SECRET — never silently served by the editor."""
    from padel_app.tools.redaction import NOT_SECRET, REDACTED_COLUMNS

    with app.app_context():
        found = {
            (table.name, column.name)
            for table in db.metadata.tables.values()
            for column in table.columns
            if SECRET_LIKE.search(column.name)
        }
    listed = {(table, column) for table, columns in REDACTED_COLUMNS.items() for column in columns}
    assert found <= listed | NOT_SECRET, f"unlisted: {sorted(found - listed - NOT_SECRET)}"
    assert USER_SECRETS <= REDACTED_COLUMNS["users"]


# ── rule 4: no method invocation by name ─────────────────────────────────────

def test_no_method_runs_by_name(app, client):
    from padel_app.models import User

    root = _user(app, "root", superadmin=True)
    victim = _user(app, "victim")
    res = client.post(f"/api/edit/user/{victim}", headers=_auth(app, root),
                      json={"values": {}, "methods": ["delete"]})
    assert res.status_code == 400
    with app.app_context():
        assert db.session.get(User, victim) is not None


# ── rule 5: no CSV export or import ──────────────────────────────────────────

def test_csv_routes_are_gone(app, client):
    headers = _auth(app, _user(app, "root", superadmin=True))
    for path in ("/api/download_csv/user", "/api/upload_csv_to_db/user"):
        assert client.get(path, headers=headers).status_code == 404, path
