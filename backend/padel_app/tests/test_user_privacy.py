"""PAD-227 / B-031 — contact details never reach a caller who is not the
owner or the owner's coach (messaging.conversations rule 15). The activation
lookup is governed by auth.activate rule 4 (PAD-254): tokened, tested there."""
import pytest
from flask_jwt_extended import create_access_token
from werkzeug.security import generate_password_hash

from padel_app.sql_db import db

PUBLIC_KEYS = {"id", "name", "username", "role", "avatarUrl", "abbreviation", "isActive"}
PRIVATE_KEYS = {"email", "phone", "language"}


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture
def world(app):
    """Coach C (club, roster with student S and another student T), plus an
    inactive coach-created player I. Returns ids."""
    from padel_app.models import User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.models.clubs import Club
    from padel_app.models.Association_CoachClub import Association_CoachClub
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.Association_PlayerClub import Association_PlayerClub

    with app.app_context():
        def user(name, username, email, phone, status="active"):
            u = User(name=name, username=username, email=email, phone=phone,
                     password=generate_password_hash("Segura123"), status=status)
            db.session.add(u)
            db.session.flush()
            return u

        cu = user("Coach Carla", "carla", "carla@example.com", "911111111")
        club = Club(name="Clube", description="c", location="x")
        db.session.add(club)
        db.session.flush()
        coach = Coach(user_id=cu.id)
        db.session.add(coach)
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club.id))

        su = user("Student Sara", "sara", "sara@example.com", "922222222")
        tu = user("Student Tomas", "tomas", "tomas@example.com", "933333333")
        iu = user("Inactive Ines", "ines", "ines@example.com", "944444444", status="inactive")
        players = []
        for u in (su, tu, iu):
            p = Player(user_id=u.id)
            db.session.add(p)
            db.session.flush()
            db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=p.id))
            db.session.add(Association_PlayerClub(player_id=p.id, club_id=club.id))
            players.append(p)
        db.session.commit()
        return {"coach_user": cu.id, "coach": coach.id, "student_user": su.id,
                "other_user": tu.id, "inactive_user": iu.id}


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _assert_public(entries):
    assert entries, "expected at least one entry"
    for e in entries:
        assert PUBLIC_KEYS <= set(e), e
        assert not (PRIVATE_KEYS & set(e)), f"private key leaked: {e}"


def test_student_never_receives_another_users_contact_details(client, app, world):
    hdr = _auth(app, world["student_user"])
    res = client.get("/api/app/messageable-users", headers=hdr)
    assert res.status_code == 200
    _assert_public(res.get_json())
    res = client.get("/api/app/users", headers=hdr)
    assert res.status_code == 200
    body = res.get_json()
    _assert_public(body)
    assert any(e["username"] == "tomas" for e in body)  # listed, but only publicly


def test_coach_lists_are_public_but_roster_keeps_contact_details(client, app, world):
    hdr = _auth(app, world["coach_user"])
    for path in ("/api/app/messageable-users", "/api/app/users"):
        res = client.get(path, headers=hdr)
        assert res.status_code == 200, path
        _assert_public(res.get_json())
    res = client.get("/api/app/players", headers=hdr)
    assert res.status_code == 200
    roster = {p["name"]: p for p in res.get_json()}
    assert roster["Student Sara"]["email"] == "sara@example.com"
    assert roster["Student Sara"]["phone"] == "922222222"


def test_coach_own_profile_keeps_contact_details(client, app, world):
    res = client.get("/api/app/coach", headers=_auth(app, world["coach_user"]))
    assert res.status_code == 200
    assert res.get_json()["user"]["email"] == "carla@example.com"


def test_public_shape_has_role(client, app, world):
    res = client.get("/api/app/messageable-users", headers=_auth(app, world["student_user"]))
    roles = {e["username"]: e["role"] for e in res.get_json()}
    assert roles.get("carla") == "coach"
