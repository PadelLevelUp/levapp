"""players.join-token — coach QR / link a signed-in student redeems (PAD-212)."""
from datetime import timedelta

from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive


def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _make_user(app, username, *, email=None):
    from padel_app.models import User

    with app.app_context():
        user = User(
            name=username.title(),
            username=username,
            email=email,
            password="pw",
            status="active",
        )
        db.session.add(user)
        db.session.commit()
        return user.id


def _make_coach(app, username="maria", club_name="Padel Academy"):
    """An approved coach with one club; returns (user_id, coach_id, club_id)."""
    from padel_app.models import Association_CoachClub, Club, Coach

    user_id = _make_user(app, username, email=f"{username}@example.com")
    with app.app_context():
        coach = Coach(user_id=user_id, approval_status="approved")
        db.session.add(coach)
        db.session.flush()
        club = Club(name=club_name)
        db.session.add(club)
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club.id))
        db.session.commit()
        return user_id, coach.id, club.id


def _make_student(app, username="ana"):
    from padel_app.models import Player

    user_id = _make_user(app, username, email=f"{username}@example.com")
    with app.app_context():
        player = Player(user_id=user_id)
        db.session.add(player)
        db.session.commit()
        return user_id, player.id


def _mint(client, app, coach_user_id):
    res = client.post("/api/app/coach/join-token", headers=_auth(app, coach_user_id))
    assert res.status_code == 201, res.get_json()
    return res.get_json()


# --- Coach mints a token bound to their current club ----------------------

def test_coach_mints_a_token_bound_to_their_current_club(app, client):
    _jwt_secret(app)
    coach_user, coach_id, club_id = _make_coach(app)

    body = _mint(client, app, coach_user)

    assert body["clubName"] == "Padel Academy"
    assert body["url"].endswith(f"/join/coach/{body['token']}")
    assert body["path"] == f"/join/coach/{body['token']}"
    with app.app_context():
        from padel_app.models import CoachJoinToken

        row = CoachJoinToken.query.filter_by(token=body["token"]).one()
        assert row.is_active is True
        assert row.club_id == club_id
        assert row.coach_id == coach_id
        delta = row.expires_at - utcnow_naive()
        assert timedelta(days=6, hours=23) < delta <= timedelta(days=7)
    # rule 2: GET returns the same active token
    got = client.get("/api/app/coach/join-token", headers=_auth(app, coach_user))
    assert got.status_code == 200
    assert got.get_json()["token"] == body["token"]


def test_get_returns_null_when_no_active_token(app, client):
    _jwt_secret(app)
    coach_user, _, _ = _make_coach(app)
    got = client.get("/api/app/coach/join-token", headers=_auth(app, coach_user))
    assert got.status_code == 200
    assert got.get_json() is None


def test_coach_with_no_club_gets_409_not_500(app, client):
    from padel_app.models import Coach

    _jwt_secret(app)
    user_id = _make_user(app, "solo", email="solo@example.com")
    with app.app_context():
        db.session.add(Coach(user_id=user_id, approval_status="approved"))
        db.session.commit()
    res = client.post("/api/app/coach/join-token", headers=_auth(app, user_id))
    assert res.status_code == 409
    assert res.get_json()["error"] == "NO_CLUB"


def test_pending_coach_cannot_mint(app, client):
    from padel_app.models import Coach

    _jwt_secret(app)
    user_id = _make_user(app, "pend", email="pend@example.com")
    with app.app_context():
        db.session.add(Coach(user_id=user_id, approval_status="pending"))
        db.session.commit()
    res = client.post("/api/app/coach/join-token", headers=_auth(app, user_id))
    assert res.status_code == 403
    assert res.get_json()["error"] == "COACH_NOT_APPROVED"


# --- Rotating retires the previous token ----------------------------------

def test_rotating_retires_the_previous_token(app, client):
    _jwt_secret(app)
    coach_user, _, _ = _make_coach(app)
    t1 = _mint(client, app, coach_user)["token"]
    t2 = _mint(client, app, coach_user)["token"]
    assert t1 != t2

    assert client.get(f"/api/app/join-tokens/{t1}").status_code == 410
    assert client.get(f"/api/app/join-tokens/{t2}").status_code == 200
    with app.app_context():
        from padel_app.models import CoachJoinToken

        # rule 6: retired, never deleted
        assert CoachJoinToken.query.filter_by(token=t1).one().is_active is False
        assert CoachJoinToken.query.count() == 2


# --- Preview is public and reveals only coach and club --------------------

def test_preview_is_public_and_reveals_only_coach_and_club(app, client):
    _jwt_secret(app)
    coach_user, _, _ = _make_coach(app)
    token = _mint(client, app, coach_user)["token"]

    res = client.get(f"/api/app/join-tokens/{token}")
    assert res.status_code == 200
    body = res.get_json()
    assert body["coachName"] == "Maria"
    assert body["clubName"] == "Padel Academy"
    assert set(body.keys()) == {"coachName", "clubName", "clubLogoUrl"}


