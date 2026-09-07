"""
messaging.direct-by-username — a student opens a conversation with another
student by exact username (decision 2026-09-06, item 5). One test per
acceptance criterion of `.specflow/specs/messaging/direct-by-username.spec.md`.
"""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

USERNAME_404 = {"error": "No user with that username"}


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def people(app):
    """Students ana, bruno, carla (carla has blocked ana), dora (inactive); coach maria."""
    from padel_app.models import User, BlockedUser
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player

    with app.app_context():
        users = {
            name: User(name=name.title(), username=name, password="x", status=status)
            for name, status in [
                ("ana", "active"),
                ("bruno", "active"),
                ("carla", "active"),
                ("dora", "inactive"),
                ("maria", "active"),
            ]
        }
        db.session.add_all(users.values())
        db.session.flush()
        for name in ("ana", "bruno", "carla", "dora"):
            db.session.add(Player(user_id=users[name].id))
        db.session.add(Coach(user_id=users["maria"].id))
        db.session.add(BlockedUser(blocker_id=users["carla"].id, blocked_id=users["ana"].id))
        db.session.commit()
        return {name: u.id for name, u in users.items()}


def _post(client, app, user_id, body):
    return client.post("/api/app/conversation", json=body, headers=_auth_header(app, user_id))


def _conversation_count(app):
    from padel_app.models import Conversation

    with app.app_context():
        return Conversation.query.count()


def test_student_starts_a_conversation_by_exact_username(client, app, people):
    from padel_app.models import Conversation, ConversationParticipant

    resp = _post(client, app, people["ana"], {"otherUsername": "Bruno"})  # case-insensitive
    assert resp.status_code == 201, resp.data

    expected_key = ",".join(map(str, sorted([people["ana"], people["bruno"]])))
    with app.app_context():
        conv = Conversation.query.filter_by(participant_key=expected_key).one()
        assert ConversationParticipant.query.filter_by(conversation_id=conv.id).count() == 2

    listed = client.get("/api/app/conversations", headers=_auth_header(app, people["bruno"]))
    assert listed.status_code == 200
    ids = [c["id"] for c in listed.get_json()["conversations"]]
    assert conv.id in ids


@pytest.mark.parametrize("username", ["nobody", "maria", "ana", "carla", "dora"])
def test_unknown_coach_self_blocked_and_inactive_usernames_are_indistinguishable(
    client, app, people, username
):
    before = _conversation_count(app)
    resp = _post(client, app, people["ana"], {"otherUsername": username})
    assert resp.status_code == 404
    assert resp.get_json() == USERNAME_404
    assert _conversation_count(app) == before


def test_callers_own_block_is_a_403(client, app, people):
    from padel_app.models import BlockedUser

    with app.app_context():
        db.session.add(BlockedUser(blocker_id=people["ana"], blocked_id=people["bruno"]))
        db.session.commit()

    resp = _post(client, app, people["ana"], {"otherUsername": "bruno"})
    assert resp.status_code == 403


def test_coach_cannot_use_the_username_path(client, app, people):
    resp = _post(client, app, people["maria"], {"otherUsername": "ana"})
    assert resp.status_code == 400


def test_both_keys_at_once_is_rejected(client, app, people):
    resp = _post(
        client,
        app,
        people["ana"],
        {"otherUsername": "bruno", "otherParticipants": [people["bruno"]]},
    )
    assert resp.status_code == 400
    assert _conversation_count(app) == 0


def test_username_path_is_idempotent_like_the_participant_path(client, app, people):
    first = _post(client, app, people["ana"], {"otherUsername": "bruno"})
    second = _post(client, app, people["bruno"], {"otherUsername": "ANA"})
    assert first.status_code == 201 and second.status_code == 201
    assert first.get_json()["id"] == second.get_json()["id"]
    assert _conversation_count(app) == 1
