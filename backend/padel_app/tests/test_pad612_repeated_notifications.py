"""PAD-612 (investigation: every way a student can be notified twice for the same thing).

One strict-xfail cell per repeat the investigation classed as "fix" and could prove in code. Each
asserts the behaviour that should hold, fails on staging today (12fc5c8da), and turns green — so
its strict mark must be removed — in the ticket that fixes it. Counts are of the student's live
invitations or of the coach's chat messages to them: every such message is also a web push and an
Expo push (`_send_system_message`), so one message more is one notification more on every channel.
"""
from datetime import timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, START, _seed
from padel_app.tests.test_pad497_a_no_is_final import _io


def _live_invitations(instance_id, player_id):
    from padel_app.models.notification_event import NotificationEvent

    return NotificationEvent.query.filter(
        NotificationEvent.lesson_instance_id == instance_id,
        NotificationEvent.player_id == player_id,
        NotificationEvent.status.in_(("sent", "queued")),
    ).count()


def test_a_second_manual_notify_does_not_stack_a_second_live_invitation(app, monkeypatch):
    """PAD-612 R1, fixed by PAD-620 (invitations rule 18)."""
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        instance_id, coach_id, _, (a,) = _seed(enrolled=0, candidates=1, max_players=2)
        ns.send_manual_notifications(instance_id, [a], coach_id)
        ns.send_manual_notifications(instance_id, [a], coach_id)
        assert _live_invitations(instance_id, a) == 1


def test_the_notify_pending_nudge_twice_leaves_one_live_invitation(app, monkeypatch):
    """PAD-612 R2, fixed by PAD-620: the nudge re-pushes the invitation the student holds."""
    from padel_app.helpers.dashboard.pending import notify_pending_confirmations
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        instance_id, coach_id, _, (a,) = _seed(enrolled=0, candidates=1, max_players=2)
        ns.send_manual_notifications(instance_id, [a], coach_id)
        day_before = START - timedelta(days=1)  # the class is "tomorrow"
        assert notify_pending_confirmations(coach_id=coach_id, now=day_before)["sent"] == 1
        notify_pending_confirmations(coach_id=coach_id, now=day_before)
        assert _live_invitations(instance_id, a) == 1


def test_a_second_yes_on_a_waiting_list_offer_sends_no_second_confirmation(app):
    """PAD-612 R3, fixed by PAD-621: the confirmation is for the place, not the tap."""
    from padel_app.models import Message
    from padel_app.services.notification_service import respond_to_waiting_list
    from padel_app.tests.test_waiting_list_offer_response import PATCHES as WL_PATCHES, _seed as wl_seed, _send_offer

    with app.app_context():
        ids = wl_seed("p612")
        with patch(WL_PATCHES[0]), patch(WL_PATCHES[1]):
            _send_offer(ids)
            coach_user_id, instance_id, player_user_id = ids["coach_user_id"], ids["instance"].id, ids["player_user_id"]
            assert respond_to_waiting_list(instance_id, "yes", player_user_id)["action"] == "added_to_waiting_list"
            after_first = Message.query.filter_by(sender_id=coach_user_id).count()
            respond_to_waiting_list(instance_id, "yes", player_user_id)
            assert Message.query.filter_by(sender_id=coach_user_id).count() == after_first


