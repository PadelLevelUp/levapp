"""PAD-548 — calendar.event-detail rules 16–18 and notifications.invitations rule 19 (numbering
unconfirmed): each invitee shows one outcome, the coach's answer says who gave it, and the coach
can withdraw a live invitation.

A withdrawal is a third terminal outcome beside the student's "no" and the retire-by-fill: the
row is retired as `_close_vacancy` retires (bubble "Vaga preenchida"), `answer` stays NULL, and
every automatic path treats the student as declined for that occurrence. The vacancy stays open
and the decline follow-up asks the next candidate at once.
"""
import os
import threading
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, _seed
from padel_app.tests.test_pad497_a_no_is_final import _answer, _events, _instance, _io

_POSTGRES_ONLY = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="a lock is only visible with two real connections",
)


def _event_of(instance_id, player_id):
    from padel_app.models.notification_event import NotificationEvent

    return (NotificationEvent.query.filter_by(lesson_instance_id=instance_id, player_id=player_id)
            .order_by(NotificationEvent.id.desc()).first())


def _messages_to(player_id):
    from padel_app.models import ConversationParticipant, Message
    from padel_app.models.players import Player

    uid = Player.query.get(player_id).user_id
    convs = {c.conversation_id for c in ConversationParticipant.query.filter_by(user_id=uid).all()}
    return [m for m in Message.query.order_by(Message.id).all() if m.conversation_id in convs]


def _collect_publishes(monkeypatch):
    seen = []
    monkeypatch.setattr("padel_app.services.notification_service.publish",
                        lambda event, recipients: seen.append((event["type"], event.get("payload"), list(recipients))))
    monkeypatch.setattr("padel_app.services.notification_service.send_push_notification", lambda **kw: None)
    return seen


# ── rule 16: the outcome table ────────────────────────────────────────────────

@pytest.mark.parametrize("status,answer,withdrawn,vacancy_status,expected", [
    ("confirmed", "yes", None, "filled", "accepted"),
    ("expired", "no", None, "open", "declined"),
    ("expired", None, NOW, "open", "withdrawn"),
    ("sent", None, None, "open", "pending"),
    ("queued", None, None, "open", "pending"),
    ("expired", "yes", None, "filled", "spot_filled"),   # a late yes
    ("expired", None, None, "filled", "spot_filled"),    # retired because someone else took it
    ("expired", None, None, "expired", "expired"),       # the class started with nobody taking it
    ("expired", None, None, None, "expired"),            # a manual invitation that lapsed
])
def test_the_serializer_decides_the_outcome_in_rule_16s_order(status, answer, withdrawn, vacancy_status, expected):
    from padel_app.serializers.lesson import invitation_outcome

    vacancy = SimpleNamespace(status=vacancy_status) if vacancy_status else None
    event = SimpleNamespace(status=status, answer=answer, withdrawn_by_coach_at=withdrawn, vacancy=vacancy)
    assert invitation_outcome(event) == expected


def test_the_payload_carries_outcome_answer_and_who_answered(app, monkeypatch):
    from padel_app.models import Coach
    from padel_app.serializers.lesson import serialize_class_instance
    from padel_app.services.notification_service import coach_respond_to_notification, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=2, max_sim=3)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        coach_respond_to_notification(_event_of(instance_id, a).id, "no", coach_id, now=NOW + timedelta(minutes=1))
        _answer(instance_id, b, "yes", NOW + timedelta(minutes=1))
        rows = {int(r["playerId"]): r for r in
                serialize_class_instance(_instance(instance_id))["invitations"]}
    assert (rows[a]["outcome"], rows[a]["answer"], rows[a]["answeredBy"]) == ("declined", "no", "coach")
    assert (rows[b]["outcome"], rows[b]["answer"], rows[b]["answeredBy"]) == ("accepted", "yes", "student")


# ── rule 19: the withdrawal ───────────────────────────────────────────────────

