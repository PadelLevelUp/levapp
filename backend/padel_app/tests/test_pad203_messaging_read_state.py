"""
PAD-203 / B-022 — messaging read state at second boundaries, and one malformed
conversation taking the whole list down.

Three defects, one ticket. Each has its own section below.

**1. `sent_at` was truncated to whole seconds; `last_read_at` was not.**
`create_message_service` built its payload with
`utcnow_naive().strftime("%Y-%m-%dT%H:%M:%S")` — microseconds discarded — while
`mark_conversation_read_service` writes `utcnow_naive()` intact. Unread is
`sent_at > last_read_at` (messaging.read-tracking rule 3), so a message sent in
the same wall-clock second as a mark-read was stamped at or *before* the read
instant and was born already-read. Covered spec: messaging.messages rule 9a.

**2. `serialize_conversation` used `next(...)` with no default,** twice — once
for the counterpart, once for the caller's own row. A conversation with a single
participant row raised `StopIteration` out of the list comprehension in
`GET /api/app/conversations` and returned a 500 for the caller's *entire* list,
on every request, forever. Covered spec: messaging.conversations rule 10.

**3. `create_conversation_service` committed the conversation, then each
participant separately** (the base mixin's `create()` is add-then-commit), so a
failure part-way left exactly the malformed row defect 2 chokes on. Covered
spec: messaging.conversations rule 9.

Defects 2 and 3 are one failure mode with a producer and a consumer, which is
why they are fixed together: rule 9 stops new ones being made, rule 10 survives
the ones already in the database (and the ones a hard-deleted user will keep
making).

R-008: no `datetime` is mocked here. `create_message_service` and
`mark_conversation_read_service` take an injected `now=`, which is how the
1-millisecond case is made deterministic.
"""
from datetime import datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


BASE = datetime(2026, 9, 1, 10, 30, 0)


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture(autouse=True)
def _no_external_io(monkeypatch):
    """R-008 — Redis publish and both push transports are external I/O."""
    from padel_app.services import messaging_service

    monkeypatch.setattr(messaging_service, "publish", lambda *a, **k: None)
    monkeypatch.setattr(
        messaging_service, "send_push_notification", lambda *a, **k: None
    )
    monkeypatch.setattr(
        messaging_service, "send_expo_push_to_user", lambda *a, **k: None
    )


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _two_users(prefix):
    from padel_app.models import User

    a = User(name="Sender", username=f"{prefix}_a", password="x")
    b = User(name="Reader", username=f"{prefix}_b", password="x")
    db.session.add_all([a, b])
    db.session.flush()
    return a, b


def _conversation_between(user_ids):
    from padel_app.models.conversations import Conversation
    from padel_app.models.conversation_participants import ConversationParticipant

    conversation = Conversation(
        is_group=False,
        participant_key=Conversation.build_participant_key(user_ids),
    )
    db.session.add(conversation)
    db.session.flush()
    for user_id in user_ids:
        db.session.add(
            ConversationParticipant(
                conversation_id=conversation.id, user_id=user_id
            )
        )
    db.session.flush()
    return conversation


# ---------------------------------------------------------------------------
# Defect 1 — messaging.messages rule 9a
# ---------------------------------------------------------------------------


def test_message_sent_one_millisecond_after_a_read_is_unread(app):
    """
    AC — "A message sent just after a read is unread".

    Read at T, send at T + 1ms. Pre-fix the send is stamped `T` truncated to the
    second, which is <= T, so `sent_at > last_read_at` is false and the message
    is invisible to the recipient's badge.
    """
    from padel_app.models import User
    from padel_app.services.messaging_service import (
        create_message_service,
        get_unread_count,
        mark_conversation_read_service,
    )

    with app.app_context():
        sender, reader = _two_users("pad203_ms")
        conversation = _conversation_between([sender.id, reader.id])
        db.session.commit()
        sender_id, reader_id, conv_id = sender.id, reader.id, conversation.id

        read_at = BASE.replace(microsecond=500_000)
        sent_at = read_at + timedelta(milliseconds=1)

        mark_conversation_read_service(
            conv_id, User.query.get(reader_id), now=read_at
        )
        create_message_service(
            {"text": "one millisecond later", "conversationId": conv_id},
            sender_id,
            now=sent_at,
        )

        assert get_unread_count(reader_id) == 1, (
            "a message sent 1ms after the read must be unread; a second-"
            "truncated sent_at makes it read"
        )


