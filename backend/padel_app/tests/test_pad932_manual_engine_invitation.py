"""PAD-932 (notifications.manual NM1, NM3; the owner's decision 17): on a new-engine class the coach's
Notificar sends the engine ``CoachInvites``. Each student gets one engine invitation of the coach's-list
tier, marked manual and counting, sent at once whatever the quiet hours, the window or the class's toggle;
the route still refuses what it refuses today and names the engine's own refusals. An old invitation's
Yes on a new-engine class tells the engine (``CoachAdded``).

``_seed`` (test_pad916_engine_store): one coach, a level-3 class at START, the first student its regular
on the left, the others right-siders; NOW is two hours before. A class of 2 then has one open right spot.
"""
from datetime import timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.snapshot import SpotType
from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed


@pytest.fixture(autouse=True)
def _context(app, monkeypatch):
    from padel_app.utils import expo_push, push_notifications

    app.config["JWT_SECRET_KEY"] = "test-secret"
    monkeypatch.setattr(push_notifications, "send_push_notification", lambda **kw: None)
    monkeypatch.setattr(expo_push, "send_expo_push_to_user", lambda *a, **k: None)
    pin_clock(monkeypatch, NOW)
    with app.app_context():
        yield


def _coach_user(store, session):
    from padel_app.models.coaches import Coach

    return db.session.get(Coach, store.coach_of(session)).user_id


def _notify(client, store, session, player_ids):
    token = create_access_token(identity=str(_coach_user(store, session)))
    body = {"model": "LessonInstance", "originalId": int(session), "playerIds": [int(p) for p in player_ids]}
    return client.post("/api/app/notify/manual", json=body, headers={"Authorization": f"Bearer {token}"})


def _row(session, student):
    from padel_app.models import EngineInvitation

    return EngineInvitation.query.filter_by(lesson_instance_id=int(session), player_id=int(student)).one_or_none()


def _rows(session, student):
    from padel_app.models import EngineInvitation

    return EngineInvitation.query.filter_by(lesson_instance_id=int(session), player_id=int(student)).count()


def _bubbles(student):
    from padel_app.models import Message
    from padel_app.models.players import Player

    user_id = db.session.get(Player, int(student)).user_id
    return [m for m in Message.query.filter_by(message_type="notification_invite").order_by(Message.id).all()
            if user_id in {p.user_id for p in m.conversation.participants} and m.sender_id != user_id]


def _old_events(session):
    from padel_app.models import NotificationEvent

    return NotificationEvent.query.filter_by(lesson_instance_id=int(session)).count()


def _coach_list_tier(session):
    from padel_app.services.engine_store import settings_for

    return next(i for i, t in enumerate(settings_for(session).tiers) if t.source == "coach_list")


def _quiet_closed_and_off(store, session):
    """Quiet hours now, the invitation window not yet open, and the class's automatic invitations off."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import get_or_create_config

    config = get_or_create_config(store.coach_of(session))
    config.quiet_hours_enabled, config.quiet_hours_start, config.quiet_hours_end = True, "17:00", "23:00"
    config.invitation_start_timing = {"type": "hours_before", "value": 1}
    db.session.get(LessonInstance, int(session)).notifications_enabled = False
    db.session.commit()


def _below_the_bar(store, student):
    """The student's level on the coach's ladder drops below the class's (level 3)."""
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.coach_levels import CoachLevel

    coach_id = Association_CoachPlayer.query.filter_by(player_id=int(student)).one().coach_id
    low = CoachLevel(coach_id=coach_id, label="N1", code="N1", display_order=1)
    db.session.add(low)
    db.session.flush()
    Association_CoachPlayer.query.filter_by(player_id=int(student)).one().level_id = low.id
    db.session.commit()


@pytest.mark.criterion("NOTIFICATIONS-MANUAL-12")
def test_a_manual_invitation_on_a_new_engine_class_is_an_engine_invitation(app, client):
    """The spec's student is a left-sider for an open left spot; here the sides are mirrored (``_seed``'s
    regular holds the left), which changes nothing the criterion checks."""
    from padel_app.invitation_engine import timeline
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.serializers.lesson import serialize_class_instance
    from padel_app.services.engine_store import TableStore

    store, (s,), (_, student) = _seed(app, players=2, side="right", capacity=2)
    _quiet_closed_and_off(store, s)
    _below_the_bar(store, student)

    res = _notify(client, store, s, [student])
    assert res.status_code == 200, res.get_json()
    assert res.get_json() == {"sent": 1, "blocked": []}

    row = _row(s, student)
    assert row is not None and row.manual is True
    assert row.tier == _coach_list_tier(s)
    assert row.counts_until is not None and row.counts_until > NOW
    [inv] = [i for i in TableStore(clock=lambda: NOW).snapshot(s).invitations if i.student == student]
    assert timeline.counting(inv, NOW)
    [bubble] = _bubbles(student)
    assert bubble.msg_metadata["invitationId"] == row.id and bubble.msg_metadata["kind"] == "invite"
    assert _old_events(s) == 0

    [listed] = serialize_class_instance(db.session.get(LessonInstance, int(s)))["invitations"]
    assert listed["playerId"] == student and listed["tierSource"] is None


