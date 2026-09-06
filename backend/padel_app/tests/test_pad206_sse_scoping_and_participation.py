"""
PAD-206 — SSE fan-out is scoped to named recipients (B-004) and every message
operation requires the caller to be a participant of the conversation (B-026).

Two halves of the same audit finding (2026-09-02 data-model audit, H2):

* `padel_app.realtime` kept an anonymous `list[queue.Queue]`, so `publish()`
  pushed every private message, edit, delete and reaction to every connected
  client. Clients filtered by conversation id for *rendering* — the payload was
  already on the wire. Pinned here by rules 7-9 of `messaging.sse-realtime`.
* `create_message_service` and `toggle_reaction_service` never checked the
  caller was a participant; they trusted the `conversationId` in the request
  body. Pinned here by rule 10 of `messaging.messages`.

`publish` is exercised for real (it is pure in-memory queues, no I/O); the push
helpers are patched because they are the I/O.
"""
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture(autouse=True)
def _clean_realtime_registry():
    """The subscriber registry is module-global; never leak between tests."""
    from padel_app import realtime

    realtime._subscribers.clear()
    yield
    realtime._subscribers.clear()


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def trio(app):
    """Coach + player who share a conversation, and an outsider who does not.

    The outsider is a coach so that the messageable-user scope rules can never
    be what makes a request fail — the only thing standing between them and the
    conversation is participation.
    """
    from padel_app.models import User, Conversation, ConversationParticipant
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player

    with app.app_context():
        coach_user = User(name="Ines Coach", username="pad206_coach", password="x", status="active")
        player_user = User(name="Rui Player", username="pad206_player", password="x", status="active")
        outsider_user = User(name="Nosy Coach", username="pad206_outsider", password="x", status="active")
        db.session.add_all([coach_user, player_user, outsider_user])
        db.session.flush()

        db.session.add_all([
            Coach(user_id=coach_user.id),
            Coach(user_id=outsider_user.id),
            Player(user_id=player_user.id),
        ])
        db.session.flush()

        # R-017: the participant key is the lookup key, always built from the
        # sorted participant ids — never hand-assembled.
        conversation = Conversation(
            participant_key=Conversation.build_participant_key(
                [coach_user.id, player_user.id]
            )
        )
        db.session.add(conversation)
        db.session.flush()
        db.session.add_all([
            ConversationParticipant(conversation_id=conversation.id, user_id=coach_user.id),
            ConversationParticipant(conversation_id=conversation.id, user_id=player_user.id),
        ])
        db.session.commit()

        return {
            "coach_user_id": coach_user.id,
            "player_user_id": player_user.id,
            "outsider_user_id": outsider_user.id,
            "conversation_id": conversation.id,
        }


def _send(app, trio, sender_user_id, text="hello"):
    """Send a message as a participant, with push I/O patched out."""
    from padel_app.services.messaging_service import create_message_service

    with patch("padel_app.services.messaging_service.send_push_notification"), \
         patch("padel_app.services.messaging_service.send_expo_push_to_user"):
        return create_message_service(
            {"conversationId": trio["conversation_id"], "text": text},
            sender_user_id,
        )


# ---------------------------------------------------------------------------
# B-004 — publish() delivers only to the user ids it was given
# ---------------------------------------------------------------------------

def test_publish_delivers_only_to_the_named_recipients(app):
    """messaging.sse-realtime rule 8 — an event names its recipients."""
    from padel_app import realtime

    with app.app_context():
        addressed = realtime.subscribe(1)
        bystander = realtime.subscribe(2)
        try:
            realtime.publish({"type": "message_created", "payload": {"id": 7}}, [1])
        finally:
            realtime.unsubscribe(1, addressed)
            realtime.unsubscribe(2, bystander)

        assert addressed.get_nowait() == {"type": "message_created", "payload": {"id": 7}}
        assert bystander.empty(), "an unaddressed subscriber received someone else's event"


def test_publish_without_recipients_is_a_type_error(app):
    """The pre-B-004 broadcast must not be reachable by omitting the argument."""
    from padel_app import realtime

    with app.app_context():
        listener = realtime.subscribe(1)
        try:
            with pytest.raises(TypeError):
                realtime.publish({"type": "message_created", "payload": {}})
        finally:
            realtime.unsubscribe(1, listener)

        assert listener.empty()


def test_every_queue_of_the_same_user_is_served(app):
    """Two tabs, or web + phone: one user id, several queues."""
    from padel_app import realtime

    with app.app_context():
        tab_one = realtime.subscribe(1)
        tab_two = realtime.subscribe(1)
        try:
            realtime.publish({"type": "message_edited", "payload": {"id": 9}}, [1])
        finally:
            realtime.unsubscribe(1, tab_one)
            realtime.unsubscribe(1, tab_two)

        assert not tab_one.empty()
        assert not tab_two.empty()


def test_unsubscribe_removes_only_that_queue(app):
    from padel_app import realtime

    with app.app_context():
        keep = realtime.subscribe(1)
        drop = realtime.subscribe(1)
        realtime.unsubscribe(1, drop)
        try:
            realtime.publish({"type": "message_edited", "payload": {}}, [1])
        finally:
            realtime.unsubscribe(1, keep)

        assert not keep.empty()
        assert drop.empty()


def test_message_created_reaches_participants_only(app, trio):
    """messaging.messages criterion: an SSE event only reaches the participants."""
    from padel_app import realtime

    with app.app_context():
        coach_q = realtime.subscribe(trio["coach_user_id"])
        player_q = realtime.subscribe(trio["player_user_id"])
        outsider_q = realtime.subscribe(trio["outsider_user_id"])
        try:
            _send(app, trio, trio["coach_user_id"], "private")
        finally:
            realtime.unsubscribe(trio["coach_user_id"], coach_q)
            realtime.unsubscribe(trio["player_user_id"], player_q)
            realtime.unsubscribe(trio["outsider_user_id"], outsider_q)

        assert coach_q.get_nowait()["type"] == "message_created"
        assert player_q.get_nowait()["type"] == "message_created"
        assert outsider_q.empty(), "a non-participant received a private message over SSE"