def test_sent_at_keeps_the_microseconds_it_was_given(app):
    """
    The mechanism behind the criterion, asserted directly.

    VACUITY GUARD: `get_unread_count` above can only distinguish fixed from
    broken while `sent_at` retains sub-second precision. If a future change
    re-truncates the column or the write path, this fails loudly rather than
    letting the count test pass for the wrong reason.
    """
    from padel_app.models import Message
    from padel_app.services.messaging_service import create_message_service

    with app.app_context():
        sender, reader = _two_users("pad203_us")
        conversation = _conversation_between([sender.id, reader.id])
        db.session.commit()

        stamp = BASE.replace(microsecond=123_456)
        message = create_message_service(
            {"text": "precise", "conversationId": conversation.id},
            sender.id,
            now=stamp,
        )
        message_id = message.id

        db.session.expire_all()
        stored = db.session.get(Message, message_id)
        assert stored.sent_at == stamp, (
            f"sent_at was rewritten as {stored.sent_at!r}; the microseconds "
            "must survive the write path"
        )


def test_read_then_send_on_the_real_clock_leaves_the_message_unread(app):
    """
    The same criterion without an injected clock — the shape the bug actually
    took in production, where a read and a send land in the same second.
    """
    from padel_app.models import User
    from padel_app.services.messaging_service import (
        create_message_service,
        get_unread_count,
        mark_conversation_read_service,
    )

    with app.app_context():
        sender, reader = _two_users("pad203_rc")
        conversation = _conversation_between([sender.id, reader.id])
        db.session.commit()
        sender_id, reader_id, conv_id = sender.id, reader.id, conversation.id

        mark_conversation_read_service(conv_id, User.query.get(reader_id))
        message = create_message_service(
            {"text": "same second", "conversationId": conv_id}, sender_id
        )

        from padel_app.models.conversation_participants import (
            ConversationParticipant,
        )

        last_read_at = (
            ConversationParticipant.query
            .filter_by(conversation_id=conv_id, user_id=reader_id)
            .first()
            .last_read_at
        )
        assert message.sent_at > last_read_at, (
            f"sent_at {message.sent_at!r} did not advance past last_read_at "
            f"{last_read_at!r} — the two are written by the same clock and "
            "must carry the same precision"
        )
        assert get_unread_count(reader_id) == 1


# ---------------------------------------------------------------------------
# Defect 3 — messaging.conversations rule 9 (atomic creation)
# ---------------------------------------------------------------------------


