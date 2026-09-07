"""
PAD-208 / B-027 — `GET /api/app/conversation/<id>` returns the whole history.

`serialize_conversation_detail` renders every row of `conversation.messages`,
and the endpoint takes no paging argument at all. PAD-204 made the query cheap;
it did not make the payload bounded, so a long thread is still O(history) bytes
on the wire and O(history) bubbles to render — which is what the client then
scrolls through in front of the user.

messaging.conversation-detail rule 1 now says the endpoint accepts `limit` and
`before` and hands back the *newest* page, ascending, with `hasMore` and
`oldestMessageId`; and that a request with **no** `limit` still returns the full
history, because TestFlight build 8 is in the field and sends none.

Rules 9-11 (where the thread opens, what may move a scrolled-up viewport, how an
older page is prepended) are client behaviour and are covered by the Playwright
specs in `frontend/apps/web/e2e/messaging/conversation-paging.spec.ts`.

R-008: no clock is mocked. `sent_at` is written explicitly so the 60 messages
have a deterministic order.
"""
from datetime import datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


BASE = datetime(2026, 9, 1, 9, 0, 0)


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _two_users(prefix):
    from padel_app.models import User

    a = User(name="Ana", username=f"{prefix}_a", password="x")
    b = User(name="Bruno", username=f"{prefix}_b", password="x")
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


def _seed_thread(app, prefix, count=60):
    """A conversation with `count` messages, "msg-1" (oldest) .. "msg-N" (newest)."""
    from padel_app.models.messages import Message

    with app.app_context():
        ana, bruno = _two_users(prefix)
        conversation = _conversation_between([ana.id, bruno.id])
        for i in range(1, count + 1):
            db.session.add(
                Message(
                    text=f"msg-{i}",
                    sender_id=ana.id if i % 2 else bruno.id,
                    conversation_id=conversation.id,
                    sent_at=BASE + timedelta(minutes=i),
                )
            )
        db.session.commit()
        return conversation.id, ana.id, bruno.id


def _texts(payload):
    return [m["content"] for m in payload["messages"]]


# ---------------------------------------------------------------------------
# messaging.conversation-detail rule 1 — the paging contract
# ---------------------------------------------------------------------------


def test_limit_returns_the_newest_page_ascending_with_paging_metadata(app, client):
    """
    AC — "The newest page comes back first, and `before` walks backwards", part 1.

    60 messages, `limit=50` → msg-11 .. msg-60 in ascending order, `hasMore`
    true, and `oldestMessageId` naming the first row of the page so the client
    can ask for the one before it.
    """
    conv_id, ana_id, _ = _seed_thread(app, "pad208_page1")

    res = client.get(
        f"/api/app/conversation/{conv_id}?limit=50",
        headers=_auth_header(app, ana_id),
    )
    assert res.status_code == 200
    payload = res.get_json()

    assert len(payload["messages"]) == 50, (
        "`limit=50` must bound the payload; the whole point of the ticket is "
        "that the thread is no longer O(history)"
    )
    assert _texts(payload)[0] == "msg-11"
    assert _texts(payload)[-1] == "msg-60", (
        "the page must be the NEWEST 50, not the oldest — the thread opens at "
        "the bottom"
    )
    assert _texts(payload) == [f"msg-{i}" for i in range(11, 61)], (
        "rule 2: still ascending within the page"
    )
    assert payload["hasMore"] is True
    assert payload["oldestMessageId"] == payload["messages"][0]["id"]


def test_before_walks_backwards_and_reports_the_end_of_the_history(app, client):
    """
    AC — "The newest page comes back first, and `before` walks backwards", part 2.

    Passing the previous page's `oldestMessageId` as `before` hands back the 10
    remaining older messages, exclusive of the cursor, with `hasMore` false.
    """
    conv_id, ana_id, _ = _seed_thread(app, "pad208_page2")
    headers = _auth_header(app, ana_id)

    first = client.get(
        f"/api/app/conversation/{conv_id}?limit=50", headers=headers
    ).get_json()

    res = client.get(
        f"/api/app/conversation/{conv_id}"
        f"?limit=50&before={first['oldestMessageId']}",
        headers=headers,
    )
    assert res.status_code == 200
    older = res.get_json()

    assert _texts(older) == [f"msg-{i}" for i in range(1, 11)]
    assert older["hasMore"] is False, (
        "msg-1 is the oldest message there is; the client must stop asking"
    )
    assert first["oldestMessageId"] not in [
        m["id"] for m in older["messages"]
    ], "`before` is exclusive — a repeated message would render twice"


def test_no_limit_still_returns_the_whole_history(app, client):
    """
    AC — "…and a GET with no `limit` still returns all 60 messages".

    TestFlight build 8 is in the field and sends no `limit`. The unpaged branch
    is deprecated, not removed: dropping it would silently truncate every
    conversation on every device already installed.
    """
    conv_id, ana_id, _ = _seed_thread(app, "pad208_compat")

    payload = client.get(
        f"/api/app/conversation/{conv_id}", headers=_auth_header(app, ana_id)
    ).get_json()

    assert _texts(payload) == [f"msg-{i}" for i in range(1, 61)]
    assert payload["hasMore"] is False
    assert payload["oldestMessageId"] == payload["messages"][0]["id"]


def test_paged_payload_keeps_the_conversation_summary_and_reactions(app, client):
    """
    Paging must not cost the fields the rest of the spec already guarantees:
    PAD-203's `participantDeleted` guard (rule 5) and PAD-204's eager reactions
    (rule 8) are both part of this payload.
    """
    from padel_app.models.messages import Message
    from padel_app.models.message_reaction import MessageReaction

    conv_id, ana_id, bruno_id = _seed_thread(app, "pad208_shape")
    with app.app_context():
        newest = (
            Message.query.filter_by(conversation_id=conv_id)
            .order_by(Message.sent_at.desc())
            .first()
        )
        db.session.add(
            MessageReaction(message_id=newest.id, user_id=bruno_id, emoji="🎾")
        )
        db.session.commit()

    payload = client.get(
        f"/api/app/conversation/{conv_id}?limit=10",
        headers=_auth_header(app, ana_id),
    ).get_json()

    assert payload["participantName"] == "Bruno"
    assert payload["participantDeleted"] is False
    assert payload["messages"][-1]["reactions"] == [
        {"emoji": "🎾", "userId": bruno_id}
    ]


def test_a_short_thread_reports_no_more_pages(app, client):
    """A thread shorter than one page has nothing older behind it."""
    conv_id, ana_id, _ = _seed_thread(app, "pad208_short", count=3)

    payload = client.get(
        f"/api/app/conversation/{conv_id}?limit=50",
        headers=_auth_header(app, ana_id),
    ).get_json()

    assert _texts(payload) == ["msg-1", "msg-2", "msg-3"]
    assert payload["hasMore"] is False


def test_paging_still_refuses_a_non_participant(app, client):
    """Paging is not a way around the participation check (messaging rule)."""
    from padel_app.models import User

    conv_id, _, _ = _seed_thread(app, "pad208_outsider")
    with app.app_context():
        outsider = User(name="Nosy", username="pad208_outsider_x", password="x")
        db.session.add(outsider)
        db.session.commit()
        outsider_id = outsider.id

    res = client.get(
        f"/api/app/conversation/{conv_id}?limit=10",
        headers=_auth_header(app, outsider_id),
    )
    assert res.status_code == 403