def test_the_coach_withdraws_a_pending_invitation(app, monkeypatch):
    from padel_app.models import Message
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services.notification_service import trigger_invitations, withdraw_invitation
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad446_waiting_list_group_zero import _entry

    pin_clock(monkeypatch, NOW)
    seen = _collect_publishes(monkeypatch)
    with app.app_context():
        instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=1, max_sim=1)
        entry_id = _entry(instance_id, coach_id, a, NOW - timedelta(days=1))
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        event = _event_of(instance_id, a)
        assert event is not None and event.status == "sent", _events(instance_id)
        assert _event_of(instance_id, b) is None, "max_sim=1: one invitation out"
        before = len(_messages_to(a))
        seen.clear()

        result = withdraw_invitation(event.id, coach_id, now=NOW + timedelta(minutes=1))

        db.session.expire_all()
        event = _event_of(instance_id, a)
        assert result == {"action": "withdrawn"}
        assert (event.status, event.answer) == ("expired", None)
        assert event.withdrawn_by_coach_at is not None
        meta = Message.query.get(event.message_id).msg_metadata
        assert meta.get("responded") is True and meta.get("response") not in ("yes", "no"), meta
        assert db.session.get(WaitingListEntry, entry_id).is_active is False
        assert _events(instance_id)[0][0] is not None
        from padel_app.models.vacancy import Vacancy
        assert db.session.get(Vacancy, event.vacancy_id).status == "open"
        follow_up = _event_of(instance_id, b)
        assert follow_up is not None and follow_up.status == "sent" and follow_up.id > event.id, _events(instance_id)
        assert len(_messages_to(a)) == before, "the student gets no new message"
        responded = [p for t, p, _ in seen if t == "notification_responded"]
        assert any(p["notificationEventId"] == event.id and p["response"] == "withdrawn" for p in responded), seen


def test_a_withdrawn_student_is_not_asked_again_but_may_be_invited_by_hand(app, monkeypatch):
    from padel_app.services.invite_simulation_service import explain_player
    from padel_app.services.notification_service import (
        send_manual_notifications, trigger_invitations, withdraw_invitation,
    )
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=1, max_sim=1)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        withdraw_invitation(_event_of(instance_id, a).id, coach_id, now=NOW + timedelta(minutes=1))
        # The follow-up asked B; B declines, and the follow-up to THAT must not go back to A.
        _answer(instance_id, b, "no", NOW + timedelta(minutes=2))
        assert [p for _, p, _ in _events(instance_id)].count(a) == 1, _events(instance_id)
        instance = _instance(instance_id)
        from padel_app.models.vacancy import Vacancy
        departing = db.session.get(Vacancy, _events(instance_id)[0][0]).original_player_id
        assert explain_player(instance, coach_id, departing, a, now=NOW)["stage"] == "declined_this_class"
        manual = send_manual_notifications(instance_id, [a], coach_id)
        assert len(manual) == 1 and manual[0].status == "sent"


def test_a_late_yes_on_a_withdrawn_invitation_is_refused(app, monkeypatch):
    from padel_app.services.notification_service import trigger_invitations, withdraw_invitation
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=1, max_sim=1)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        withdraw_invitation(_event_of(instance_id, a).id, coach_id, now=NOW + timedelta(minutes=1))
        events_before, messages_before = _events(instance_id), len(_messages_to(a))

        result = _answer(instance_id, a, "yes", NOW + timedelta(minutes=2))

        db.session.expire_all()
        assert result["action"] == "spot_filled"
        assert a not in _instance(instance_id).enrolled_player_ids
        assert _events(instance_id) == events_before
        assert len(_messages_to(a)) == messages_before, "no decline notice, no waiting-list offer"
        event = _event_of(instance_id, a)
        assert (event.status, event.answer) == ("expired", None)


