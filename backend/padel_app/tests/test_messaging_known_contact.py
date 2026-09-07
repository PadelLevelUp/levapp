"""
messaging.block-and-report rule 7 — `isKnownContact` on the conversation detail
payload, which drives the unknown-sender banner. One test per acceptance
criterion of `.specflow/specs/messaging/block-and-report.spec.md` that touches
the flag, plus the group and shared-club cases the rule names.
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
def people(app):
    """
    Students ana and bruno share nothing. Coach maria has ana on her roster
    (coach_in_player) and belongs to club X; student carla is in club X only
    (no roster row with maria). Student dora is in club X too.
    """
    from padel_app.models import User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.models.clubs import Club
    from padel_app.models.Association_CoachClub import Association_CoachClub
    from padel_app.models.Association_PlayerClub import Association_PlayerClub
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer

    with app.app_context():
        users = {
            name: User(name=name.title(), username=f"kc_{name}", password="x", status="active")
            for name in ("ana", "bruno", "carla", "dora", "maria")
        }
        db.session.add_all(users.values())
        db.session.flush()
        players = {n: Player(user_id=users[n].id) for n in ("ana", "bruno", "carla", "dora")}
        db.session.add_all(players.values())
        maria = Coach(user_id=users["maria"].id, approval_status="approved")
        db.session.add(maria)
        db.session.flush()
        club = Club(name="Club X", description="x", location="x")
        db.session.add(club)
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=maria.id, club_id=club.id))
        db.session.add(Association_PlayerClub(player_id=players["carla"].id, club_id=club.id))
        db.session.add(Association_PlayerClub(player_id=players["dora"].id, club_id=club.id))
        db.session.add(Association_CoachPlayer(coach_id=maria.id, player_id=players["ana"].id))
        db.session.commit()
        return {name: u.id for name, u in users.items()}


def _start_by_username(client, app, user_id, username):
    resp = client.post(
        "/api/app/conversation",
        json={"otherUsername": username},
        headers=_auth_header(app, user_id),
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)
    return resp.get_json()["id"]


def _start_by_ids(client, app, user_id, other_ids):
    resp = client.post(
        "/api/app/conversation",
        json={"otherParticipants": other_ids},
        headers=_auth_header(app, user_id),
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)
    return resp.get_json()["id"]


def _detail(client, app, user_id, conversation_id):
    resp = client.get(
        f"/api/app/conversation/{conversation_id}", headers=_auth_header(app, user_id)
    )
    assert resp.status_code == 200
    return resp.get_json()


def _send(client, app, user_id, conversation_id, text="hi"):
    resp = client.post(
        "/api/app/message",
        json={"conversationId": conversation_id, "text": text},
        headers=_auth_header(app, user_id),
    )
    assert resp.status_code in (200, 201), resp.get_data(as_text=True)


def test_unknown_sender_is_flagged(client, app, people):
    """Two students with no shared coach or club: the recipient sees false."""
    conv = _start_by_username(client, app, people["bruno"], "kc_ana")
    _send(client, app, people["bruno"], conv, "olá")

    assert _detail(client, app, people["ana"], conv)["isKnownContact"] is False
    # The sender has written in the thread, so for them it is known.
    assert _detail(client, app, people["bruno"], conv)["isKnownContact"] is True


def test_coach_is_always_a_known_contact(client, app, people):
    conv = _start_by_ids(client, app, people["maria"], [people["ana"]])
    assert _detail(client, app, people["ana"], conv)["isKnownContact"] is True
    assert _detail(client, app, people["maria"], conv)["isKnownContact"] is True


def test_replying_clears_the_banner(client, app, people):
    conv = _start_by_username(client, app, people["bruno"], "kc_ana")
    _send(client, app, people["bruno"], conv, "olá")
    assert _detail(client, app, people["ana"], conv)["isKnownContact"] is False

    _send(client, app, people["ana"], conv, "olá de volta")
    assert _detail(client, app, people["ana"], conv)["isKnownContact"] is True


def test_shared_club_is_known(client, app, people):
    """carla and dora share club X and nothing else."""
    conv = _start_by_username(client, app, people["carla"], "kc_dora")
    assert _detail(client, app, people["dora"], conv)["isKnownContact"] is True


def test_club_member_and_club_coach_are_known(client, app, people):
    """carla is in maria's club but not on her roster."""
    conv = _start_by_ids(client, app, people["maria"], [people["carla"]])
    assert _detail(client, app, people["carla"], conv)["isKnownContact"] is True


def test_group_conversation_is_always_known(client, app, people):
    """A group thread never carries the banner, even between strangers."""
    from padel_app.models import Conversation, ConversationParticipant

    with app.app_context():
        conv = Conversation(is_group=True, group_name="Strangers",
                            participant_key=Conversation.build_participant_key(
                                [people["ana"], people["bruno"], people["dora"]]))
        db.session.add(conv)
        db.session.flush()
        for uid in (people["ana"], people["bruno"], people["dora"]):
            db.session.add(ConversationParticipant(conversation_id=conv.id, user_id=uid))
        db.session.commit()
        conv_id = conv.id

    assert _detail(client, app, people["ana"], conv_id)["isKnownContact"] is True


def test_deleted_message_does_not_count_as_a_reply(client, app, people):
    conv = _start_by_username(client, app, people["bruno"], "kc_ana")
    _send(client, app, people["bruno"], conv, "olá")
    resp = client.post(
        "/api/app/message",
        json={"conversationId": conv, "text": "oops"},
        headers=_auth_header(app, people["ana"]),
    )
    msg_id = resp.get_json()["id"]
    del_resp = client.delete(f"/api/app/message/{msg_id}", headers=_auth_header(app, people["ana"]))
    assert del_resp.status_code in (200, 204)
    assert _detail(client, app, people["ana"], conv)["isKnownContact"] is False
