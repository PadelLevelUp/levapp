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


@pytest.mark.xfail(strict=True, reason=(
    "PAD-612 R1 → PAD-620: send_manual_notifications has no live-invitation check (invitations rule 18 lives "
    "only in the engine's candidate path), so a second manual notify stacks a second live "
    "invitation, message and push on the same occurrence."
))
def test_a_second_manual_notify_does_not_stack_a_second_live_invitation(app, monkeypatch):
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        instance_id, coach_id, _, (a,) = _seed(enrolled=0, candidates=1, max_players=2)
        ns.send_manual_notifications(instance_id, [a], coach_id)
        ns.send_manual_notifications(instance_id, [a], coach_id)
        assert _live_invitations(instance_id, a) == 1


@pytest.mark.xfail(strict=True, reason=(
    "PAD-612 R2 → PAD-620: the dashboard's 'notify pending' nudge re-sends a full new invitation through "
    "send_manual_notifications on every press, with no spacing, stacking live invitations."
))
def test_the_notify_pending_nudge_twice_leaves_one_live_invitation(app, monkeypatch):
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


@pytest.mark.xfail(strict=True, reason=(
    "PAD-612 R3 → PAD-621: respond_to_waiting_list sends the waiting_list_confirm message on every 'yes', "
    "although the entry upsert is idempotent (waiting-list rule 12), so a double tap confirms twice."
))
def test_a_second_yes_on_a_waiting_list_offer_sends_no_second_confirmation(app):
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