def test_unknown_token_is_404(app, client):
    assert client.get("/api/app/join-tokens/nope").status_code == 404


# --- Student joins the roster and the club --------------------------------

def test_student_joins_the_roster_and_the_club(app, client):
    from padel_app.models import (
        Association_CoachPlayer,
        Association_PlayerClub,
        CoachJoinToken,
    )

    _jwt_secret(app)
    coach_user, coach_id, club_id = _make_coach(app)
    student_user, player_id = _make_student(app)
    token = _mint(client, app, coach_user)["token"]

    res = client.post(
        f"/api/app/join-tokens/{token}/accept", headers=_auth(app, student_user)
    )
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert body["joined"] is True
    assert body["alreadyMember"] is False
    assert body["coachName"] == "Maria"
    assert body["clubName"] == "Padel Academy"
    with app.app_context():
        rel = Association_CoachPlayer.query.filter_by(
            coach_id=coach_id, player_id=player_id
        ).one()
        assert rel.level_id is None and rel.side is None and rel.notes is None
        assert (
            Association_PlayerClub.query.filter_by(
                player_id=player_id, club_id=club_id
            ).count()
            == 1
        )
        assert CoachJoinToken.query.filter_by(token=token).one().uses == 1


# --- Accept is idempotent --------------------------------------------------

def test_accept_is_idempotent(app, client):
    from padel_app.models import Association_CoachPlayer, Association_PlayerClub

    _jwt_secret(app)
    coach_user, coach_id, club_id = _make_coach(app)
    student_user, player_id = _make_student(app)
    token = _mint(client, app, coach_user)["token"]
    headers = _auth(app, student_user)

    first = client.post(f"/api/app/join-tokens/{token}/accept", headers=headers)
    second = client.post(f"/api/app/join-tokens/{token}/accept", headers=headers)
    assert first.status_code == 200 and second.status_code == 200
    assert second.get_json()["alreadyMember"] is True
    with app.app_context():
        assert (
            Association_CoachPlayer.query.filter_by(
                coach_id=coach_id, player_id=player_id
            ).count()
            == 1
        )
        assert (
            Association_PlayerClub.query.filter_by(
                player_id=player_id, club_id=club_id
            ).count()
            == 1
        )


# --- A coach account cannot join a roster ---------------------------------

def test_a_coach_account_cannot_join_a_roster(app, client):
    from padel_app.models import Association_CoachPlayer

    _jwt_secret(app)
    coach_user, _, _ = _make_coach(app)
    other_coach_user, _, _ = _make_coach(app, username="joao", club_name="Padel Norte")
    token = _mint(client, app, coach_user)["token"]

    res = client.post(
        f"/api/app/join-tokens/{token}/accept", headers=_auth(app, other_coach_user)
    )
    assert res.status_code == 403
    with app.app_context():
        assert Association_CoachPlayer.query.count() == 0


def test_accept_requires_a_session(app, client):
    _jwt_secret(app)
    coach_user, _, _ = _make_coach(app)
    token = _mint(client, app, coach_user)["token"]
    assert client.post(f"/api/app/join-tokens/{token}/accept").status_code == 401


# --- Expired token is 410 ---------------------------------------------------

def test_expired_token_is_410_and_flipped_inactive(app, client):
    from padel_app.models import CoachJoinToken

    _jwt_secret(app)
    coach_user, _, _ = _make_coach(app)
    student_user, _ = _make_student(app)
    token = _mint(client, app, coach_user)["token"]
    with app.app_context():
        row = CoachJoinToken.query.filter_by(token=token).one()
        row.expires_at = utcnow_naive() - timedelta(minutes=1)
        db.session.commit()

    assert client.get(f"/api/app/join-tokens/{token}").status_code == 410
    assert (
        client.post(
            f"/api/app/join-tokens/{token}/accept", headers=_auth(app, student_user)
        ).status_code
        == 410
    )
    with app.app_context():
        assert CoachJoinToken.query.filter_by(token=token).one().is_active is False
    # and the coach's GET no longer reports it
    got = client.get("/api/app/coach/join-token", headers=_auth(app, coach_user))
    assert got.get_json() is None


# --- Acting player comes from the JWT only ---------------------------------

def test_acting_player_comes_from_the_jwt_only(app, client):
    from padel_app.models import Association_CoachPlayer

    _jwt_secret(app)
    coach_user, coach_id, _ = _make_coach(app)
    ana_user, ana_player = _make_student(app, "ana")
    _, bruno_player = _make_student(app, "bruno")
    token = _mint(client, app, coach_user)["token"]

    res = client.post(
        f"/api/app/join-tokens/{token}/accept",
        headers=_auth(app, ana_user),
        json={"playerId": bruno_player},
    )
    assert res.status_code == 200
    with app.app_context():
        rows = Association_CoachPlayer.query.filter_by(coach_id=coach_id).all()
        assert [r.player_id for r in rows] == [ana_player]
