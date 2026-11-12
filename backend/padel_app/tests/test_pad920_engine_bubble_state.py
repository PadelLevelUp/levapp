"""A new-engine invitation's messages follow its state (notifications.invitations NB1, NB1a;
notifications.engine-store rule 8), through the outbox's senders (PAD-916, ``services/engine_outbox.py``)
and the store's state writes."""
from datetime import timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.snapshot import SpotType
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, _invited, _seed


@pytest.fixture(autouse=True)
def _context(app, monkeypatch):
    from padel_app.utils import expo_push, push_notifications

    monkeypatch.setattr(push_notifications, "send_push_notification", lambda **kw: None)
    monkeypatch.setattr(expo_push, "send_expo_push_to_user", lambda *a, **k: None)
    with app.app_context():
        yield


def _send():
    from padel_app.services.engine_outbox import send_effect
    from padel_app.services.engine_store import dispatch

    return dispatch(send_effect, now=NOW)


@pytest.mark.criterion("NOTIFICATIONS-INVITATIONS-118")
def test_the_invitation_messages_state_follows_the_engine(app, monkeypatch):
    """The student says Yes into a full session, joins the waiting list, has the invitation reopened on a
    new bubble, and the coach later withdraws it: the first message's state goes open → sorry → reopened,
    the new bubble's open → withdrawn, each change published once as ``message_edited`` for the messages
    the invitation holds."""
    from padel_app import realtime
    from padel_app.models import EngineInvitation, Message

    edited = []
    monkeypatch.setattr(realtime, "publish",
                        lambda event, users: edited.append(event["payload"]["id"]) if event["type"] == "message_edited" else None)
    store, (a,), (_, x, _) = _seed(app)

    def at(m):
        return NOW + timedelta(minutes=m)

    with store.unit((a,)):
        store.apply([_invited(a, x)])
    _send()
    [first] = Message.query.filter_by(message_type="notification_invite").all()

    def state(msg):
        db.session.refresh(msg)
        return msg.msg_metadata["state"]

    assert state(first) == "open"
    with store.unit((a,)):                                   # a Yes into a full session: sorry
        store.apply([fx.Sorry(a, at(1), x), fx.Message(a, at(1), x, "sorry"),
                     fx.WaitingListJoined(a, at(2), x, "students", None, "own")])
    _send()
    assert state(first) == "sorry" and edited == [first.id]
    with store.unit((a,)):                                   # reopened on a new bubble
        store.apply([fx.Reopened(a, at(3), x, frozenset({SpotType("L", 3)}), "L", 0, at(30)),
                     fx.Message(a, at(3), x, "waiting_list_invite")])
    _send()
    second = Message.query.filter(Message.message_type == "notification_invite", Message.id != first.id).one()
    assert (state(first), state(second)) == ("reopened", "open")
    assert db.session.get(EngineInvitation, store.invitation_id(a, x)).message_ids == [first.id, second.id]
    with store.unit((a,)):
        assert store.withdraw(store.invitation_id(a, x), at(4))
    assert (state(first), state(second)) == ("reopened", "withdrawn")
    assert edited == [first.id, first.id, second.id]
