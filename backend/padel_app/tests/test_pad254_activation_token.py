"""auth.activate rules 2-7 (PAD-254, B-034, audit C1) — the activation link
carries a per-account secret; the numeric id alone opens nothing.

Before this, `GET /api/app/register/user/<id>` handed out any user's contact
details and `POST /api/app/activate/user/<id>` set any inactive account's
password, with no auth and no token. Ids are sequential.
"""
import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import make_coach


@pytest.fixture
def coach_id(app):
    return make_coach(app)


def _inactive_user(app, **overrides):
    from padel_app.models import User

    fields = dict(name="Bruno", username="pending-b034", email="bruno@example.com",
                  phone="912345678", status="inactive", language="pt")
    fields.update(overrides)
    with app.app_context():
        user = User(**fields)
        db.session.add(user)
        db.session.commit()
        return user.id


def _token(app, user_id):
    from padel_app.models import User
    from padel_app.tools.activation_token import activation_token_for

    with app.app_context():
        return activation_token_for(User.query.get(user_id))


def _fresh(app, user_id):
    from padel_app.models import User

    with app.app_context():
        u = User.query.get(user_id)
        return dict(status=u.status, password=u.password, name=u.name, username=u.username,
                    language=u.language, is_superadmin=u.is_superadmin)


# ---------------------------------------------------------------------------
# rule 2 — the token is derived, unguessable and constant-time compared
# ---------------------------------------------------------------------------

def test_token_is_deterministic_and_differs_per_account(app):
    a = _inactive_user(app, username="pending-a", email="a@example.com")
    b = _inactive_user(app, username="pending-b", email="b@example.com")
    assert _token(app, a) == _token(app, a)
    assert _token(app, a) != _token(app, b)
    assert len(_token(app, a)) == 64


def test_token_depends_on_the_server_secret(app):
    a = _inactive_user(app)
    before = _token(app, a)
    app.config["SECRET_KEY"] = "rotated-secret"
    assert _token(app, a) != before


# ---------------------------------------------------------------------------
# rules 4-5 — the id alone opens nothing
# ---------------------------------------------------------------------------

def test_the_id_alone_opens_nothing(app, client):
    uid = _inactive_user(app)

    for url in (f"/api/app/register/user/{uid}", f"/api/app/register/user/{uid}?token=wrong"):
        res = client.get(url)
        assert res.status_code == 404, url
        body = res.get_data(as_text=True)
        assert "Bruno" not in body and "bruno@example.com" not in body

    for payload in ({"password": "Hijack1!"}, {"token": "wrong", "password": "Hijack1!"}):
        res = client.post(f"/api/app/activate/user/{uid}", json=payload)
        assert res.status_code == 404
    after = _fresh(app, uid)
    assert after["status"] == "inactive" and after["password"] is None


def test_the_guard_lives_in_the_service(app):
    """Route-independent: calling the service without the token is refused."""
    from werkzeug.exceptions import NotFound
    from padel_app.services.user_service import activate_user_service

    uid = _inactive_user(app)
    with app.app_context():
        with pytest.raises(NotFound):
            activate_user_service(uid, {"password": "Hijack1!"}, token=None)
        with pytest.raises(NotFound):
            activate_user_service(uid, {"password": "Hijack1!"}, token="wrong")
    assert _fresh(app, uid)["status"] == "inactive"


# ---------------------------------------------------------------------------
# rule 4 — the GET returns the form fields and nothing else
# ---------------------------------------------------------------------------

def test_lookup_with_the_token_returns_only_the_form_fields(app, client):
    uid = _inactive_user(app)
    res = client.get(f"/api/app/register/user/{uid}?token={_token(app, uid)}")
    assert res.status_code == 200
    body = res.get_json()
    assert set(body) == {"id", "name", "username", "email", "phone", "isActive"}
    assert body["name"] == "Bruno" and body["isActive"] is False
    # rule 10 — the generated placeholder is never prefilled
    assert body["username"] is None


def test_lookup_of_an_active_account_says_only_that_it_is_active(app, client):
    uid = _inactive_user(app, status="active", username="chosen-by-me", password="Original1!")
    res = client.get(f"/api/app/register/user/{uid}?token={_token(app, uid)}")
    assert res.status_code == 200
    assert res.get_json() == {"isActive": True}


# ---------------------------------------------------------------------------
# rules 1, 6, 7 — activation itself
# ---------------------------------------------------------------------------

def test_activate_with_the_token(app, client):
    uid = _inactive_user(app)
    res = client.post(
        f"/api/app/activate/user/{uid}",
        json={"token": _token(app, uid), "password": "NewPass1!", "name": "Updated Name",
              "username": "bruno"},
    )
    assert res.status_code == 200 and res.get_json() == {"success": True}
    after = _fresh(app, uid)
    assert after["status"] == "active"
    assert after["name"] == "Updated Name" and after["username"] == "bruno"
    assert after["password"] and after["password"] != "NewPass1!"  # stored hashed


def test_only_an_inactive_account_can_be_activated(app, client):
    uid = _inactive_user(app, status="active", username="chosen-by-me", password="Original1!")
    before = _fresh(app, uid)["password"]
    res = client.post(
        f"/api/app/activate/user/{uid}",
        json={"token": _token(app, uid), "password": "Other1!"},
    )
    assert res.status_code == 410
    assert _fresh(app, uid)["password"] == before

    # A disabled account is not inactive either.
    did = _inactive_user(app, status="disabled", username="pending-d", email="d@example.com", password="Original1!")
    res = client.post(f"/api/app/activate/user/{did}", json={"token": _token(app, did), "password": "Other1!"})
    assert res.status_code == 410


def test_activation_writes_only_the_five_fields(app, client):
    uid = _inactive_user(app)
    res = client.post(
        f"/api/app/activate/user/{uid}",
        json={"token": _token(app, uid), "password": "NewPass1!", "username": "bruno",
              "status": "disabled", "language": "en", "is_superadmin": True},
    )
    assert res.status_code == 200
    after = _fresh(app, uid)
    assert after["status"] == "active"
    assert after["username"] == "bruno"
    assert after["language"] == "pt"
    assert after["is_superadmin"] is not True


# ---------------------------------------------------------------------------
# rule 3 — the owning coach's roster carries the secret while inactive
# ---------------------------------------------------------------------------

def test_the_roster_carries_the_secret_until_activation(app, coach_id):
    from padel_app.models import Coach, Player
    from padel_app.services.player_service import add_player_service, get_coach_players_list
    from padel_app.services.user_service import activate_user_service
    from padel_app.tools.activation_token import activation_token_for

    with app.app_context():
        info = add_player_service({"coachId": coach_id, "name": "Bruno Roster"})
        player = Player.query.get(info["playerId"])
        expected = activation_token_for(player.user)
        assert info["activationToken"] == expected

        roster = get_coach_players_list(Coach.query.get(coach_id))
        row = next(r for r in roster if r["playerId"] == player.id)
        assert row["activationToken"] == expected
        assert player.coach_player_info(coach_id)["activationToken"] == expected

        activate_user_service(player.user_id, {"password": "NewPass1!", "username": "bruno-roster"}, token=expected)
        db.session.commit()

        roster = get_coach_players_list(Coach.query.get(coach_id))
        row = next(r for r in roster if r["playerId"] == player.id)
        assert row["activationToken"] is None
        assert Player.query.get(player.id).coach_player_info(coach_id)["activationToken"] is None
