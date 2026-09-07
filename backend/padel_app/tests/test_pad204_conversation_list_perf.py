"""
PAD-204 — the conversation list hydrated every message of every conversation.

`serialize_conversation` sorted `conversation.messages` in Python to find the
last one and to count unread, so listing 20 threads pulled every message row in
all 20 into the identity map — thousands of ORM objects per page on a 192 MB
box. `get_user_conversations` then ordered by a correlated `MAX(sent_at)`
subquery over an unindexed column, and `serialize_conversation_detail` walked
`message.reactions` lazily, one round trip per message.

The fix is a denormalised pointer (`conversations.last_message_at` /
`last_message_id`, maintained by a single `after_insert` listener on `Message`
so no insert path can forget), one grouped unread query for the whole page, and
eager reaction loading on the detail endpoint. Covered specs:
messaging.conversations rules 11-13 and messaging.conversation-detail rule 8.

The load-bearing assertions here are the STATEMENT COUNTS: the endpoints must
issue the same number of SQL statements whether a thread holds 3 messages or
300. Everything else can regress quietly; that one cannot.

R-008: `publish` and both push transports are patched out, and every timestamp
is injected rather than mocked.
"""
from contextlib import contextmanager
from datetime import datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import event, inspect
from sqlalchemy.exc import IntegrityError

from padel_app.sql_db import db


