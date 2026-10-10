"""PAD-609 — notifications.invitations rule 15a (coordinator for the owner, 2026-10-10): an invitation
ends as "Vaga preenchida" (`response: "spot_filled"`) whenever the spot was filled — by another
student's yes, by the coach's recorded yes, by any enrolment that closes it — and a manual invitation
(no vacancy) is retired the same way once the class is full. The bubble then offers the waiting list,
and a student who held the invitation may join it even with the coach's open spots hidden.

"expired" stays for the class starting and for the coach's withdrawal (581 owns the withdrawal's
bubble). Cells marked OLD-RED fail on staging before this change.
"""
from datetime import timedelta

import pytest
from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, _seed
from padel_app.tests.test_pad497_a_no_is_final import _instance, _io
from padel_app.tests.test_pad548_coach_withdraws_invitation import _event_of


def _bubble(event):
    from padel_app.models import Message

    return Message.query.get(event.message_id).msg_metadata


def _auto_two(max_players=1):
    """Two candidates invited automatically to one spot (vacancy invitations)."""
    from padel_app.services.notification_service import trigger_invitations

    instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=max_players)
    trigger_invitations(_instance(instance_id), coach_id, now=NOW)
    return instance_id, coach_id, a, b


def _manual_two():
    """Two candidates invited by hand to one spot (no vacancy)."""
    from padel_app.services.notification_service import send_manual_notifications

    instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=1)
    events = send_manual_notifications(instance_id, [a, b], coach_id)
    assert len(events) == 2 and all(e.vacancy_id is None for e in events)
    return instance_id, coach_id, a, b


def test_a_coach_recorded_yes_retires_the_others_as_spot_filled(app, monkeypatch):
    """OLD-RED: `_close_vacancy` wrote "expired", which offers nothing."""
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        instance_id, coach_id, a, b = _auto_two()
        winner, other = _event_of(instance_id, a), _event_of(instance_id, b)
        assert ns.coach_respond_to_notification(winner.id, "yes", coach_id, now=NOW + timedelta(minutes=1)) == {"action": "confirmed"}
        db.session.expire_all()
        assert _bubble(other)["response"] == "spot_filled"
        assert _event_of(instance_id, b).status == "expired"


def test_a_students_yes_retires_the_others_as_spot_filled(app, monkeypatch):
    """Already true through `_broadcast_spot_filled`; pinned so the close path cannot drift back."""
    from padel_app.models.players import Player
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        instance_id, coach_id, a, b = _auto_two()
        winner = _event_of(instance_id, a)
        assert ns.respond_to_notification(winner.id, "yes", Player.query.get(a).user_id, now=NOW + timedelta(minutes=1)) == {"action": "confirmed"}
        db.session.expire_all()
        assert _bubble(_event_of(instance_id, b))["response"] == "spot_filled"


@pytest.mark.parametrize("by", ["coach", "student"])
def test_a_fill_retires_the_classs_live_manual_invitations(app, monkeypatch, by):
    """OLD-RED: a manual invitation has no vacancy, so no close touched it — its buttons stayed
    live on a full class."""
    from padel_app.models.players import Player
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        instance_id, coach_id, a, b = _manual_two()
        winner = _event_of(instance_id, a)
        if by == "coach":
            result = ns.coach_respond_to_notification(winner.id, "yes", coach_id, now=NOW + timedelta(minutes=1))
        else:
            result = ns.respond_to_notification(winner.id, "yes", Player.query.get(a).user_id, now=NOW + timedelta(minutes=1))
        assert result == {"action": "confirmed"}
        db.session.expire_all()
        loser = _event_of(instance_id, b)
        assert loser.status == "expired"
        assert _bubble(loser)["response"] == "spot_filled"
        assert _bubble(_event_of(instance_id, a))["response"] == "yes"  # the winner's own is spared


def test_a_manual_invitation_stays_live_while_the_class_has_room(app, monkeypatch):
    """The retire runs only when no place is left: one yes on a two-place class leaves the other open."""
    from padel_app.services import notification_service as ns
    from padel_app.services.notification_service import send_manual_notifications
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=2)
        send_manual_notifications(instance_id, [a, b], coach_id)
        ns.coach_respond_to_notification(_event_of(instance_id, a).id, "yes", coach_id, now=NOW + timedelta(minutes=1))
        db.session.expire_all()
        other = _event_of(instance_id, b)
        assert other.status == "sent" and not _bubble(other).get("responded")


