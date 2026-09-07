"""auth.register — self-service signup for coaches and students (PAD-210)."""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _student(username="ana", email="ana@example.com", **over):
    body = {
        "role": "student",
        "name": "Ana Silva",
        "username": username,
        "email": email,
        "password": "Segura123",
    }
    body.update(over)
    return body


def _coach(username="rui", email="rui@example.com", **over):
    body = {
        "role": "coach",
        "name": "Rui Costa",
        "username": username,
        "email": email,
        "password": "Segura123",
    }
    body.update(over)
    return body


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _count(app, model):
    with app.app_context():
        return model.query.count()


# --- Student signs up and is signed in ------------------------------------

def test_student_signs_up_and_is_signed_in(client, app):
    from padel_app.models import Association_CoachPlayer, Association_PlayerClub, Coach, Player, User

    res = client.post("/api/auth/register", json=_student())
    assert res.status_code == 201, res.get_json()
    body = res.get_json()
    assert body["accessToken"]
    assert body["user"]["role"] == "player"

    with app.app_context():
        user = User.query.filter_by(username="ana").first()
        assert user.status == "active"
        assert user.email == "ana@example.com"
        assert user.password and user.password != "Segura123"  # hashed
        player = Player.query.filter_by(user_id=user.id).first()
        assert player is not None
        assert Coach.query.filter_by(user_id=user.id).first() is None
        assert Association_CoachPlayer.query.filter_by(player_id=player.id).count() == 0
        assert Association_PlayerClub.query.filter_by(player_id=player.id).count() == 0

    with app.app_context():
        me = client.get("/api/auth/me", headers=_auth(app, user.id)).get_json()
    assert me["coachApproval"] is None
    assert me["clubs"] == []
    assert me["pendingClubJoinRequest"] is None


# --- Coach signs up and is pending approval --------------------------------

def test_coach_signs_up_and_is_pending_approval(client, app):
    from padel_app.models import Association_CoachClub, Club, Coach, User

    res = client.post("/api/auth/register", json=_coach())
    assert res.status_code == 201, res.get_json()
    assert res.get_json()["accessToken"]
    assert res.get_json()["user"]["role"] == "coach"

    with app.app_context():
        user = User.query.filter_by(username="rui").first()
        coach = Coach.query.filter_by(user_id=user.id).first()
        assert coach.approval_status == "pending"
        assert Association_CoachClub.query.filter_by(coach_id=coach.id).count() == 0
        assert Club.query.count() == 0
        assert len(coach.levels) > 0  # default ladder
        me = client.get("/api/auth/me", headers=_auth(app, user.id)).get_json()
    assert me["coachApproval"] == "pending"
    assert me["clubs"] == []
    assert me["pendingClubJoinRequest"] is None


def test_coach_is_approved_at_signup_when_gate_is_off(client, app):
    from padel_app.models import Coach

    app.config["COACH_APPROVAL_REQUIRED"] = False
    res = client.post("/api/auth/register", json=_coach())
    assert res.status_code == 201
    with app.app_context():
        assert Coach.query.first().approval_status == "approved"


# --- A club key at signup is ignored ---------------------------------------

def test_club_key_at_signup_is_ignored(client, app):
    from padel_app.models import Club

    res = client.post(
        "/api/auth/register",
        json=_coach(club={"create": {"name": "Padel Norte"}}),
    )
    assert res.status_code == 201
    with app.app_context():
        assert Club.query.filter_by(name="Padel Norte").first() is None


# --- Pending coach cannot reach club-scoped endpoints ----------------------

def test_pending_coach_cannot_reach_club_scoped_endpoints(client, app):
    from padel_app.models import Club, Coach, User

    client.post("/api/auth/register", json=_coach())
    with app.app_context():
        user_id = User.query.filter_by(username="rui").first().id
        headers = _auth(app, user_id)

    for path, body in [
        ("/api/app/club", {"name": "Rui Padel"}),
        ("/api/app/add_player", {"name": "X"}),
        ("/api/app/club/1/join-requests", {}),
    ]:
        res = client.post(path, json=body, headers=headers)
        assert res.status_code in (403, 404), (path, res.status_code)
        if res.status_code == 403:
            assert res.get_json()["error"] == "COACH_NOT_APPROVED", path

    # the two routes that exist today must be the 403 branch
    assert client.post("/api/app/club", json={"name": "Rui Padel"}, headers=headers).status_code == 403
    assert client.post("/api/app/add_player", json={"name": "X"}, headers=headers).status_code == 403
    with app.app_context():
        assert Club.query.count() == 0
        assert Coach.query.first().approval_status == "pending"


# --- Taken username and taken email are 409 with the field named ----------

def test_taken_username_and_email_are_409_with_field(client, app):
    assert client.post("/api/auth/register", json=_student()).status_code == 201

    res = client.post("/api/auth/register", json=_student(email="fresh@example.com"))
    assert res.status_code == 409
    assert res.get_json()["field"] == "username"

    res = client.post("/api/auth/register", json=_student(username="fresh", email="ANA@example.com"))
    assert res.status_code == 409
    assert res.get_json()["field"] == "email"


# --- Placeholder-looking username is rejected ------------------------------

def test_placeholder_username_is_rejected(client, app):
    from padel_app.models import User

    res = client.post("/api/auth/register", json=_student(username="pending-abc123"))
    assert res.status_code == 400
    assert res.get_json()["field"] == "username"
    assert _count(app, User) == 0


@pytest.mark.parametrize(
    "over,field",
    [
        ({"role": "admin"}, "role"),
        ({"name": ""}, "name"),
        ({"username": "ab"}, "username"),
        ({"username": "has space"}, "username"),
        ({"email": "not-an-email"}, "email"),
        ({"email": ""}, "email"),
        ({"password": "short"}, "password"),
    ],
)
def test_validation_errors_name_the_field(client, app, over, field):
    from padel_app.models import User

    res = client.post("/api/auth/register", json=_student(**over))
    assert res.status_code == 400
    assert res.get_json()["field"] == field
    assert _count(app, User) == 0


# --- Transaction is atomic --------------------------------------------------

def test_registration_is_atomic(client, app, monkeypatch):
    from padel_app.models import Coach, User
    from padel_app.services import coach_service

    def boom(coach):
        raise RuntimeError("ladder failed")

    monkeypatch.setattr(coach_service, "create_default_levels_for_coach", boom)
    app.config["PROPAGATE_EXCEPTIONS"] = False  # let Flask answer 500 as in prod
    res = client.post("/api/auth/register", json=_coach())
    assert res.status_code == 500
    assert _count(app, User) == 0
    assert _count(app, Coach) == 0


# --- Signup is signed in: the token works ---------------------------------

def test_token_from_signup_authenticates(client):
    res = client.post("/api/auth/register", json=_student())
    token = res.get_json()["accessToken"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.get_json()["username"] == "ana"


# --- Email is stored lowercased --------------------------------------------

def test_email_is_lowercased(client, app):
    from padel_app.models import User

    client.post("/api/auth/register", json=_student(email="Ana.Silva@Example.COM"))
    with app.app_context():
        assert User.query.filter_by(username="ana").first().email == "ana.silva@example.com"