BASE = datetime(2026, 9, 1, 10, 0, 0)


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture(autouse=True)
def _no_external_io(monkeypatch):
    """R-008 — Redis publish and both push transports are external I/O."""
    from padel_app.services import messaging_service, notification_service

    for module in (messaging_service, notification_service):
        monkeypatch.setattr(module, "publish", lambda *a, **k: None)
        monkeypatch.setattr(
            module, "send_push_notification", lambda *a, **k: None
        )
    monkeypatch.setattr(
        messaging_service, "send_expo_push_to_user", lambda *a, **k: None
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _user(name, username):
    from padel_app.models import User

    user = User(name=name, username=username, password="x")
    db.session.add(user)
    db.session.flush()
    return user


def _conversation_between(user_ids):
    from padel_app.models.conversation_participants import ConversationParticipant
    from padel_app.models.conversations import Conversation

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


def _add_message(conversation_id, sender_id, text, sent_at, is_deleted=False):
    """The shape `replacement_approval_service` uses: construct, add, flush."""
    from padel_app.models import Message

    message = Message(
        text=text,
        sent_at=sent_at,
        sender_id=sender_id,
        conversation_id=conversation_id,
        is_deleted=is_deleted,
    )
    db.session.add(message)
    db.session.flush()
    return message


@contextmanager
def _statement_counter(app):
    """Counts every statement the engine executes inside the block.

    `before_cursor_execute` sees the real cursor traffic, which is what rule 12
    is written about — an ORM-level count would miss the lazy loads that are the
    whole defect.
    """
    with app.app_context():
        engine = db.engine

    recorded = []

    def _record(conn, cursor, statement, parameters, context, executemany):
        recorded.append(statement)

    event.listen(engine, "before_cursor_execute", _record)
    try:
        yield recorded
    finally:
        event.remove(engine, "before_cursor_execute", _record)


# ---------------------------------------------------------------------------
# Rule 11 — the denormalised pointer
# ---------------------------------------------------------------------------


def test_list_is_ordered_by_the_denormalised_last_message(app, client):
    """
    AC — "Ordered by the denormalised last message".

    Four threads: newest at 12:00, then 10:00, then 09:00, then one with no
    messages at all. The order is `last_message_at` desc, nulls last, and the
    payload's lastMessage/lastMessageAt come from the pointer.
    """
    with app.app_context():
        caller = _user("Caller", "pad204_order_caller")
        partners = [
            _user(f"Partner {i}", f"pad204_order_p{i}") for i in range(4)
        ]
        conversations = [
            _conversation_between([caller.id, partner.id])
            for partner in partners
        ]
        caller_id = caller.id

        # A -> 10:00, B -> 12:00, C -> 09:00, D -> no messages.
        _add_message(conversations[0].id, partners[0].id, "a", BASE)
        _add_message(
            conversations[1].id, partners[1].id, "b", BASE + timedelta(hours=2)
        )
        _add_message(
            conversations[2].id, partners[2].id, "c", BASE - timedelta(hours=1)
        )
        db.session.commit()

        expected_order = [
            conversations[1].id,
            conversations[0].id,
            conversations[2].id,
            conversations[3].id,
        ]
        empty_id = conversations[3].id
        newest_id = conversations[1].id

        # The pointer itself, not just the ordering it produces.
        from padel_app.models.conversations import Conversation

        newest = Conversation.query.get(newest_id)
        assert newest.last_message_at == BASE + timedelta(hours=2)
        assert newest.last_message_id is not None
        assert Conversation.query.get(empty_id).last_message_at is None
        assert Conversation.query.get(empty_id).last_message_id is None

    resp = client.get(
        "/api/app/conversations", headers=_auth_header(app, caller_id)
    )
    assert resp.status_code == 200, resp.data

    listed = resp.get_json()["conversations"]
    assert [c["id"] for c in listed] == expected_order, (
        "last_message_at descending, with the message-less conversation last"
    )

    by_id = {c["id"]: c for c in listed}
    assert by_id[newest_id]["lastMessage"] == "b"
    assert by_id[newest_id]["lastMessageAt"].startswith("2026-09-01T12:00:00")
    assert by_id[empty_id]["lastMessage"] is None
    assert by_id[empty_id]["lastMessageAt"] is None


def test_every_message_insert_path_moves_the_pointer(app):
    """
    AC — "A system message moves the thread to the top", first half.

    Rule 11 says *every* path that inserts a `messages` row maintains the
    pointer. The three shapes in this codebase are exercised here: the service a
    user's message goes through, the notification engine's system-message
    writer, and the bare `add` + `flush` the replacement-approval prompt uses.
    """
    from padel_app.models.conversations import Conversation
    from padel_app.services import notification_service
    from padel_app.services.messaging_service import create_message_service

    with app.app_context():
        coach = _user("Coach", "pad204_paths_coach")
        player = _user("Player", "pad204_paths_player")
        conversation = _conversation_between([coach.id, player.id])
        db.session.commit()
        conversation_id = conversation.id

        # 1. A user sending a message.
        sent = create_message_service(
            {"conversationId": conversation_id, "text": "typed by a human"},
            coach.id,
            now=BASE,
        )
        conversation = Conversation.query.get(conversation_id)
        assert conversation.last_message_at == BASE
        assert conversation.last_message_id == sent.id

        # 2. The notification engine's system message.
        system = notification_service._send_system_message(
            coach_user_id=coach.id,
            player_user_id=player.id,
            text="your class is tomorrow",
        )
        assert system is not None, "the engine must actually have written a row"
        db.session.commit()
        conversation = Conversation.query.get(conversation_id)
        assert conversation.last_message_id == system.id, (
            "an engine-written message moves the pointer like any other"
        )

        # 3. The replacement-approval shape: construct, add, flush.
        prompt = _add_message(
            conversation_id,
            coach.id,
            "approve these replacements",
            conversation.last_message_at + timedelta(minutes=5),
        )
        db.session.commit()
        conversation = Conversation.query.get(conversation_id)
        assert conversation.last_message_id == prompt.id


def test_a_back_dated_insert_does_not_rewind_the_pointer(app):
    """
    AC — "A system message moves the thread to the top", second half.

    A message stamped older than the stored `last_message_at` (a backfill, a
    replayed job) must leave the thread where it is.
    """
    from padel_app.models.conversations import Conversation

    with app.app_context():
        a = _user("A", "pad204_backdate_a")
        b = _user("B", "pad204_backdate_b")
        conversation = _conversation_between([a.id, b.id])
        newest = _add_message(conversation.id, a.id, "newest", BASE)
        db.session.commit()
        conversation_id = conversation.id
        newest_id = newest.id

        _add_message(
            conversation_id, b.id, "older", BASE - timedelta(days=3)
        )
        db.session.commit()

        conversation = Conversation.query.get(conversation_id)
        assert conversation.last_message_at == BASE
        assert conversation.last_message_id == newest_id


# ---------------------------------------------------------------------------
# Rule 12 — the list is constant-cost
# ---------------------------------------------------------------------------


def _seed_conversations(caller_id, prefix, count, messages_each):
    """`count` conversations for `caller_id`, each holding `messages_each` messages."""
    conversation_ids = []
    for index in range(count):
        partner = _user(f"P{index}", f"{prefix}_p{index}")
        conversation = _conversation_between([caller_id, partner.id])
        for n in range(messages_each):
            _add_message(
                conversation.id,
                partner.id,
                f"m{n}",
                BASE + timedelta(minutes=index, seconds=n),
            )
        conversation_ids.append(conversation.id)
    return conversation_ids


def test_list_statement_count_is_constant(app, client):
    """
    AC — "The list costs the same whether it shows 3 threads or 20, holding 3
    messages or 300".

    The guard that stops the N+1 coming back, along both axes rule 12 names.

    The page-size axis is the one that is broken today: `serialize_conversation`
    lazy-loads `conversation.messages` per conversation, so the cost is one
    extra statement per row on the page (plus one per participant collection).
    The message-count axis is currently constant in *statements* while being
    ruinous in *rows* — one lazy load returns the whole thread — which is what
    `test_serializing_the_list_never_loads_the_message_bodies` pins.
    """
    with app.app_context():
        caller = _user("Caller", "pad204_count_caller")
        caller_id = caller.id
        few_ids = _seed_conversations(caller_id, "pad204_count_few", 3, 1)
        db.session.commit()

    headers = _auth_header(app, caller_id)

    # Warm up: the very first request pays one-off costs (connection setup,
    # statement compilation) that have nothing to do with the page.
    assert client.get("/api/app/conversations", headers=headers).status_code == 200

    with _statement_counter(app) as few:
        resp = client.get("/api/app/conversations", headers=headers)
    assert resp.status_code == 200, resp.data
    assert len(resp.get_json()["conversations"]) == 3
    few_count = len(few)

    # Axis 1 — more conversations on the page.
    with app.app_context():
        _seed_conversations(caller_id, "pad204_count_many", 17, 1)
        db.session.commit()

    with _statement_counter(app) as many:
        resp = client.get("/api/app/conversations", headers=headers)
    assert resp.status_code == 200, resp.data
    assert len(resp.get_json()["conversations"]) == 20
    many_count = len(many)

    assert many_count == few_count, (
        "the conversation list must cost the same for 20 conversations as for "
        f"3; got {few_count} statements then {many_count}"
    )

    # Axis 2 — the same page, with long threads behind it.
    with app.app_context():
        from padel_app.models import ConversationParticipant

        for conversation_id in few_ids:
            partner_id = (
                ConversationParticipant.query.filter(
                    ConversationParticipant.conversation_id == conversation_id,
                    ConversationParticipant.user_id != caller_id,
                )
                .first()
                .user_id
            )
            for n in range(100):
                _add_message(
                    conversation_id,
                    partner_id,
                    f"filler {n}",
                    BASE + timedelta(hours=1, seconds=n),
                )
        db.session.commit()

    with _statement_counter(app) as deep:
        resp = client.get("/api/app/conversations", headers=headers)
    assert resp.status_code == 200, resp.data
    deep_count = len(deep)

    assert deep_count == many_count, (
        "the conversation list must cost the same with 300 messages behind it "
        f"as with 20; got {many_count} statements then {deep_count}"
    )


def test_serializing_the_list_never_loads_the_message_bodies(app):
    """
    AC — "The list costs the same…", the mechanism rather than the symptom.

    Rule 12 forbids hydrating `conversation.messages`. SQLAlchemy will tell us
    directly whether the relationship was touched.
    """
    from padel_app.serializers.conversation import serialize_conversations
    from padel_app.services.messaging_service import get_user_conversations
    from padel_app.models import User

    with app.app_context():
        caller = _user("Caller", "pad204_unloaded_caller")
        partner = _user("Partner", "pad204_unloaded_partner")
        conversation = _conversation_between([caller.id, partner.id])
        for n in range(5):
            _add_message(
                conversation.id, partner.id, f"m{n}", BASE + timedelta(minutes=n)
            )
        db.session.commit()
        caller_id = caller.id

    with app.app_context():
        caller = User.query.get(caller_id)
        page = get_user_conversations(caller)
        payload = serialize_conversations(page["conversations"], caller_id)

        assert payload[0]["lastMessage"] == "m4"
        for conversation in page["conversations"]:
            assert "messages" in inspect(conversation).unloaded, (
                "the list path must never hydrate conversation.messages"
            )


def test_listed_unread_counts_sum_to_the_badge(app, client):
    """
    AC — "Per-conversation unread agrees with the badge".

    Conversation A: 2 unread. Conversation B: 3 sent, one of them soft-deleted
    by its sender (R-016), so 2 unread. The per-conversation counts must use the
    badge's predicate, or the tab badge and the rows under it disagree.
    """
    from padel_app.services.messaging_service import get_unread_count

    with app.app_context():
        caller = _user("Caller", "pad204_unread_caller")
        first = _user("First", "pad204_unread_p1")
        second = _user("Second", "pad204_unread_p2")
        conversation_a = _conversation_between([caller.id, first.id])
        conversation_b = _conversation_between([caller.id, second.id])
        caller_id = caller.id
        a_id, b_id = conversation_a.id, conversation_b.id

        for n in range(2):
            _add_message(a_id, first.id, f"a{n}", BASE + timedelta(minutes=n))
        for n in range(3):
            _add_message(
                b_id,
                second.id,
                f"b{n}",
                BASE + timedelta(minutes=n),
                is_deleted=(n == 1),
            )
        # The caller's own message is never unread to them.
        _add_message(a_id, caller_id, "mine", BASE + timedelta(minutes=10))
        db.session.commit()

        badge = get_unread_count(caller_id)

    resp = client.get(
        "/api/app/conversations", headers=_auth_header(app, caller_id)
    )
    assert resp.status_code == 200, resp.data

    by_id = {c["id"]: c for c in resp.get_json()["conversations"]}
    assert by_id[a_id]["unreadCount"] == 2
    assert by_id[b_id]["unreadCount"] == 2, (
        "a message its sender deleted is not unread (R-016)"
    )
    assert (
        by_id[a_id]["unreadCount"] + by_id[b_id]["unreadCount"] == badge
    ), "the listed counts must sum to the number the app badge shows"


# ---------------------------------------------------------------------------
# Rule 13 — participant uniqueness
# ---------------------------------------------------------------------------


def test_duplicate_participant_row_is_rejected(app):
    """
    AC — "A duplicate participant row is rejected".

    Participants are inserted by looping a raw id list, so uniqueness has to be
    the database's job, not the loop's.
    """
    from padel_app.models.conversation_participants import ConversationParticipant

    with app.app_context():
        a = _user("A", "pad204_dupe_a")
        b = _user("B", "pad204_dupe_b")
        conversation = _conversation_between([a.id, b.id])
        db.session.commit()
        conversation_id, user_id = conversation.id, b.id

        db.session.add(
            ConversationParticipant(
                conversation_id=conversation_id, user_id=user_id
            )
        )
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()

        surviving = ConversationParticipant.query.filter_by(
            conversation_id=conversation_id, user_id=user_id
        ).count()
        assert surviving == 1


# ---------------------------------------------------------------------------
# conversation-detail rule 8 — reactions in one query
# ---------------------------------------------------------------------------


def test_detail_statement_count_is_constant_in_thread_length(app, client):
    """
    AC — "Reactions load in one query, not one per message".

    `serialize_message` reads `message.reactions` for every message it renders,
    so an unloaded relationship costs one round trip per message. A 3-message
    thread and a 30-message thread must cost the same number of statements.
    """
    from padel_app.models.message_reaction import MessageReaction

    with app.app_context():
        caller = _user("Caller", "pad204_detail_caller")
        short_partner = _user("Short", "pad204_detail_short")
        long_partner = _user("Long", "pad204_detail_long")
        short = _conversation_between([caller.id, short_partner.id])
        long = _conversation_between([caller.id, long_partner.id])
        caller_id, short_id, long_id = caller.id, short.id, long.id

        for n in range(3):
            message = _add_message(
                short_id, short_partner.id, f"s{n}", BASE + timedelta(minutes=n)
            )
            db.session.add(
                MessageReaction(
                    message_id=message.id, user_id=caller_id, emoji="👍"
                )
            )
        for n in range(30):
            message = _add_message(
                long_id, long_partner.id, f"l{n}", BASE + timedelta(minutes=n)
            )
            if n % 3 == 0:
                db.session.add(
                    MessageReaction(
                        message_id=message.id, user_id=caller_id, emoji="🔥"
                    )
                )
        db.session.commit()

    headers = _auth_header(app, caller_id)
    assert client.get(f"/api/app/conversation/{short_id}", headers=headers).status_code == 200

    with _statement_counter(app) as short_run:
        resp = client.get(f"/api/app/conversation/{short_id}", headers=headers)
    assert resp.status_code == 200, resp.data
    assert len(resp.get_json()["messages"]) == 3

    with _statement_counter(app) as long_run:
        resp = client.get(f"/api/app/conversation/{long_id}", headers=headers)
    assert resp.status_code == 200, resp.data
    assert len(resp.get_json()["messages"]) == 30

    assert len(long_run) == len(short_run), (
        "reactions must load in one query for the whole thread; got "
        f"{len(short_run)} statements for 3 messages and {len(long_run)} for 30"
    )