def test_conversation_creation_is_all_or_nothing(app, monkeypatch):
    """
    AC — "Creation is all-or-nothing".

    Force the second participant row to fail. Pre-fix the conversation was
    already committed by then and survives, participant-less — the exact input
    defect 2 chokes on.
    """
    from padel_app.models.conversations import Conversation
    from padel_app.models.conversation_participants import ConversationParticipant
    from padel_app.models import User
    from padel_app.services import messaging_service
    from padel_app.services.messaging_service import create_conversation_service

    monkeypatch.setattr(messaging_service, "_assert_messageable", lambda *a, **k: None)

    with app.app_context():
        creator, other = _two_users("pad203_atomic")
        db.session.commit()
        creator_id, other_id = creator.id, other.id

        conversations_before = Conversation.query.count()
        participants_before = ConversationParticipant.query.count()

        calls = {"n": 0}
        real_init = ConversationParticipant.__init__

        def exploding_init(self, *args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 2:
                raise RuntimeError("second participant insert failed")
            return real_init(self, *args, **kwargs)

        monkeypatch.setattr(ConversationParticipant, "__init__", exploding_init)

        with pytest.raises(RuntimeError, match="second participant insert failed"):
            create_conversation_service(
                {"otherParticipants": [other_id]}, User.query.get(creator_id)
            )

        # `__init__` stays patched — SQLAlchemy does not call it when loading
        # rows, so the counting queries below are unaffected.
        db.session.rollback()

        assert Conversation.query.count() == conversations_before, (
            "a failed creation left a Conversation row behind; rule 9 requires "
            "the conversation and its participants to be one transaction"
        )
        assert ConversationParticipant.query.count() == participants_before, (
            "a failed creation left an orphaned ConversationParticipant behind"
        )
        assert calls["n"] >= 2, (
            "the failure was never triggered — this test would pass vacuously"
        )


def test_successful_creation_still_writes_conversation_and_both_participants(app, monkeypatch):
    """
    The happy path through the same rewritten transaction — the guard against
    fixing atomicity by never committing anything.
    """
    from padel_app.models.conversations import Conversation
    from padel_app.models.conversation_participants import ConversationParticipant
    from padel_app.models import User
    from padel_app.services import messaging_service
    from padel_app.services.messaging_service import create_conversation_service

    monkeypatch.setattr(messaging_service, "_assert_messageable", lambda *a, **k: None)

    with app.app_context():
        creator, other = _two_users("pad203_happy")
        db.session.commit()
        creator_id, other_id = creator.id, other.id

        conversation, returned_creator_id = create_conversation_service(
            {"otherParticipants": [other_id]}, User.query.get(creator_id)
        )
        conversation_id = conversation.id
        assert returned_creator_id == creator_id

        db.session.expire_all()
        stored = db.session.get(Conversation, conversation_id)
        assert stored is not None, "the conversation was never committed"
        assert stored.participant_key == Conversation.build_participant_key(
            [creator_id, other_id]
        )
        assert stored.is_group is False
        assert sorted(p.user_id for p in stored.participants) == sorted(
            [creator_id, other_id]
        )
        assert (
            ConversationParticipant.query.filter_by(
                conversation_id=conversation_id
            ).count()
            == 2
        )


def test_creating_an_existing_conversation_still_returns_it(app, monkeypatch):
    """
    Rule 2 / "Idempotent creation" — unchanged by rule 9, and worth pinning
    because the rewrite touches the branch guarding it.
    """
    from padel_app.models import User
    from padel_app.models.conversations import Conversation
    from padel_app.services import messaging_service
    from padel_app.services.messaging_service import create_conversation_service

    monkeypatch.setattr(messaging_service, "_assert_messageable", lambda *a, **k: None)

    with app.app_context():
        creator, other = _two_users("pad203_idem")
        existing = _conversation_between([creator.id, other.id])
        db.session.commit()
        creator_id, other_id, existing_id = creator.id, other.id, existing.id

        before = Conversation.query.count()
        conversation, _ = create_conversation_service(
            {"otherParticipants": [other_id]}, User.query.get(creator_id)
        )

        assert conversation.id == existing_id
        assert Conversation.query.count() == before, "a duplicate was created"


# ---------------------------------------------------------------------------
# Defect 2 — messaging.conversations rule 10 (degraded serialization)
# ---------------------------------------------------------------------------


def _malformed_conversation(only_user_id, vanished_user_id):
    """
    A conversation with exactly one participant row — what a hard-deleted
    counterpart, or a creation that failed between the old per-row commits,
    leaves in the database.

    R-017: the key is still built through `build_participant_key`, because the
    key is not what is malformed here — the *participant rows* are. The
    vanished user's id stays in the key exactly as it would in production.
    """
    from padel_app.models.conversations import Conversation
    from padel_app.models.conversation_participants import ConversationParticipant

    conversation = Conversation(
        is_group=False,
        participant_key=Conversation.build_participant_key(
            [only_user_id, vanished_user_id]
        ),
    )
    db.session.add(conversation)
    db.session.flush()
    db.session.add(
        ConversationParticipant(
            conversation_id=conversation.id, user_id=only_user_id
        )
    )
    db.session.flush()
    return conversation


def test_list_endpoint_survives_a_participantless_conversation(app, client):
    """
    AC — "One malformed conversation does not break the list".

    Pre-fix: `StopIteration` escapes `serialize_conversation`, the list
    comprehension in `get_conversations` propagates it, and the caller loses
    every conversation they have, not just the broken one.
    """
    from padel_app.models import Message

    with app.app_context():
        caller, partner = _two_users("pad203_list")
        db.session.flush()
        caller_id, partner_id = caller.id, partner.id

        healthy_one = _conversation_between([caller_id, partner_id])
        third, _spare = _two_users("pad203_list_x")
        db.session.flush()
        healthy_two = _conversation_between([caller_id, third.id])
        # The counterpart's user row is gone; only the caller's row survives.
        broken = _malformed_conversation(caller_id, vanished_user_id=999999)

        # Give each one a message so ordering is defined and lastMessage is set.
        for index, conversation in enumerate(
            (healthy_one, healthy_two, broken)
        ):
            db.session.add(
                Message(
                    text=f"m{index}",
                    sent_at=BASE + timedelta(minutes=index),
                    sender_id=caller_id,
                    conversation_id=conversation.id,
                )
            )
        db.session.commit()
        broken_id = broken.id
        healthy_ids = {healthy_one.id, healthy_two.id}

    resp = client.get(
        "/api/app/conversations", headers=_auth_header(app, caller_id)
    )
    assert resp.status_code == 200, resp.data

    conversations = resp.get_json()["conversations"]
    by_id = {c["id"]: c for c in conversations}

    assert healthy_ids <= set(by_id), (
        "the healthy conversations must survive alongside the malformed one"
    )
    assert broken_id in by_id, "the malformed conversation must still be listed"

    degraded = by_id[broken_id]
    assert degraded["participantId"] is None
    assert degraded["participantName"] is None
    assert degraded["participantRole"] is None
    assert degraded["participantDeleted"] is True

    for healthy_id in healthy_ids:
        assert by_id[healthy_id]["participantId"] is not None
        assert by_id[healthy_id]["participantDeleted"] is False


def test_conversation_the_caller_has_no_row_in_still_serializes(app):
    """
    AC — "A conversation the caller has no row in still serializes".

    The other half of the same `next(...)`: the caller's OWN participant row is
    the one missing, so `last_read_at` cannot be read. Unread must fall back to
    "never read" rather than raising.
    """
    from padel_app.models import Message
    from padel_app.serializers.conversation import serialize_conversation

    with app.app_context():
        caller, stranger = _two_users("pad203_noself")
        db.session.flush()
        caller_id = caller.id

        conversation = _malformed_conversation(
            stranger.id, vanished_user_id=888888
        )
        db.session.add(
            Message(
                text="from the stranger",
                sent_at=BASE,
                sender_id=stranger.id,
                conversation_id=conversation.id,
            )
        )
        db.session.commit()

        payload = serialize_conversation(conversation, caller_id)

    assert payload["participantId"] == stranger.id, (
        "the stranger is the only counterpart, so they are the participant"
    )
    assert payload["participantDeleted"] is False
    assert payload["unreadCount"] == 1, (
        "with no own participant row there is no last_read_at, so every "
        "message from someone else counts as unread"
    )


def test_conversation_detail_degrades_the_same_way(app, client):
    """
    Rule 8's last clause — `serialize_conversation_detail` must not have its own
    opinion about a missing counterpart, or `GET /api/app/conversation/{id}`
    becomes the new 500.
    """
    from padel_app.models import Message

    with app.app_context():
        caller, _unused = _two_users("pad203_detail")
        db.session.flush()
        caller_id = caller.id

        conversation = _malformed_conversation(
            caller_id, vanished_user_id=777777
        )
        db.session.add(
            Message(
                text="alone in here",
                sent_at=BASE,
                sender_id=caller_id,
                conversation_id=conversation.id,
            )
        )
        db.session.commit()
        conversation_id = conversation.id

    resp = client.get(
        f"/api/app/conversation/{conversation_id}",
        headers=_auth_header(app, caller_id),
    )
    assert resp.status_code == 200, resp.data

    payload = resp.get_json()
    assert payload["participantId"] is None
    assert payload["participantName"] is None
    assert payload["participantRole"] is None
    assert payload["participantDeleted"] is True
    assert [m["content"] for m in payload["messages"]] == ["alone in here"]


def test_a_healthy_conversation_is_not_flagged_as_deleted(app):
    """
    VACUITY GUARD for rule 10: the flag must discriminate. A serializer that
    returned `participantDeleted: True` unconditionally would satisfy every
    assertion above.
    """
    from padel_app.serializers.conversation import serialize_conversation

    with app.app_context():
        caller, partner = _two_users("pad203_healthy")
        conversation = _conversation_between([caller.id, partner.id])
        db.session.commit()

        payload = serialize_conversation(conversation, caller.id)

    assert payload["participantDeleted"] is False
    assert payload["participantId"] == partner.id
    assert payload["participantName"] == "Reader"