def test_a_withdrawal_and_a_started_class_still_read_expired(app, monkeypatch):
    """Not fills: the coach's withdrawal and the class starting keep "expired" (581 owns the former)."""
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        instance_id, coach_id, a, b = _auto_two(max_players=2)
        ns.withdraw_invitation(_event_of(instance_id, a).id, coach_id, now=NOW + timedelta(minutes=1))
        db.session.expire_all()
        assert _bubble(_event_of(instance_id, a))["response"] == "expired"
        ns._expire_stale_invitations(_instance(instance_id))
        db.session.commit()
        db.session.expire_all()
        assert _bubble(_event_of(instance_id, b))["response"] == "expired"


def _join(player_id, instance_id):
    from padel_app.models.players import Player
    from padel_app.services.academy_class_service import join_class_waiting_list_service

    return join_class_waiting_list_service(db.session.get(Player, player_id), "LessonInstance", instance_id, None, now=NOW + timedelta(minutes=2))


def test_an_invited_student_joins_the_waiting_list_with_open_spots_hidden(app, monkeypatch):
    """OLD-RED (not_visible): the coach's open spots are hidden (the default), yet the student who
    lost the spot was shown the class by the invitation itself."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        instance_id, coach_id, a, b = _auto_two()
        assert not ns.effective_open_spots_visible(_instance(instance_id), coach_id, NotificationConfig.query.filter_by(coach_id=coach_id).first())
        ns.coach_respond_to_notification(_event_of(instance_id, a).id, "yes", coach_id, now=NOW + timedelta(minutes=1))
        entry, created = _join(b, instance_id)
        assert created and entry.is_active and entry.lesson_instance_id == instance_id


def test_visibility_still_hides_the_list_from_a_student_never_invited_or_who_said_no(app, monkeypatch):
    from padel_app.models.players import Player
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        instance_id, coach_id, _, (a, b, c) = _seed(enrolled=0, candidates=3, max_players=1)
        ns.send_manual_notifications(instance_id, [a, b], coach_id)
        ns.respond_to_notification(_event_of(instance_id, b).id, "no", Player.query.get(b).user_id, now=NOW + timedelta(minutes=1))
        ns.coach_respond_to_notification(_event_of(instance_id, a).id, "yes", coach_id, now=NOW + timedelta(minutes=1))
        for player_id in (b, c):  # b said no (rule 18), c was never invited
            with pytest.raises(HTTPException) as e:
                _join(player_id, instance_id)
            assert e.value.response.get_json()["code"] == "not_visible"


def test_an_unanswered_invitation_outlives_max_inactive_time_and_the_next_round(app, monkeypatch):
    """Rule 5/8 (owner, 2026-10-10): nobody's silence ends an invitation. Past maxInactiveTime the
    next round goes out beside it, it is not sent again, and its yes still takes the spot."""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        monkeypatch.setattr(ns, "send_push_notification", lambda **kw: None)
        instance_id, coach_id, _, cands = _seed(enrolled=0, candidates=4, max_players=1, groups=2, max_sim=1)
        ns.trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        first = NotificationEvent.query.filter_by(lesson_instance_id=instance_id).one()
        later = NOW + timedelta(minutes=121)
        pin_clock(monkeypatch, later)
        ns.process_invitation_batches(now=later)
        db.session.expire_all()
        events = NotificationEvent.query.filter_by(lesson_instance_id=instance_id).order_by(NotificationEvent.id).all()
        assert len(events) >= 2, "the next batch went out"
        assert db.session.get(NotificationEvent, first.id).status == "sent", "the first is still live"
        assert [e.player_id for e in events].count(first.player_id) == 1, "and was not sent again"
        assert ns.respond_to_notification(first.id, "yes", Player.query.get(first.player_id).user_id,
                                          now=later + timedelta(minutes=1)) == {"action": "confirmed"}
