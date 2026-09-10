"""PAD-260 / B-049 — auth.account-profiles: an account has at most one player
profile and one coach profile, a profile never outlives its account, and the
generic editor does not hard-delete users.

SQLite does not enforce foreign keys here, so ON DELETE CASCADE itself is
proven in the scratch-Postgres dry run; these tests pin the schema that
declares it, the uniqueness and NOT NULL the database enforces, and the
refusal paths.
"""
import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy.exc import IntegrityError

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _user(app, username, **fields):
    from padel_app.models import User

    fields.setdefault("status", "active")
    with app.app_context():
        user = User(name=username, username=username, password="x", **fields)
        db.session.add(user)
        db.session.commit()
        return user.id


def _profile_model(profile):
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player

    return Player if profile == "player" else Coach


# ── rule 1 ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("profile", ["player", "coach"])
def test_a_user_has_at_most_one_profile_of_each_kind(app, profile):
    model = _profile_model(profile)
    user_id = _user(app, f"one_{profile}")
    with app.app_context():
        db.session.add(model(user_id=user_id))
        db.session.commit()
        db.session.add(model(user_id=user_id))
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()


@pytest.mark.parametrize("profile", ["player", "coach"])
def test_a_profile_always_has_an_account(app, profile):
    model = _profile_model(profile)
    with app.app_context():
        db.session.add(model(user_id=None))
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()


@pytest.mark.parametrize("table", ["players", "coaches"])
def test_the_schema_declares_cascade_unique_and_not_null(app, table):
    with app.app_context():
        column = db.metadata.tables[table].c.user_id
        assert column.nullable is False
        assert column.unique is True
        (foreign_key,) = list(column.foreign_keys)
        assert foreign_key.column.table.name == "users"
        assert foreign_key.ondelete == "CASCADE"


def test_the_user_relationships_leave_deletes_to_the_database(app):
    from padel_app.models import User

    assert User.player.property.passive_deletes is True
    assert User.coach.property.passive_deletes is True


# ── rule 3 ───────────────────────────────────────────────────────────────────

def test_the_generic_editor_will_not_delete_a_user(app, client):
    from padel_app.models import User

    headers = _auth(app, _user(app, "root", is_superadmin=True))
    victim = _user(app, "victim")

    res = client.delete(f"/api/editor/user/{victim}", headers=headers)
    assert res.status_code == 409, res.get_data(as_text=True)
    assert "account deletion" in res.get_data(as_text=True).lower()
    res = client.post(f"/api/delete/user/{victim}", headers=headers)
    assert res.status_code == 409, res.get_data(as_text=True)
    with app.app_context():
        assert db.session.get(User, victim) is not None


def test_the_editor_still_deletes_other_rows(app, client):
    from padel_app.models import Club

    headers = _auth(app, _user(app, "root", is_superadmin=True))
    with app.app_context():
        club = Club(name="Gone Club", description="d", location="l")
        db.session.add(club)
        db.session.commit()
        club_id = club.id
    assert client.delete(f"/api/editor/club/{club_id}", headers=headers).status_code == 200
    with app.app_context():
        assert db.session.get(Club, club_id) is None


def test_removing_a_never_activated_player_still_deletes_the_placeholder_account(app):
    """players.remove: the one domain path that removes a placeholder account."""
    from padel_app.models import Association_CoachPlayer, User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.services.player_service import remove_player_service

    with app.app_context():
        coach_user = User(name="Coach", username="rm_coach", password="x", status="active")
        placeholder = User(name="Pending Kid", username="pending-0123456789abcdef", status="inactive")
        db.session.add_all([coach_user, placeholder])
        db.session.flush()
        coach = Coach(user_id=coach_user.id)
        player = Player(user_id=placeholder.id)
        db.session.add_all([coach, player])
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=player.id))
        db.session.commit()
        coach_id, player_id, placeholder_id = coach.id, player.id, placeholder.id

    with app.app_context():
        _, status = remove_player_service({"coachId": coach_id, "playerId": player_id})
        assert status == 200
    with app.app_context():
        assert db.session.get(Player, player_id) is None
        assert db.session.get(User, placeholder_id) is None
