"""PAD-789 — admin.engine-health rule 13: the push reach of message recipients (students someone
wrote to in the window), by channel, beside rule 8a's active students. Counts only, one aggregate
query."""
import itertools
import json
from contextlib import contextmanager
from datetime import datetime, timedelta

import pytest
from sqlalchemy import event

from padel_app.sql_db import db
from padel_app.tests.admin_helpers import admin_token, bearer, make_role
from padel_app.utils.dates import utcnow_naive

NOW = datetime(2027, 7, 12, 10, 0)
WINDOW_DAYS = 7  # const:MESSAGE_RECIPIENT_WINDOW_DAYS
_seq = itertools.count()


def _user(username, *, player=True, coach=False, token=False, webpush=False, status="active",
          read_at=None):
    from padel_app.models import (Coach, Conversation, ConversationParticipant, DeviceToken, Player,
                                  PushSubscription, User)

    u = User(name=f"Name {username}", username=username, email=f"{username}@t.test", password="x",
             status=status)
    db.session.add(u)
    db.session.flush()
    if player:
        db.session.add(Player(user_id=u.id))
    if coach:
        db.session.add(Coach(user_id=u.id))
    if token:
        db.session.add(DeviceToken(user_id=u.id, token=f"ExponentPushToken[{username}]", platform="ios"))
    if webpush:
        db.session.add(PushSubscription(user_id=u.id, subscription_json="{}"))
    if read_at is not None:  # rule 8a's active student: a conversation marked read
        conv = Conversation(participant_key=f"p789-read-{next(_seq)}")
        db.session.add(conv)
        db.session.flush()
        db.session.add(ConversationParticipant(conversation_id=conv.id, user_id=u.id, last_read_at=read_at))
    db.session.flush()
    return u.id


def _message(sender_id, recipient_id, sent_at, *, joined_at=None, deleted=False):
    """A two-person conversation holding one message from `sender_id`."""
    from padel_app.models import Conversation, ConversationParticipant, Message

    conv = Conversation(participant_key=f"p789-{next(_seq)}")
    db.session.add(conv)
    db.session.flush()
    for uid, joined in ((sender_id, sent_at - timedelta(days=30)),
                        (recipient_id, joined_at or sent_at - timedelta(days=30))):
        db.session.add(ConversationParticipant(conversation_id=conv.id, user_id=uid, joined_at=joined))
    db.session.add(Message(text="hi", sent_at=sent_at, sender_id=sender_id, conversation_id=conv.id,
                           is_deleted=deleted))
    db.session.flush()


@contextmanager
def _statements(app):
    with app.app_context():
        engine = db.engine
    recorded = []

    def _record(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            recorded.append(statement)

    event.listen(engine, "before_cursor_execute", _record)
    try:
        yield recorded
    finally:
        event.remove(engine, "before_cursor_execute", _record)


@pytest.mark.criterion("ADMIN-ENGINE-HEALTH-30")
def test_message_recipients_are_counted_by_channel(app):
    from padel_app.services.admin.engine_health import _push

    recent = NOW - timedelta(days=2)
    with app.app_context():
        coach = _user("p789coach", player=False, coach=True)
        a = _user("p789a")
        b = _user("p789b", status="inactive")
        c = _user("p789c", webpush=True)
        d = _user("p789d", token=True, read_at=recent)
        e = _user("p789e", token=True, webpush=True)
        f = _user("p789f", read_at=recent)
        g = _user("p789g")
        h = _user("p789h")
        coach_only = _user("p789coachonly", player=False, coach=True)
        for uid in (a, b, c, d):
            _message(coach, uid, recent)
        _message(coach, e, recent, deleted=True)
        _message(f, coach, recent)  # F only wrote
        _message(coach, g, NOW - timedelta(days=WINDOW_DAYS + 1))
        _message(coach, h, recent, joined_at=recent + timedelta(hours=1))
        _message(a, coach_only, NOW - timedelta(days=1))
        db.session.commit()
        push = _push(NOW)
    assert push["messageRecipients"] == {
        "windowDays": WINDOW_DAYS, "total": 5, "noChannel": 2, "webPushOnly": 1, "nativeOnly": 1,
        "nativeAndWebPush": 1,
    }
    assert push["activeStudents7d"]["total"] == 2


@pytest.mark.criterion("ADMIN-ENGINE-HEALTH-31")
def test_a_recipient_counts_once_and_the_block_holds_only_counts(app, client):
    now = utcnow_naive()  # the admin gate checks its token against the real clock
    headers = bearer(admin_token(app, make_role(app, "sam@levapp.app", "support")))
    with app.app_context():
        coach = _user("p789twicecoach", player=False, coach=True)
        student = _user("p789twice")
        _message(coach, student, now - timedelta(days=1))
        _message(coach, student, now - timedelta(hours=2))
        db.session.commit()
    resp = client.get("/admin/api/engine-health", headers=headers)
    push = resp.get_json()["push"]
    assert push["messageRecipients"]["total"] == 1
    assert set(push) == {"activeStudents7d", "messageRecipients", "registrationFailures7d"}
    assert set(push["messageRecipients"]) == {"windowDays", "total", "noChannel", "webPushOnly",
                                              "nativeOnly", "nativeAndWebPush"}
    assert all(type(v) is int for v in push["messageRecipients"].values())
    body = resp.get_data(as_text=True)
    for leak in ("p789twice@t.test", "Name p789twice", '"p789twice"'):
        assert leak not in body
    assert "p789twice" not in json.dumps(push)


@pytest.mark.criterion("ADMIN-ENGINE-HEALTH-32")
def test_the_recipient_count_does_not_grow_with_students(app):
    from padel_app.services.admin.engine_health import _push

    def seed(n, prefix):
        with app.app_context():
            coach = _user(f"{prefix}coach", player=False, coach=True)
            for i in range(n):
                _message(coach, _user(f"{prefix}{i}"), NOW - timedelta(days=1))
            db.session.commit()

    def count():
        with app.app_context(), _statements(app) as recorded:
            push = _push(NOW)
        return push["messageRecipients"]["total"], len(recorded)

    seed(3, "p789few")
    total3, statements3 = count()
    seed(27, "p789many")
    total30, statements30 = count()
    assert (total3, total30) == (3, 30)
    assert statements3 == statements30
