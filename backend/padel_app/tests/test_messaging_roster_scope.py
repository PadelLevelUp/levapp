"""
PAD-205 / B-020 — a coach may message any player on their own roster.

`_messageable_target_ids_for(coach)` used to read club membership
(`player_in_club`) only. Outside `seed/mock_data.py` no app path ever writes
that table — adding a player, importing one, or accepting an invitation
creates a `coach_in_player` roster row instead. So a coach could not message a
student they had added through the app.

The messageable set for a coach is now the UNION of the roster
(`coach_in_player`) and the players of the coach's clubs (`player_in_club`).
The student branch (any active coach) is unchanged.
"""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def roster_scenario(app):
    """
    Coach1 belongs to club A.

    - roster_player: on coach1's roster (`coach_in_player`), in NO club — the
      shape every in-app "add player" path produces.
    - club_player: in club A, NOT on coach1's roster — the seed-only shape.
    - stranger: neither on the roster nor in any of coach1's clubs.
    """
    from padel_app.models import User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.models.clubs import Club
    from padel_app.models.Association_CoachClub import Association_CoachClub
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.Association_PlayerClub import Association_PlayerClub

    with app.app_context():
        coach_user = User(
            name="Roster Coach", username="roster_coach", password="x", status="active"
        )
        roster_user = User(
            name="Roster Player", username="roster_player", password="x", status="active"
        )
        club_user = User(
            name="Club Player", username="roster_club_player", password="x", status="active"
        )
        stranger_user = User(
            name="Stranger", username="roster_stranger", password="x", status="active"
        )
        db.session.add_all([coach_user, roster_user, club_user, stranger_user])
        db.session.flush()

        coach = Coach(user_id=coach_user.id)
        roster_player = Player(user_id=roster_user.id)
        club_player = Player(user_id=club_user.id)
        stranger_player = Player(user_id=stranger_user.id)
        db.session.add_all([coach, roster_player, club_player, stranger_player])
        db.session.flush()

        club_a = Club(name="Roster Club A", description="a", location="x")
        db.session.add(club_a)
        db.session.flush()

        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club_a.id))
        # The in-app shape: a roster row and no club row at all.
        db.session.add(
            Association_CoachPlayer(coach_id=coach.id, player_id=roster_player.id)
        )
        # The seed shape: a club row and no roster row.
        db.session.add(
            Association_PlayerClub(player_id=club_player.id, club_id=club_a.id)
        )
        db.session.commit()

        return {
            "coach_user_id": coach_user.id,
            "roster_user_id": roster_user.id,
            "club_user_id": club_user.id,
            "stranger_user_id": stranger_user.id,
        }


def _create_conversation(client, app, user_id, other_user_id):
    return client.post(
        "/api/app/conversation",
        json={"otherParticipants": [other_user_id]},
        headers=_auth_header(app, user_id),
    )


def test_roster_only_player_is_messageable_by_their_coach(client, app, roster_scenario):
    resp = client.get(
        "/api/app/messageable-users",
        headers=_auth_header(app, roster_scenario["coach_user_id"]),
    )
    assert resp.status_code == 200
    ids = {u["id"] for u in resp.get_json()}
    assert roster_scenario["roster_user_id"] in ids


def test_coach_can_start_conversation_with_roster_only_player(
    client, app, roster_scenario
):
    resp = _create_conversation(
        client,
        app,
        roster_scenario["coach_user_id"],
        roster_scenario["roster_user_id"],
    )
    assert resp.status_code == 201


def test_club_player_without_roster_row_stays_messageable(client, app, roster_scenario):
    """The union keeps the old club behaviour — seeded data must not regress."""
    resp = client.get(
        "/api/app/messageable-users",
        headers=_auth_header(app, roster_scenario["coach_user_id"]),
    )
    ids = {u["id"] for u in resp.get_json()}
    assert roster_scenario["club_user_id"] in ids


def test_player_on_neither_roster_nor_club_is_not_messageable(
    client, app, roster_scenario
):
    resp = client.get(
        "/api/app/messageable-users",
        headers=_auth_header(app, roster_scenario["coach_user_id"]),
    )
    ids = {u["id"] for u in resp.get_json()}
    assert roster_scenario["stranger_user_id"] not in ids


def test_conversation_with_unrelated_player_is_still_403(client, app, roster_scenario):
    resp = _create_conversation(
        client,
        app,
        roster_scenario["coach_user_id"],
        roster_scenario["stranger_user_id"],
    )
    assert resp.status_code == 403


def test_messageable_payload_carries_only_picker_fields(client, app, roster_scenario):
    """PAD-205 must not widen the picker payload (data-model audit H3)."""
    resp = client.get(
        "/api/app/messageable-users",
        headers=_auth_header(app, roster_scenario["coach_user_id"]),
    )
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload, "expected at least one messageable user"
    for entry in payload:
        assert set(entry.keys()) == {
            "id",
            "name",
            "username",
            "email",
            "phone",
            "isActive",
            "language",
            "avatarUrl",
            "abbreviation",
        }