@pytest.mark.criterion("NOTIFICATIONS-MANUAL-13")
def test_what_a_manual_invitation_on_a_new_engine_class_refuses(app, client):
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence

    store, (s, other), pids = _seed(app, starts=(START, START), players=6, side="right", capacity=2)
    regular, holder, elsewhere, left_only, blocker, _ = pids
    _quiet_closed_and_off(store, s)          # the engine's own re-plan sends nothing: only the manual path is under test
    level = store.snapshot(s).level
    with store.unit((s,)):
        store.apply([fx.Invited(s, NOW, holder, frozenset({SpotType("R", level)}), None, 0,
                                NOW + timedelta(minutes=30))])
    db.session.add(Presence(lesson_instance_id=int(other), player_id=int(elsewhere), status="present"))
    Association_CoachPlayer.query.filter_by(player_id=int(left_only)).one().side = "left"
    db.session.get(Player, int(blocker)).user.notif_block_manual_invitations = True
    db.session.commit()

    res = _notify(client, store, s, [holder, regular, elsewhere, left_only, blocker])
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert body["sent"] == 0
    causes = {b["playerId"]: b.get("cause") for b in body["blocked"]}
    assert {k: v for k, v in causes.items() if k != int(blocker)} == {
        int(holder): "already_invited", int(regular): "already_in_class",
        int(elsewhere): "same_hour", int(left_only): "no_open_spot"}
    assert int(blocker) in causes                               # today's preference cause
    assert _rows(s, holder) == 1
    assert [p for p in (regular, elsewhere, left_only, blocker) if _row(s, p) is not None] == []
    assert _old_events(s) == 0

    db.session.add(Presence(lesson_instance_id=int(s), player_id=int(pids[5]), status="present",
                            assigned_side="right"))
    db.session.commit()
    full = _notify(client, store, s, [left_only])
    assert full.status_code == 409
    assert full.get_json() == {"error": "NO_OPEN_SPOT", "code": "NO_OPEN_SPOT"}


@pytest.mark.criterion("NOTIFICATIONS-MANUAL-14")
def test_a_manual_invitation_reopens_one_that_stopped_counting(app, client):
    store, (s,), (_, stopped, said_no, withdrawn) = _seed(app, players=4, side="right", capacity=2)
    level = store.snapshot(s).level
    offer = frozenset({SpotType("R", level)})
    with store.unit((s,)):
        store.apply([fx.Invited(s, NOW - timedelta(hours=2), p, offer, None, 2, NOW - timedelta(hours=1))
                     for p in (stopped, said_no, withdrawn)])
    _row(s, said_no).answer, _row(s, said_no).answered_at = "no", NOW - timedelta(minutes=30)
    _row(s, withdrawn).closed_at, _row(s, withdrawn).closed_reason = NOW - timedelta(minutes=30), "withdrawn"
    db.session.commit()

    res = _notify(client, store, s, [stopped, said_no, withdrawn])
    assert res.status_code == 200, res.get_json()
    assert res.get_json()["sent"] == 3
    for p in (stopped, said_no, withdrawn):
        assert _rows(s, p) == 1
        row = _row(s, p)
        assert (row.manual, row.tier, row.answer, row.closed_at) == (True, _coach_list_tier(s), None, None)
        assert row.counts_until > NOW
        assert _bubbles(p)[-1].msg_metadata["invitationId"] == row.id


@pytest.mark.criterion("NOTIFICATIONS-MANUAL-15")
def test_an_old_invitations_yes_on_a_new_engine_class_tells_the_engine(app):
    from padel_app.models import NotificationEvent
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.services.notification_service import _send_system_message, respond_to_notification

    store, (s, other), (_, student) = _seed(app, starts=(START, START), players=2, side="right", capacity=2)
    level = store.snapshot(other).level
    with store.unit((other,)):
        store.apply([fx.Invited(other, NOW, student, frozenset({SpotType("R", level)}), None, 0,
                                NOW + timedelta(minutes=30))])
    coach_id = store.coach_of(s)
    event = NotificationEvent(coach_id=coach_id, lesson_instance_id=int(s), player_id=int(student),
                              type="manual", round_number=1, status="sent")
    db.session.add(event)
    db.session.flush()
    user_id = db.session.get(Player, int(student)).user_id
    msg = _send_system_message(db.session.get(Coach, coach_id).user_id, user_id, "Vens?",
                               message_type="notification_invite", push=False,
                               msg_metadata={"notificationEventId": event.id, "lessonInstanceId": int(s),
                                             "responded": False})
    event.message_id = msg.id
    db.session.commit()

    respond_to_notification(event.id, "yes", user_id)

    from padel_app.models.presences import Presence
    assert Presence.query.filter_by(lesson_instance_id=int(s), player_id=int(student)).one() is not None
    elsewhere = _row(other, student)
    assert (elsewhere.closed_reason, elsewhere.closed_at is not None) == ("same_hour", True)


@pytest.mark.criterion("NOTIFICATIONS-MANUAL-1")
def test_a_counting_engine_invitation_is_not_invited_twice_by_hand(app, client):
    """The new-engine half of MANUAL-1 (rule 9 as NM1 restates it); the old-engine half is
    test_pad612_repeated_notifications."""
    store, (s,), (_, ana, bruno) = _seed(app, players=3, side="right", capacity=3)
    level = store.snapshot(s).level
    with store.unit((s,)):
        store.apply([fx.Invited(s, NOW, ana, frozenset({SpotType("R", level)}), None, 0,
                                NOW + timedelta(minutes=30))])
    db.session.commit()

    res = _notify(client, store, s, [ana, bruno])
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert body["sent"] == 1
    assert [(b["playerId"], b["cause"]) for b in body["blocked"]] == [(int(ana), "already_invited")]
    assert [b.get("playerName") or b.get("name") for b in body["blocked"]] != [None]
    assert _rows(s, ana) == 1 and _row(s, bruno) is not None
