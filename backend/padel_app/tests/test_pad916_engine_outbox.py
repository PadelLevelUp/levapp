"""PAD-916: the new engine's outbox senders (``services/engine_outbox.py``, swap plan step 6).

Each effect the engine applies goes out through ``dispatch(send_effect)`` as the message a person
receives: the invitation bubble (invitations NB1), the sorry, the waiting-list placement and the side set
(NB5; message-templates new-engine section), the attendance request (today's reminder), and the coach's
alert (dashboard.blocks NA3, in ``test_pad920_dashboard_engine_alert.py``). The sessions are seeded through
the table store's own test helper.
"""
from datetime import timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.snapshot import SpotType
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _invited, _seed  # noqa: F401


@pytest.fixture(autouse=True)
def _context(app):
    with app.app_context():
        yield


@pytest.fixture()
def pushes(monkeypatch):
    """Every push the senders deliver, as (user id, title or body)."""
    from padel_app.utils import expo_push, push_notifications

    out = []
    monkeypatch.setattr(push_notifications, "send_push_notification", lambda **kw: out.append(kw["user_id"]))
    monkeypatch.setattr(expo_push, "send_expo_push_to_user", lambda user_id, *a, **k: out.append(user_id))
    return out


def _send():
    from padel_app.services.engine_outbox import send_effect
    from padel_app.services.engine_store import dispatch

    return dispatch(send_effect, now=NOW)


def _messages(message_type):
    from padel_app.models import Message

    return Message.query.filter_by(message_type=message_type).order_by(Message.id).all()


def _user_of(pid):
    from padel_app.models.players import Player

    return db.session.get(Player, int(pid)).user_id


def test_an_invitation_goes_out_as_its_bubble(app, pushes):
    """Invitations NB1: an ``Invited`` is one ``notification_invite`` message to the student, its metadata
    ``{engine: "new", invitationId, lessonInstanceId, kind: "invite", state: "open", startsAt, countsUntil}``,
    kept on the invitation (``message_ids``); a reopened invitation's ``waiting_list_invite`` is a new
    bubble of the same invitation. Sending again adds nothing."""
    from padel_app.models import EngineInvitation

    store, (a,), (_, x, _) = _seed(app)
    with store.unit((a,)):                                   # a pool tier (the default tiers' third)
        store.apply([fx.Invited(a, NOW, x, frozenset({SpotType("L", 1)}), None, 2, NOW + timedelta(minutes=20))])
    assert _send() == 1
    [msg] = _messages("notification_invite")
    inv = db.session.get(EngineInvitation, store.invitation_id(a, x))
    assert {k: msg.msg_metadata.get(k) for k in ("engine", "invitationId", "lessonInstanceId", "kind", "state",
                                                  "startsAt", "countsUntil")} == {
        "engine": "new", "invitationId": inv.id, "lessonInstanceId": int(a), "kind": "invite", "state": "open",
        "startsAt": START.isoformat(), "countsUntil": inv.counts_until.isoformat()}
    assert inv.message_ids == [msg.id] and _user_of(x) in pushes

    with store.unit((a,)):
        store.apply([fx.Sorry(a, NOW + timedelta(minutes=1), x),
                     fx.Reopened(a, NOW + timedelta(minutes=2), x, frozenset({SpotType("L", 3)}), "L", 0,
                                 NOW + timedelta(minutes=30)),
                     fx.Message(a, NOW + timedelta(minutes=2), x, "waiting_list_invite")])
    _send()
    bubbles = _messages("notification_invite")
    assert len(bubbles) == 2 and bubbles[1].msg_metadata["kind"] == "waiting_list_invite"
    assert db.session.get(EngineInvitation, inv.id).message_ids == [msg.id, bubbles[1].id]
    assert _send() == 0 and len(_messages("notification_invite")) == 2


def test_the_sorry_the_placement_and_the_side_go_out_as_their_messages(app, pushes):
    """Invitations NB5, message-templates N1-N2: the sorry is a ``waiting_list_offer`` message
    ``{engine, invitationId, lessonInstanceId}``; an automatic entry an ``added_to_class`` from
    ``waiting_list_added``; a side set an ``engine_side_moved`` ``{engine, lessonInstanceId, side}`` from
    ``side_moved``, ``{sideName}`` filled."""
    store, (a,), (_, x, y) = _seed(app)
    with store.unit((a,)):
        store.apply([_invited(a, x), fx.Placed(a, NOW, y, "R", "auto_from_waiting_list")])
    _send()
    with store.unit((a,)):
        store.apply([fx.Sorry(a, NOW + timedelta(minutes=1), x), fx.Message(a, NOW + timedelta(minutes=1), x, "sorry"),
                     fx.Message(a, NOW + timedelta(minutes=1), y, "added"),
                     fx.Message(a, NOW + timedelta(minutes=2), y, "side_moved")])
    _send()
    [sorry] = _messages("waiting_list_offer")
    assert sorry.msg_metadata == {"engine": "new", "invitationId": store.invitation_id(a, x), "lessonInstanceId": int(a)}
    [added] = _messages("added_to_class")
    assert added.msg_metadata["engine"] == "new" and added.msg_metadata["lessonInstanceId"] == int(a)
    assert "lista de espera" in added.text and "{" not in added.text
    [moved] = _messages("engine_side_moved")
    assert moved.msg_metadata == {"engine": "new", "lessonInstanceId": int(a), "side": "right"}
    assert "lado direito" in moved.text and "{" not in moved.text


def test_an_attendance_request_is_todays_reminder(app, pushes):
    """An ``AttendanceRequested`` is today's ``notification_reminder`` to the student (``reminder``, then
    ``reminder_followup``), linked to the store's attempt for that send; the older unanswered one is
    retired."""
    from padel_app.models import ReminderAttempt

    store, (a,), (reg, _, _) = _seed(app)
    for minute in (0, 60):
        with store.unit((a,)):
            store.apply([fx.AttendanceRequested(a, NOW + timedelta(minutes=minute), reg)])
        _send()
    first, second = _messages("notification_reminder")
    assert (first.msg_metadata["reminderNumber"], second.msg_metadata["reminderNumber"]) == (1, 2)
    attempts = ReminderAttempt.query.filter_by(lesson_instance_id=int(a), player_id=int(reg)).order_by(ReminderAttempt.number).all()
    assert [t.message_id for t in attempts] == [first.id, second.id]
    assert attempts[0].superseded and not attempts[1].superseded