def test_the_manual_notify_route_names_a_student_who_already_holds_an_invitation(app, monkeypatch):
    """PAD-620: the coach is told by name, cause "already_invited", and nothing is sent to them."""
    from flask_jwt_extended import create_access_token

    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=3)
        ns.send_manual_notifications(instance_id, [a], coach_id)
        coach_user_id = db.session.get(Coach, coach_id).user_id
        app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
        token = create_access_token(identity=str(coach_user_id))
        with patch("padel_app.services.notification_service.publish"), patch(
            "padel_app.services.notification_service.send_push_notification"
        ):
            res = app.test_client().post(
                "/api/app/notify/manual",
                json={"model": "LessonInstance", "originalId": instance_id, "playerIds": [a, b]},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert res.status_code == 200, res.get_json()
        body = res.get_json()
        assert body["sent"] == 1
        assert [(e["playerId"], e["cause"]) for e in body["blocked"]] == [(a, "already_invited")]
        assert _live_invitations(instance_id, a) == 1 and _live_invitations(instance_id, b) == 1


def test_a_queued_invitation_counts_as_live_for_the_manual_skip(app, monkeypatch):
    """PAD-620 (notifications.manual rule 9): live is `sent` OR `queued`."""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        instance_id, coach_id, _, (a,) = _seed(enrolled=0, candidates=1, max_players=2)
        db.session.add(NotificationEvent(coach_id=coach_id, lesson_instance_id=instance_id, player_id=a,
                                         type="auto", round_number=1, status="queued"))
        db.session.commit()
        assert ns.send_manual_notifications(instance_id, [a], coach_id) == []
        assert [e["cause"] for e in ns.already_invited_players(instance_id, [a])] == ["already_invited"]


def test_a_late_yes_on_a_filled_spot_sends_no_offer_message_and_no_push(app, monkeypatch):
    """OLD-RED (PAD-621, owner D4): a late yes posted a separate waiting-list offer message (and its
    push) on top of the bubble that already offers the list (rule 15a)."""
    from padel_app.models import Message
    from padel_app.models.players import Player
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    pushes = []
    with app.app_context(), _io():
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: pushes.append(kw))
        monkeypatch.setattr("padel_app.utils.expo_push.send_expo_push_to_user", lambda *a, **kw: pushes.append(kw))
        instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=1)
        ns.send_manual_notifications(instance_id, [a, b], coach_id)
        ev_a = [e for e in ns.NotificationEvent.query.filter_by(lesson_instance_id=instance_id, player_id=a)][0]
        ev_b = [e for e in ns.NotificationEvent.query.filter_by(lesson_instance_id=instance_id, player_id=b)][0]
        assert ns.coach_respond_to_notification(ev_a.id, "yes", coach_id, now=NOW + timedelta(minutes=1)) == {"action": "confirmed"}
        db.session.expire_all()
        assert Message.query.get(ev_b.message_id).msg_metadata["response"] == "spot_filled", "the fill retired her bubble"
        messages_before, pushes_before = Message.query.count(), len(pushes)
        late = ns.respond_to_notification(ev_b.id, "yes", Player.query.get(b).user_id, now=NOW + timedelta(minutes=2))
        assert late["action"] in ("spot_filled", "spot_filled_waiting_list_offered", "expired")
        assert Message.query.filter_by(message_type="waiting_list_offer").count() == 0
        assert Message.query.count() == messages_before and len(pushes) == pushes_before


def test_the_fill_retires_the_losers_bubble_live_without_a_push_or_a_message(app, monkeypatch):
    """PIN of owner D4's first half (already true since PAD-609): the fill edits the loser's bubble to
    spot_filled (a live message_edited) — no push to them and no new message for them."""
    from padel_app.models import Message
    from padel_app.models.players import Player
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    pushes, edited = [], []
    with app.app_context(), _io():
        instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=1)
        ns.trigger_invitations(ns.LessonInstance.query.get(instance_id), coach_id, now=NOW)
        ev_a = ns.NotificationEvent.query.filter_by(lesson_instance_id=instance_id, player_id=a).one()
        ev_b = ns.NotificationEvent.query.filter_by(lesson_instance_id=instance_id, player_id=b).one()
        loser_user = Player.query.get(b).user_id
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: pushes.append(kw["user_id"]))
        monkeypatch.setattr("padel_app.utils.expo_push.send_expo_push_to_user", lambda user_id, **kw: pushes.append(user_id))
        monkeypatch.setattr(ns, "publish", lambda event, users: edited.append((event.get("type"), (event.get("payload") or {}).get("id"))))
        loser_messages = Message.query.filter(Message.conversation_id == Message.query.get(ev_b.message_id).conversation_id).count()
        assert ns.respond_to_notification(ev_a.id, "yes", Player.query.get(a).user_id, now=NOW + timedelta(minutes=1)) == {"action": "confirmed"}
        db.session.expire_all()
        assert Message.query.get(ev_b.message_id).msg_metadata["response"] == "spot_filled"
        assert ("message_edited", ev_b.message_id) in edited, "the bubble flips live"
        assert loser_user not in pushes, "no push to the student who lost the spot"
        assert Message.query.filter(Message.conversation_id == Message.query.get(ev_b.message_id).conversation_id).count() == loser_messages
