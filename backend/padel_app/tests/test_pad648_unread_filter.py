"""PAD-648 — messaging.conversations rule 17: `GET /api/app/conversations?unread=1`.

The "Não lidas" filter is answered by the server, with the same paging and order as the full list,
so an unread thread beyond the first page is still found. A conversation is listed exactly when
its row would carry the unread pill: the filter and `unreadCount` share one predicate.

R-008: `publish` and the push transports are patched out; every timestamp is injected.
"""
from datetime import datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db

BASE = datetime(2026, 9, 1, 10, 0, 0)


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture(autouse=True)
def _no_external_io(monkeypatch):
    from padel_app.services import messaging_service, notification_service

    for module in (messaging_service, notification_service):
        monkeypatch.setattr(module, "publish", lambda *a, **k: None)
        monkeypatch.setattr(module, "send_push_notification", lambda *a, **k: None)
    monkeypatch.setattr(messaging_service, "send_expo_push_to_user", lambda *a, **k: None)


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _user(name, username):
    from padel_app.models import User

    user = User(name=name, username=username, password="x")
    db.session.add(user)
    db.session.flush()
    return user


def _conversation(user_ids, read_at=None):
    """`read_at` maps a user id to that participant's `last_read_at`."""
    from padel_app.models.conversation_participants import ConversationParticipant
    from padel_app.models.conversations import Conversation

    read_at = read_at or {}
    conversation = Conversation(is_group=False, participant_key=Conversation.build_participant_key(user_ids))
    db.session.add(conversation)
    db.session.flush()
    for user_id in user_ids:
        db.session.add(
            ConversationParticipant(
                conversation_id=conversation.id, user_id=user_id, last_read_at=read_at.get(user_id)
            )
        )
    db.session.flush()
    return conversation


def _message(conversation_id, sender_id, sent_at, is_deleted=False):
    from padel_app.models import Message

    db.session.add(
        Message(text="m", sent_at=sent_at, sender_id=sender_id, conversation_id=conversation_id, is_deleted=is_deleted)
    )
    db.session.flush()


@pytest.fixture
def inbox(app):
    """The coach's five conversations, oldest activity first:

    - ana: one message from Ana the coach has not read (the OLDEST thread, so on the last page);
    - rui: Rui wrote, the coach read it afterwards;
    - bea: only the coach wrote;
    - gil: Gil's only message after the coach's last read is deleted;
    - eva: the coach wrote after reading; Eva has not read it (unread for HER, not the coach).
    """
    with app.app_context():
        coach = _user("Coach", "pad648_coach")
        ana, rui, bea, gil, eva = (
            _user(n.title(), f"pad648_{n}") for n in ("ana", "rui", "bea", "gil", "eva")
        )
        ids = {}
        c = _conversation([coach.id, ana.id])
        _message(c.id, ana.id, BASE)
        ids["ana"] = c.id
        c = _conversation([coach.id, rui.id], read_at={coach.id: BASE + timedelta(hours=2)})
        _message(c.id, rui.id, BASE + timedelta(hours=1))
        ids["rui"] = c.id
        c = _conversation([coach.id, bea.id])
        _message(c.id, coach.id, BASE + timedelta(hours=3))
        ids["bea"] = c.id
        c = _conversation([coach.id, gil.id])
        _message(c.id, gil.id, BASE + timedelta(hours=4), is_deleted=True)
        ids["gil"] = c.id
        c = _conversation([coach.id, eva.id], read_at={coach.id: BASE + timedelta(hours=6)})
        _message(c.id, eva.id, BASE + timedelta(hours=5))
        _message(c.id, coach.id, BASE + timedelta(hours=7))
        ids["eva"] = c.id
        db.session.commit()
        return coach.id, ids


def _list(client, app, user_id, **params):
    res = client.get("/api/app/conversations", query_string=params, headers=_auth(app, user_id))
    assert res.status_code == 200, res.get_json()
    return res.get_json()


def test_unread_lists_only_the_threads_with_a_pill_even_from_the_last_page(app, client, inbox):
    coach_id, ids = inbox
    # Without the filter, Ana's thread is the oldest: not on page 1 of 2.
    full = _list(client, app, coach_id, limit=2)
    assert ids["ana"] not in [int(c["id"]) for c in full["conversations"]]

    body = _list(client, app, coach_id, unread=1, limit=2)
    assert [int(c["id"]) for c in body["conversations"]] == [ids["ana"]]
    assert body["hasMore"] is False
    assert body["conversations"][0]["unreadCount"] == 1


def test_the_filter_lists_exactly_the_rows_with_unread_count(app, client, inbox):
    coach_id, _ = inbox
    rows = []
    page = 1
    while True:
        body = _list(client, app, coach_id, page=page, limit=2)
        rows += body["conversations"]
        if not body["hasMore"]:
            break
        page += 1
    with_pill = [int(c["id"]) for c in rows if c["unreadCount"] > 0]
    filtered = [int(c["id"]) for c in _list(client, app, coach_id, unread=1, limit=50)["conversations"]]
    assert filtered == with_pill


def test_unread_is_the_callers_not_the_other_sides(app, client, inbox):
    """Eva has not read the coach's message: that thread is unread for Eva, listed for her only."""
    from padel_app.models import User

    _, ids = inbox
    with app.app_context():
        eva_id = User.query.filter_by(username="pad648_eva").one().id
    assert [int(c["id"]) for c in _list(client, app, eva_id, unread=1)["conversations"]] == [ids["eva"]]


@pytest.mark.parametrize("value", ["0", "false", ""])
def test_any_other_value_is_the_full_list(app, client, inbox, value):
    coach_id, _ = inbox
    assert _list(client, app, coach_id, unread=value, limit=50) == _list(client, app, coach_id, limit=50)
