"""PAD-799 (B-724) — usernames are case-insensitive and stored lowercase (auth.register rule 2a).

A username a person CHOOSES (sign-up, activation, a player invitation, a coach invitation) is
trimmed and lowercased before it is validated, checked and saved, whatever case an older client
sends; "already taken" ignores case.

A username a person LOOKS UP (sign-in, the availability check, messaging by username, a claim by
username) resolves in three steps: the exact spelling first, else the one account whose username
matches ignoring case, else none. Until the migration lowercases the stored usernames (it refuses
while two accounts differ only by case), each account of such a pair keeps signing in with its own
spelling, and a spelling that matches neither exactly finds nobody.

Every test here is OLD-RED on staging 68bcf70b4 unless marked PIN (green before and after).
"""
import pytest
from flask_jwt_extended import create_access_token
from werkzeug.security import generate_password_hash

from padel_app.sql_db import db

PASSWORD = "Segura123"


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _user(app, username, *, player=False):
    from padel_app.models import Player, User

    with app.app_context():
        user = User(name=f"User {username}", username=username, password=generate_password_hash(PASSWORD),
                    status="active", email=f"u{abs(hash(username))}@example.com")
        db.session.add(user)
        db.session.flush()
        if player:
            db.session.add(Player(user_id=user.id))
        db.session.commit()
        return user.id


def _stored(app, user_id):
    from padel_app.models import User

    with app.app_context():
        return db.session.get(User, user_id).username


def _register(client, username, email="rui799@example.com"):
    return client.post("/api/auth/register", json={
        "role": "coach", "name": "Rui Costa", "username": username, "email": email,
        "password": PASSWORD, "birthDate": "2000-01-01", "country": "PT",
    })


def _login(client, username):
    return client.post("/api/auth/login", json={"username": username, "password": PASSWORD})


def _signed_in_id(app, res):
    from flask_jwt_extended import decode_token

    assert res.status_code == 200, res.get_json()
    with app.app_context():
        return int(decode_token(res.get_json()["accessToken"])["sub"])


# ── choosing a username ───────────────────────────────────────────────────────────────────────

@pytest.mark.criterion("AUTH-REGISTER-1")
def test_a_mixed_case_sign_up_is_saved_lowercase(client, app):
    from padel_app.models import User

    res = _register(client, "  Bernardo.Silva ")
    assert res.status_code == 201, res.get_json()
    with app.app_context():
        assert User.query.filter_by(email="rui799@example.com").one().username == "bernardo.silva"


@pytest.mark.parametrize("typed", ["Bernardo", "BERNARDO", "bernardo"])
@pytest.mark.criterion("AUTH-REGISTER-2")
def test_a_sign_up_differing_only_by_case_is_taken(client, app, typed):
    _user(app, "bernardo")
    res = _register(client, typed)
    assert res.status_code == 409, res.get_json()
    assert res.get_json()["field"] == "username"