def test_a_withdrawal_that_is_not_live_writes_nothing(app, monkeypatch):
    from padel_app.models.coaches import Coach
    from padel_app.models.users import User
    from padel_app.services.notification_service import trigger_invitations, withdraw_invitation
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=2, max_sim=3)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        a_event, b_event = _event_of(instance_id, a), _event_of(instance_id, b)

        other = User(name="Other", username="other-548", email="other548@test.com", password="x", status="active")
        db.session.add(other); db.session.flush()
        other_coach = Coach(user_id=other.id); db.session.add(other_coach); db.session.commit()
        with pytest.raises(HTTPException) as e:
            withdraw_invitation(a_event.id, other_coach.id, now=NOW)
        assert e.value.code == 403

        # B first: A's yes below would retire B's invitation (same spot's batch) and make it
        # `spot_filled`, which is the no-op branch, not the repeated-delete one.
        first = withdraw_invitation(b_event.id, coach_id, now=NOW + timedelta(minutes=1))
        stamp = _event_of(instance_id, b).withdrawn_by_coach_at
        second = withdraw_invitation(b_event.id, coach_id, now=NOW + timedelta(minutes=2))
        db.session.expire_all()
        assert first == second == {"action": "withdrawn"}
        assert _event_of(instance_id, b).withdrawn_by_coach_at == stamp, "a repeated delete is a no-op"

        _answer(instance_id, a, "yes", NOW + timedelta(minutes=3))
        with pytest.raises(HTTPException) as e:
            withdraw_invitation(a_event.id, coach_id, now=NOW + timedelta(minutes=4))
        assert e.value.response.status_code == 409 and e.value.response.get_json()["code"] == "confirmed"
        db.session.expire_all()
        assert (_event_of(instance_id, a).status, _event_of(instance_id, a).withdrawn_by_coach_at) == ("confirmed", None)


def test_a_withdrawal_after_the_class_is_over_answers_expired(app, monkeypatch):
    from padel_app.services.notification_service import trigger_invitations, withdraw_invitation
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (a,) = _seed(enrolled=0, candidates=1, max_players=1)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        event = _event_of(instance_id, a)
        result = withdraw_invitation(event.id, coach_id, now=NOW + timedelta(days=2))
        db.session.expire_all()
        assert result == {"action": "expired"}
        assert (_event_of(instance_id, a).status, _event_of(instance_id, a).withdrawn_by_coach_at) == ("expired", None)


# ── rule 9: who answered ──────────────────────────────────────────────────────

def test_answers_say_who_gave_them(app, monkeypatch):
    from padel_app.services.notification_service import coach_respond_to_notification, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=2, max_sim=3)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        assert _event_of(instance_id, a).answered_by is None
        _answer(instance_id, a, "no", NOW + timedelta(minutes=1))
        coach_respond_to_notification(_event_of(instance_id, b).id, "yes", coach_id, now=NOW + timedelta(minutes=1))
        db.session.expire_all()
        assert _event_of(instance_id, a).answered_by == "student"
        assert _event_of(instance_id, b).answered_by == "coach"


# ── Postgres: a withdrawal racing the student's yes ───────────────────────────

@_POSTGRES_ONLY
def test_a_withdrawal_racing_a_yes_waits_for_the_lock_and_the_yes_wins(app, monkeypatch):
    """The yes holds rule 10's locks from its first read to its single commit; the withdrawal
    waits and then finds the invitation confirmed. Never enrolled-and-withdrawn. With the
    withdrawal's locks dropped (mutant), it writes under the yes and this cell goes red."""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.services import notification_service as ns
    from padel_app.services.notification_service import respond_to_notification, trigger_invitations, withdraw_invitation
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad493_starts_and_pacing import _race

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (a, b) = _seed(enrolled=0, candidates=2, max_players=1, max_sim=1)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        event_id = _event_of(instance_id, a).id
        user_id = Player.query.get(a).user_id

    in_locked_section, withdraw_attempted = threading.Event(), threading.Event()
    real_close = ns._close_vacancy

    def gated_close(*args, **kwargs):
        if threading.current_thread().name == "yes":
            in_locked_section.set()
            withdraw_attempted.wait(timeout=1.5)  # the withdrawal is now blocked on this yes's lock
        return real_close(*args, **kwargs)

    monkeypatch.setattr(ns, "_close_vacancy", gated_close)
    results = {}

    def yes():
        threading.current_thread().name = "yes"
        results["yes"] = respond_to_notification(event_id, "yes", user_id, now=NOW + timedelta(minutes=1))

    def withdraw():
        in_locked_section.wait(timeout=5)
        withdraw_attempted.set()
        results["withdraw"] = withdraw_invitation(event_id, coach_id, now=NOW + timedelta(minutes=1))

    with _io():
        _race(app, [yes, withdraw])
    with app.app_context():
        db.session.expire_all()
        event = db.session.get(NotificationEvent, event_id)
        assert results["withdraw"] == {"action": "confirmed"}, results
        assert results["yes"]["action"] == "confirmed", results
        assert a in _instance(instance_id).enrolled_player_ids
        assert (event.status, event.answer, event.withdrawn_by_coach_at) == ("confirmed", "yes", None)
