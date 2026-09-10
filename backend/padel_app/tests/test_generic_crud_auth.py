"""
PAD-88 — the generic model-CRUD blueprint (`padel_app/modules/api.py`) must not
be reachable without administrator credentials.

Before PAD-88 the blueprint carried no `before_request` guard and no
`jwt_required` on any route, so an anonymous caller could create, edit, delete,
dump and CSV-export every entry of `padel_app.models.MODELS`.

PAD-267 (settings.admin-editor rules 2 and 5) tightened it: only the
superadmin gets through (a legacy `is_admin` is now refused too), and the CSV
export/import routes are gone (their absence is pinned in
test_pad267_admin_editor.py).

These tests pin the contract:
  * no credentials                -> 401, and nothing is written;
  * valid credentials, not admin  -> 403, and nothing is written;
  * admin (JWT or Flask-Login session) -> the guard lets the request through.
"""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.helpers import make_coach


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _make_user(app, username, *, is_admin=False, is_superadmin=False):
    from padel_app.models import User

    with app.app_context():
        user = User(
            name=username,
            username=username,
            password="x",
            is_admin=is_admin,
            is_superadmin=is_superadmin,
        )
        db.session.add(user)
        db.session.commit()
        return user.id


def _season_count(app):
    from padel_app.models.coach_seasons import CoachSeason

    with app.app_context():
        return CoachSeason.query.count()


# Every route the blueprint exposes, as (method, path). None of them may be
# served to an anonymous caller.
ALL_ROUTES = [
    ("post", "/api/create/season"),
    ("post", "/api/edit/season/1"),
    ("get", "/api/delete/season/1"),
    ("post", "/api/delete/season/1"),
    ("get", "/api/query/user"),
    ("post", "/api/query/user"),
    ("get", "/api/remove_relationship"),
    ("post", "/api/remove_relationship"),
    ("get", "/api/modal_create_page/season"),
    ("post", "/api/modal_create_page/season"),
    ("get", "/api/image/1"),
]


@pytest.mark.parametrize("method,path", ALL_ROUTES)
def test_every_generic_crud_route_rejects_anonymous_callers(client, method, path):
    response = getattr(client, method)(path)
    assert response.status_code == 401, (
        f"{method.upper()} {path} returned {response.status_code}, expected 401"
    )


def test_anonymous_create_is_rejected_and_writes_nothing(app, client):
    coach_id = make_coach(app)
    before = _season_count(app)

    response = client.post(
        "/api/create/season",
        json={
            "values": {
                "coach_id": coach_id,
                "name": "Bypass A",
                "start_date": "2026-03-01",
                "end_date": "2026-05-31",
            }
        },
    )

    assert response.status_code == 401
    assert _season_count(app) == before


def test_anonymous_edit_is_rejected_and_writes_nothing(app, client):
    from padel_app.models.coach_seasons import CoachSeason

    coach_id = make_coach(app)
    with app.app_context():
        season = CoachSeason(
            coach_id=coach_id,
            label="Legit",
            start_day=1,
            start_month=3,
            end_day=31,
            end_month=5,
        )
        db.session.add(season)
        db.session.commit()
        season_id = season.id

    response = client.post(
        f"/api/edit/season/{season_id}",
        json={"values": {"label": "Tampered"}},
    )

    assert response.status_code == 401
    with app.app_context():
        assert db.session.get(CoachSeason, season_id).label == "Legit"


def test_anonymous_query_does_not_leak_rows(app, client):
    _make_user(app, "leak_probe")

    response = client.get("/api/query/user")

    assert response.status_code == 401
    assert b"leak_probe" not in response.data


def test_authenticated_non_admin_is_forbidden(app, client):
    """A valid login is not enough — the caller must be an administrator."""
    coach_id = make_coach(app)
    user_id = _make_user(app, "plain_user")
    headers = _auth_header(app, user_id)
    before = _season_count(app)

    create = client.post(
        "/api/create/season",
        json={
            "values": {
                "coach_id": coach_id,
                "name": "Bypass B",
                "start_date": "2026-03-01",
                "end_date": "2026-05-31",
            }
        },
        headers=headers,
    )
    assert create.status_code == 403
    assert _season_count(app) == before

    assert client.get("/api/query/user", headers=headers).status_code == 403


def test_legacy_admin_who_is_not_superadmin_is_forbidden(app, client):
    """PAD-267 (settings.admin-editor rule 2): `is_admin` alone no longer passes."""
    from padel_app.models.clubs import Club

    admin_id = _make_user(app, "admin_user", is_admin=True)

    response = client.post(
        "/api/create/club",
        json={
            "values": {
                "name": "Admin created club",
                "description": "created through the generic editor API",
                "location": "Lisbon",
            }
        },
        headers=_auth_header(app, admin_id),
    )

    assert response.status_code == 403
    with app.app_context():
        assert Club.query.filter_by(name="Admin created club").count() == 0


def test_superadmin_jwt_can_write_through_the_guard(app, client):
    from padel_app.models.clubs import Club

    admin_id = _make_user(app, "super_writer", is_superadmin=True)
    response = client.post(
        "/api/create/club",
        json={"values": {"name": "Superadmin created club", "description": "d", "location": "Lisbon"}},
        headers=_auth_header(app, admin_id),
    )
    assert response.status_code == 200
    with app.app_context():
        assert Club.query.filter_by(name="Superadmin created club").count() == 1


def test_superadmin_jwt_passes_the_guard(app, client):
    admin_id = _make_user(app, "super_user", is_superadmin=True)

    response = client.get("/api/query/user", headers=_auth_header(app, admin_id))

    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Flask-Login session path (the legacy Jinja editor at /editor)
# ---------------------------------------------------------------------------
# The shared `app` fixture builds an app with no SECRET_KEY and no configured
# server-side session backend, so cookie sessions cannot be opened there. These
# two tests therefore build their own app with sessions enabled.


@pytest.fixture
def session_app(app_with_config):
    # PAD-278: built by conftest on the selected backend (sqlite or postgres),
    # not a private SQLite file, so the Postgres run covers these tests too.
    return app_with_config({"SECRET_KEY": "test-secret-key", "SESSION_TYPE": "filesystem"})


@pytest.fixture
def session_client(session_app):
    return session_app.test_client()


def _login_session(client, user_id):
    with client.session_transaction() as session:
        session["_user_id"] = str(user_id)
        session["_fresh"] = True


def test_superadmin_flask_login_session_passes_the_guard(session_app, session_client):
    """The legacy Jinja editor authenticates with a session, not a JWT."""
    admin_id = _make_user(session_app, "session_super", is_superadmin=True)
    _login_session(session_client, admin_id)

    assert session_client.get("/api/query/user").status_code == 200


def test_legacy_admin_flask_login_session_is_forbidden(session_app, session_client):
    """PAD-267 (settings.admin-editor rule 2): a session admin who is not superadmin is refused."""
    admin_id = _make_user(session_app, "session_admin", is_admin=True)
    _login_session(session_client, admin_id)

    assert session_client.get("/api/query/user").status_code == 403


def test_non_admin_flask_login_session_is_forbidden(session_app, session_client):
    user_id = _make_user(session_app, "session_user")
    _login_session(session_client, user_id)

    assert session_client.get("/api/query/user").status_code == 403
