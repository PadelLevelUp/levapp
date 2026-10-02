"""
PAD-495: the items that message people. Red tests first (items 4, 2, 8, 10 of the ticket).
"""
import contextlib
from datetime import timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, PATCHES, _live_events, _seed, _vacancies


def _io():
    stack = contextlib.ExitStack()
    for target in PATCHES:
        stack.enter_context(patch(target))
    return stack


def _instance(instance_id):
    from padel_app.models.lesson_instances import LessonInstance

    return db.session.get(LessonInstance, instance_id)


def _event_for(instance_id, player_id):
    from padel_app.models.notification_event import NotificationEvent

    return (NotificationEvent.query.filter_by(lesson_instance_id=instance_id, player_id=player_id)
            .order_by(NotificationEvent.id.desc()).first())


def _user(player_id):
    from padel_app.models.players import Player

    return Player.query.get(player_id).user_id


def test_item_4_a_losing_students_repeated_yes_sends_nothing_more(app, monkeypatch):
    """Two students asked for one spot; A takes it. B's "yes" is told the spot is filled and offered
    the waiting list, once. B's second "yes" must send nothing: no second "spot filled", no second
    waiting-list offer."""
    from padel_app.models import Message
    from padel_app.services.notification_service import respond_to_notification, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=1)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        respond_to_notification(_event_for(instance_id, a).id, "yes", _user(a), now=NOW + timedelta(minutes=1))
        first = respond_to_notification(_event_for(instance_id, b).id, "yes", _user(b), now=NOW + timedelta(minutes=2))
        assert first["action"] == "spot_filled_waiting_list_offered"
        messages = Message.query.count()

        second = respond_to_notification(_event_for(instance_id, b).id, "yes", _user(b), now=NOW + timedelta(minutes=3))
        assert second["action"] == "spot_filled_waiting_list_offered"
        assert Message.query.count() == messages


def test_item_2_the_coach_recording_yes_twice_keeps_the_invitation_confirmed(app, monkeypatch):
    """The coach records a student's "yes" (rule 9), then records it again (double click, retry):
    the student keeps the spot and the invitation stays confirmed."""
    from padel_app.services.notification_service import coach_respond_to_notification, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (a, _b) = _seed(enrolled=0, candidates=2, max_players=1)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        event_id = _event_for(instance_id, a).id
        assert coach_respond_to_notification(event_id, "yes", coach_id, now=NOW + timedelta(minutes=1))["action"] == "confirmed"
        again = coach_respond_to_notification(event_id, "yes", coach_id, now=NOW + timedelta(minutes=2))
        assert again["action"] == "confirmed"
        assert _event_for(instance_id, a).status == "confirmed"
        assert a in _instance(instance_id).enrolled_player_ids


def _failing_second_send(monkeypatch):
    """The second invitation message of a batch raises (a failed send)."""
    from padel_app.services import notification_service as ns

    real = ns._send_system_message
    calls = {"n": 0}

    def flaky(*args, **kwargs):
        if kwargs.get("message_type") == "notification_invite":
            calls["n"] += 1
            if calls["n"] == 2:
                raise RuntimeError("send failed")
        return real(*args, **kwargs)

    monkeypatch.setattr(ns, "_send_system_message", flaky)
    return real


def test_item_8_a_failed_send_leaves_no_live_invitation_without_its_message(app, monkeypatch):
    """A batch whose second message fails: the second student must not be left holding a live
    invitation they never received (a phantom, excluded from the retry as already invited)."""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=5, max_players=1)
        _failing_second_send(monkeypatch)
        with pytest.raises(RuntimeError):
            trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        phantoms = NotificationEvent.query.filter(
            NotificationEvent.lesson_instance_id == instance_id,
            NotificationEvent.status.in_(("sent", "queued")),
            NotificationEvent.message_id.is_(None),
        ).count()
        assert phantoms == 0


def test_item_10_the_retry_after_a_failed_send_keeps_to_max_simultaneous(app, monkeypatch):
    """After the failed batch, the next tick restarts the spot. The students already holding a live
    invitation count toward maxSimultaneous (3): never more than 3 live for the spot."""
    from padel_app.services import notification_service as ns
    from padel_app.services.notification_service import process_invitation_batches, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=6, max_players=1)
        real = _failing_second_send(monkeypatch)
        with pytest.raises(RuntimeError):
            trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        monkeypatch.setattr(ns, "_send_system_message", real)
        tick = pin_clock(monkeypatch, NOW + timedelta(minutes=2))
        process_invitation_batches(now=tick)
        spot = _vacancies(instance_id)[0][0]
        assert len([e for e in _live_events(instance_id) if e[0] == spot]) <= 3


def test_item_9_a_batch_the_daily_limit_skipped_entirely_is_not_counted(app, monkeypatch):
    """Every candidate has used today's invitation allowance, so the batch sends nothing. It must
    not count as a batch: the spot stays unstarted (batch 0, no claim), so it is tried again on later
    ticks."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services.notification_service import process_invitation_batches, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, others = _seed(enrolled=0, candidates=2, max_players=1)
        cfg = NotificationConfig.query.filter_by(coach_id=coach_id).one()
        cfg.restrictions = {**cfg.get_restrictions(),
                            "maxInvitesPerStudentPerDay": {"enabled": True, "value": 1}}
        for pid in others:   # each already had today's one invitation (another class, unanswered)
            db.session.add(NotificationEvent(coach_id=coach_id, lesson_instance_id=instance_id, player_id=pid,
                                             type="manual", round_number=1, status="expired"))
        db.session.commit()

        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        assert _vacancies(instance_id) == [(1, "open", 1, 0)]
        tick = pin_clock(monkeypatch, NOW + timedelta(minutes=2))
        process_invitation_batches(now=tick)
        assert _vacancies(instance_id) == [(1, "open", 1, 0)]
        from padel_app.models.vacancy import Vacancy

        assert Vacancy.query.one().last_activity_at is None