def test_edit_delete_and_reaction_reach_participants_only(app, trio):
    from padel_app import realtime
    from padel_app.services.messaging_service import (
        delete_message_service,
        edit_message_service,
        toggle_reaction_service,
    )

    with app.app_context():
        message = _send(app, trio, trio["coach_user_id"], "first")
        message_id = message.id

        coach_q = realtime.subscribe(trio["coach_user_id"])
        player_q = realtime.subscribe(trio["player_user_id"])
        outsider_q = realtime.subscribe(trio["outsider_user_id"])
        try:
            edit_message_service(message_id, "edited", trio["coach_user_id"])
            toggle_reaction_service(message_id, "👍", trio["player_user_id"])
            delete_message_service(message_id, trio["coach_user_id"])
        finally:
            realtime.unsubscribe(trio["coach_user_id"], coach_q)
            realtime.unsubscribe(trio["player_user_id"], player_q)
            realtime.unsubscribe(trio["outsider_user_id"], outsider_q)

        assert [coach_q.get_nowait()["type"] for _ in range(3)] == [
            "message_edited", "message_reaction", "message_deleted",
        ]
        assert player_q.qsize() == 3
        assert outsider_q.empty(), "a non-participant saw edits/reactions/deletes"


def test_event_shape_is_unchanged(app, trio):
    """Web and iOS parse `{type, payload}`; scoping must not reshape the wire."""
    from padel_app import realtime

    with app.app_context():
        coach_q = realtime.subscribe(trio["coach_user_id"])
        try:
            _send(app, trio, trio["coach_user_id"], "shape")
        finally:
            realtime.unsubscribe(trio["coach_user_id"], coach_q)

        event = coach_q.get_nowait()
        assert set(event) == {"type", "payload"}
        assert event["payload"]["content"] == "shape"


# ---------------------------------------------------------------------------
# B-026 — every message operation requires participation
# ---------------------------------------------------------------------------

def test_non_participant_cannot_send_message(client, app, trio):
    """messaging.messages rule 10 — 403, no row, no event, no push."""
    from padel_app.models import Message

    with patch("padel_app.services.messaging_service.publish") as mock_publish, \
         patch("padel_app.services.messaging_service.send_push_notification") as mock_push, \
         patch("padel_app.services.messaging_service.send_expo_push_to_user") as mock_expo:
        resp = client.post(
            "/api/app/message",
            json={"conversationId": trio["conversation_id"], "text": "I do not belong here"},
            headers=_auth_header(app, trio["outsider_user_id"]),
        )

    assert resp.status_code == 403
    mock_publish.assert_not_called()
    mock_push.assert_not_called()
    mock_expo.assert_not_called()

    with app.app_context():
        assert Message.query.filter_by(conversation_id=trio["conversation_id"]).count() == 0


def test_participant_can_still_send_message(client, app, trio):
    """The guard must not lock out the people the conversation is for."""
    with patch("padel_app.services.messaging_service.send_push_notification"), \
         patch("padel_app.services.messaging_service.send_expo_push_to_user"):
        resp = client.post(
            "/api/app/message",
            json={"conversationId": trio["conversation_id"], "text": "hi"},
            headers=_auth_header(app, trio["coach_user_id"]),
        )

    assert resp.status_code == 201
    assert resp.get_json()["content"] == "hi"


def test_non_participant_cannot_react(client, app, trio):
    """messaging.messages rule 10 / messaging.reactions rule 6."""
    from padel_app.models import MessageReaction

    with app.app_context():
        message_id = _send(app, trio, trio["coach_user_id"], "react to me").id

    resp = client.post(
        f"/api/app/message/{message_id}/reaction",
        json={"emoji": "👍"},
        headers=_auth_header(app, trio["outsider_user_id"]),
    )

    assert resp.status_code == 403
    with app.app_context():
        assert MessageReaction.query.filter_by(message_id=message_id).count() == 0


def test_participant_can_still_react(client, app, trio):
    from padel_app.models import MessageReaction

    with app.app_context():
        message_id = _send(app, trio, trio["coach_user_id"], "react to me").id

    resp = client.post(
        f"/api/app/message/{message_id}/reaction",
        json={"emoji": "👍"},
        headers=_auth_header(app, trio["player_user_id"]),
    )

    assert resp.status_code == 200
    with app.app_context():
        assert MessageReaction.query.filter_by(message_id=message_id).count() == 1


def test_non_participant_cannot_edit_or_delete(client, app, trio):
    """Already excluded by the sender check — pinned so it stays true under rule 10."""
    with app.app_context():
        message_id = _send(app, trio, trio["coach_user_id"], "mine").id

    headers = _auth_header(app, trio["outsider_user_id"])
    assert client.put(
        f"/api/app/message/{message_id}", json={"text": "hijacked"}, headers=headers
    ).status_code == 403
    assert client.delete(f"/api/app/message/{message_id}", headers=headers).status_code == 403


def test_send_to_a_conversation_that_does_not_exist_is_refused(client, app, trio):
    """A body-supplied conversation id is never proof of access."""
    resp = client.post(
        "/api/app/message",
        json={"conversationId": 999999, "text": "nowhere"},
        headers=_auth_header(app, trio["coach_user_id"]),
    )
    assert resp.status_code in (403, 404)