def test_the_availability_check_ignores_case(client, app):
    uid = _user(app, "bernardo")
    with app.app_context():
        token = create_access_token(identity=str(uid))
    res = client.post("/api/app/check_field_available", json={"model": "user", "field": "username", "value": "Bernardo"},
                      headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 409, res.get_json()


@pytest.mark.criterion("AUTH-REGISTER-2")
def test_activation_saves_the_chosen_username_lowercase_and_refuses_one_taken_by_case(client, app):
    from padel_app.tests.test_pad254_activation_token import _inactive_user
    from padel_app.tests.test_pad761_activation_email_taken import _activate

    _user(app, "bernardo")
    uid = _inactive_user(app)
    taken = _activate(client, app, uid, username="Bernardo")
    assert taken.status_code == 409, taken.get_json()

    ok = _activate(client, app, uid, username="Bruno.Activa")
    assert ok.status_code == 200, ok.get_json()
    assert _stored(app, uid) == "bruno.activa"


@pytest.mark.criterion("AUTH-REGISTER-2")
def test_a_player_invitation_saves_the_username_lowercase_and_refuses_one_taken_by_case(client, app):
    from padel_app.tests.test_player_invitation import _auth_header, make_coach

    user_id, coach_id = make_coach(app, username="inviter799")
    _user(app, "bernardo")
    token = client.post("/api/app/incomplete_player", json={"coachId": coach_id, "name": "Invited"},
                        headers=_auth_header(app, user_id)).get_json()["token"]
    url = f"/api/app/player-invitations/{token}/accept"
    taken = client.post(url, json={"birthDate": "1990-01-01", "username": "BERNARDO", "password": PASSWORD})
    assert taken.status_code == 409, taken.get_json()

    ok = client.post(url, json={"birthDate": "1990-01-01", "username": "Invited.Player", "password": PASSWORD})
    assert ok.status_code == 200, ok.get_json()
    assert _stored(app, _signed_in_id(app, ok)) == "invited.player"


@pytest.mark.criterion("AUTH-REGISTER-2")
def test_a_coach_invitation_saves_the_username_lowercase_and_refuses_one_taken_by_case(client, app):
    from padel_app.tests.test_coach_invitation import _make_coach_with_club, _make_invitation

    _, coach_id, club_id = _make_coach_with_club(app, username="inviter799c")
    _user(app, "bernardo")
    token = _make_invitation(app, club_id, coach_id)
    url = f"/api/app/coach-invitations/{token}/accept"
    body = {"birthDate": "1990-01-01", "name": "New Coach", "password": PASSWORD}
    taken = client.post(url, json={**body, "username": "Bernardo"})
    assert taken.status_code == 409, taken.get_json()

    ok = client.post(url, json={**body, "username": "New.Coach"})
    assert ok.status_code == 200, ok.get_json()
    assert _stored(app, _signed_in_id(app, ok)) == "new.coach"


# ── looking a username up ─────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("typed", ["Bernardo", "BERNARDO", " bernardo "])
@pytest.mark.criterion("AUTH-LOGIN-1")
def test_a_mixed_case_sign_in_finds_the_account(client, app, typed):
    uid = _user(app, "bernardo")
    res = _login(client, typed)
    assert res.status_code == 200, res.get_json()
    assert _signed_in_id(app, res) == uid


@pytest.mark.criterion("AUTH-LOGIN-1")
def test_a_stored_mixed_case_username_signs_in_in_any_case(client, app):
    """An account saved before PAD-799 with capitals ("Joana") signs in as "joana" too."""
    uid = _user(app, "Joana")
    res = _login(client, "joana")
    assert res.status_code == 200, res.get_json()
    assert _signed_in_id(app, res) == uid


@pytest.mark.criterion("AUTH-LOGIN-2")
def test_a_pair_differing_only_by_case_each_signs_into_its_own_account(client, app):
    """PIN (green before and after; the guard on the three-step lookup). Two accounts from before
    PAD-799 ("Bernardo" and "bernardo"): each spelling reaches its own
    account; a third spelling matches neither exactly and both ignoring case, so it finds nobody."""
    upper = _user(app, "Bernardo")
    lower = _user(app, "bernardo")

    assert _signed_in_id(app, _login(client, "Bernardo")) == upper
    assert _signed_in_id(app, _login(client, "bernardo")) == lower
    assert _login(client, "BERNARDO").status_code == 401


def test_messaging_by_username_finds_the_account_in_any_case_and_each_of_a_pair_by_its_spelling(app):
    from padel_app.models import User
    from padel_app.services.messaging_service import _resolve_direct_username

    caller = _user(app, "caller799")
    single = _user(app, "Joana")
    upper = _user(app, "Bernardo")
    lower = _user(app, "bernardo")
    with app.test_request_context():
        me = db.session.get(User, caller)
        assert _resolve_direct_username(me, "JOANA").id == single
        assert _resolve_direct_username(me, "Bernardo").id == upper
        assert _resolve_direct_username(me, "bernardo").id == lower


def test_a_claim_by_username_finds_each_of_a_pair_by_its_spelling(app):
    from padel_app.services.player_claim_service import _resolve_target_student

    upper = _user(app, "Bernardo", player=True)
    lower = _user(app, "bernardo", player=True)
    with app.test_request_context():
        assert _resolve_target_student("Bernardo").id == upper
        assert _resolve_target_student("bernardo").id == lower


@pytest.mark.criterion("AUTH-LOGIN-2")
def test_find_user_by_username_three_steps(app):
    from padel_app.tools.username_tools import find_user_by_username, normalize_username, username_taken

    single = _user(app, "Joana")
    upper = _user(app, "Bernardo")
    lower = _user(app, "bernardo")
    with app.app_context():
        assert normalize_username("  Bernardo.Silva ") == "bernardo.silva"
        assert find_user_by_username("joana").id == single
        assert find_user_by_username("Bernardo").id == upper
        assert find_user_by_username("bernardo").id == lower
        assert find_user_by_username("BERNARDO") is None
        assert find_user_by_username("nobody") is None
        assert username_taken("JOANA") and username_taken("BeRnArDo")
        assert not username_taken("Joana", exclude_user_id=single)
        assert not username_taken("new.name")


# ── the pending migration (migrations/pending/, out of the chain until the owner resolves the pairs) ──

def _migration():
    import importlib.util
    import pathlib

    path = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "pending" / "a7c3e9d1b799_pad799_lowercase_usernames.py"
    spec = importlib.util.spec_from_file_location("pad799_pending_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_migration_refuses_while_two_accounts_differ_only_by_case_and_names_their_ids(app):
    m = _migration()
    upper = _user(app, "Bernardo")
    lower = _user(app, "bernardo")
    odd = _user(app, "Has Space")
    _user(app, "Joana")
    with app.app_context():
        conn = db.session.connection()
        with pytest.raises(m.UsernameMigrationRefused) as refused:
            m.normalise(conn)
        db.session.rollback()
    message = str(refused.value)
    assert f"[{upper}, {lower}]" in message and f"[{odd}]" in message
    assert "Bernardo" not in message and "Joana" not in message, "ids only, never a username"
    assert _stored(app, upper) == "Bernardo", "nothing was written"


def test_once_resolved_the_migration_lowercases_adds_the_index_and_its_downgrade_restores(app):
    import sqlalchemy as sa
    from sqlalchemy.exc import IntegrityError

    m = _migration()
    joana = _user(app, "Joana")
    bernardo = _user(app, "bernardo")
    with app.app_context():
        conn = db.session.connection()
        assert m.normalise(conn) == 1
        db.session.commit()
    assert (_stored(app, joana), _stored(app, bernardo)) == ("joana", "bernardo")

    with app.app_context():
        with pytest.raises(IntegrityError):
            db.session.execute(sa.text(
                "INSERT INTO users (name, username, password, status, is_admin, is_superadmin) "
                "VALUES ('x', 'JOANA', 'x', 'active', false, false)"
            ))
            db.session.flush()
        db.session.rollback()
        assert m.restore(db.session.connection()) == 1
        db.session.commit()
    assert _stored(app, joana) == "Joana"
