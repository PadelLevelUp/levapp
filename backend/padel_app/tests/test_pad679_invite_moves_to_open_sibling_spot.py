"""
PAD-679 (invitations rule 18): when a spot closes, a live invitation that also fits another open spot
of the same class moves to that spot instead of being retired ("Vaga preenchida") and re-sent.

Repro first (the ticket asks for it before any fix): these cells are expected RED on staging 4ba53e151.
"""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, _live_events, _seed, _vacancies
from padel_app.tests.test_pad497_a_no_is_final import _answer, _events, _instance, _io, _tick


def test_repro_a_yes_on_the_first_spot_moves_the_other_invitations_to_the_second(app, monkeypatch):
    """The real case of 15/10: two spots, three students asked for the first, the second waits on
    them (rule 18, offered_another_spot). One says yes to the first spot. Expected: the other two keep
    their live invitation, now for the second spot; nobody is told "spot filled" or asked again."""
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, candidates = _seed(enrolled=0, candidates=3, max_players=2, max_sim=3)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        first_spot, second_spot = (v[0] for v in _vacancies(instance_id))
        asked = [p for v, p in _live_events(instance_id) if v == first_spot]
        assert len(asked) == 3 and [p for v, p in _live_events(instance_id) if v == second_spot] == []

        winner, *others = asked
        _answer(instance_id, winner, "yes", NOW + timedelta(minutes=1))
        _tick(monkeypatch, 3)

        events = _events(instance_id)
        # No new invitation was sent, and nobody's invitation ended.
        assert len(events) == 3, events
        assert sorted(p for v, p in _live_events(instance_id)) == sorted(others)
        assert {v for v, p in _live_events(instance_id)} == {second_spot}


# ── the conditions of rule 18a, on PAD-581's sided class (4 places, 1 left + 1 right going,
#    open spots: one left, one right; default groups: round 1 asks the spot's own side) ─────────

from padel_app.tests.test_pad581_side_rebalance import _bubble, _event, _invite, _patch_io, _setup  # noqa: E402


def _close(spot, winner_event_id=None):
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import _close_vacancy

    retired = _close_vacancy(db.session.get(Vacancy, spot.id), None, except_event_id=winner_event_id)
    db.session.commit()
    return {e.id for e in retired}


def test_a_student_of_the_other_side_is_not_moved(app, monkeypatch):
    """Ana (left) holds the left spot's offer; the right spot's round 1 asks only right players, so
    it would not have asked her: her offer ends as before, "spot_filled"."""
    _patch_io(monkeypatch)
    with app.app_context():
        coach, instance, spots, players = _setup("a")
        ana = _invite(coach, instance, spots["left"], players["ana"])
        assert _close(spots["left"]) == {ana}
        assert _event(ana).status == "expired" and _bubble(ana)["response"] == "spot_filled"


def test_a_both_sided_student_moves_to_the_free_spot_with_no_new_message(app, monkeypatch):
    """Carla plays both sides: the right spot (no offer of its own) would have asked her, so her
    left-spot offer moves there — same invitation, same message, `vacancyId` updated, not retired."""
    from padel_app.models import Message

    _patch_io(monkeypatch)
    with app.app_context():
        coach, instance, spots, players = _setup("b")
        carla = _invite(coach, instance, spots["left"], players["carla"])
        messages = Message.query.count()
        assert _close(spots["left"]) == set()
        moved = _event(carla)
        assert (moved.status, moved.vacancy_id) == ("sent", spots["right"].id)
        assert _bubble(carla)["vacancyId"] == spots["right"].id and not _bubble(carla).get("responded")
        assert Message.query.count() == messages


def test_nothing_moves_into_a_spot_with_offers_of_its_own(app, monkeypatch):
    """D1.1 / the ticket's "Ana is both" row: the right spot already asked Rui, so Carla's offer is not
    moved into it (no overtaking); it ends as "spot_filled" and Rui's is untouched."""
    _patch_io(monkeypatch)
    with app.app_context():
        coach, instance, spots, players = _setup("c")
        rui = _invite(coach, instance, spots["right"], players["rui"])
        carla = _invite(coach, instance, spots["left"], players["carla"])
        assert _close(spots["left"]) == {carla}
        assert (_event(rui).status, _event(rui).vacancy_id) == ("sent", spots["right"].id)


@pytest.mark.parametrize("gate", ["approval_pending", "window_ahead"])
def test_nothing_moves_into_a_spot_that_cannot_send_now(app, monkeypatch, gate):
    """C6: a spot awaiting semi-automatic approval, or approved for a window still ahead, would not
    send now, so it takes nothing: moving into it would bypass the coach's approval."""
    from datetime import datetime, timedelta

    _patch_io(monkeypatch)
    with app.app_context():
        coach, instance, spots, players = _setup(f"d{gate[0]}")
        if gate == "approval_pending":
            spots["right"].approval_status = "pending"
        else:
            spots["right"].invite_not_before = datetime.utcnow() + timedelta(hours=3)
        db.session.commit()
        carla = _invite(coach, instance, spots["left"], players["carla"])
        assert _close(spots["left"]) == {carla}


def test_a_waiting_list_invitation_moves_only_to_a_spot_of_its_own_side(app, monkeypatch):
    """Owner, 2026-10-21 (rule 18a item 6): a group-0 invitation names its spot's side, so Carla's
    waiting-list offer for the left spot does not move to the right one."""
    _patch_io(monkeypatch)
    with app.app_context():
        coach, instance, spots, players = _setup("e")
        carla = _invite(coach, instance, spots["left"], players["carla"], round_number=0)
        assert _close(spots["left"]) == {carla}


def test_a_balance_withdrawal_moves_the_invitation_when_another_spot_would_ask(app, monkeypatch):
    """D5: the left spot withdraws Ana's round-1 offer for balance (it no longer wants a left
    player), but another open spot of the class is a left spot with nothing out: her offer moves
    there instead of reading "Já não é preciso deste lado"."""
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import _withdraw_for_balance

    _patch_io(monkeypatch)
    with app.app_context():
        coach, instance, spots, players = _setup("f")
        ana = _invite(coach, instance, spots["left"], players["ana"])
        spots["right"].side = "left"   # the class's other open spot asks left players now
        db.session.commit()
        withdrawn = _withdraw_for_balance(db.session.get(Vacancy, spots["left"].id), coach.id, "left")
        db.session.commit()
        assert withdrawn == []
        moved = _event(ana)
        assert (moved.status, moved.vacancy_id, moved.retired_reason) == ("sent", spots["right"].id, None)


def test_a_balance_withdrawal_with_nowhere_to_go_is_withdrawn_as_before(app, monkeypatch):
    """D5's control: no other open spot would ask Ana (the other spot is a right one), so she is
    withdrawn for balance as before PAD-679."""
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import SIDE_BALANCED, _withdraw_for_balance

    _patch_io(monkeypatch)
    with app.app_context():
        coach, instance, spots, players = _setup("g")
        ana = _invite(coach, instance, spots["left"], players["ana"])
        withdrawn = _withdraw_for_balance(db.session.get(Vacancy, spots["left"].id), coach.id, "left")
        db.session.commit()
        assert [e.id for e in withdrawn] == [ana]
        assert _event(ana).retired_reason == SIDE_BALANCED


# ── the engine around a move (two spots, three students, no sides) ─────────────────────────────

def test_the_receiving_spot_keeps_the_invitations_clock_and_batch(app, monkeypatch):
    """C1 / C3: the moved invitations were sent at NOW; the move happens at NOW+20. The second spot's
    maxInactiveTime counts from NOW (its `last_activity_at` is the first spot's batch stamp) and the
    moved invitations are its current batch; nothing new is sent on the next ticks."""
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=3, max_players=2, max_sim=3)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        first, second = (v[0] for v in _vacancies(instance_id))
        stamp = db.session.get(Vacancy, first).last_activity_at
        winner = [p for v, p in _live_events(instance_id) if v == first][0]
        _answer(instance_id, winner, "yes", NOW + timedelta(minutes=20))
        receiving = db.session.get(Vacancy, second)
        assert receiving.last_activity_at == stamp and receiving.current_batch_number >= 1
        for m in (22, 24):
            _tick(monkeypatch, m)
        assert len(_events(instance_id)) == 3


def test_after_a_move_the_next_yes_takes_the_second_spot_and_the_last_offer_ends(app, monkeypatch):
    """Ticket test 7: after the move, one student's yes takes the second spot; the class is full, so
    the third student's offer ends as "spot_filled" and nobody is asked again."""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=3, max_players=2, max_sim=3)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        first, second = (v[0] for v in _vacancies(instance_id))
        winner, ana, joao = [p for v, p in _live_events(instance_id) if v == first]
        _answer(instance_id, winner, "yes", NOW + timedelta(minutes=1))
        _answer(instance_id, ana, "yes", NOW + timedelta(minutes=2))
        assert {winner, ana} <= set(_instance(instance_id).enrolled_player_ids)
        assert [v[1] for v in _vacancies(instance_id)] == ["filled", "filled"]
        last = NotificationEvent.query.filter_by(lesson_instance_id=instance_id, player_id=joao).one()
        assert last.status == "expired"
        _tick(monkeypatch, 4)
        assert len(_events(instance_id)) == 3


def test_a_coach_recorded_yes_moves_the_others_too(app, monkeypatch):
    """D2: the coach recording the yes for a student closes the spot through the same routine."""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services.notification_service import coach_respond_to_notification, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=3, max_players=2, max_sim=3)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        first, second = (v[0] for v in _vacancies(instance_id))
        winner, *others = [p for v, p in _live_events(instance_id) if v == first]
        event = NotificationEvent.query.filter_by(lesson_instance_id=instance_id, player_id=winner).one()
        coach_respond_to_notification(event.id, "yes", coach_id, now=NOW + timedelta(minutes=1))
        assert sorted(_live_events(instance_id)) == sorted((second, p) for p in others)
        assert len(_events(instance_id)) == 3


def test_a_waiting_list_invitation_of_a_side_less_spot_moves(app, monkeypatch):
    """D3: a group-0 invitation whose spot has no side moves under the same rule, and stays group 0."""
    from padel_app.models import Message
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.models.vacancy import Vacancy
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services.notification_service import (
        _close_vacancy, _get_or_create_direct_conversation, trigger_invitations,
    )
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, candidates = _seed(enrolled=0, candidates=1, max_players=2, max_sim=3,
                                                     max_inactive=False)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        first, second = (v[0] for v in _vacancies(instance_id))
        event = NotificationEvent.query.filter_by(lesson_instance_id=instance_id).one()
        assert event.vacancy_id == first
        event.round_number = 0  # as a group-0 (waiting-list) invitation of the first spot
        db.session.add(WaitingListEntry(lesson_instance_id=instance_id, player_id=candidates[0],
                                        coach_id=coach_id, is_active=True))
        db.session.commit()
        _close_vacancy(db.session.get(Vacancy, first), None)
        db.session.commit()
        moved = NotificationEvent.query.filter_by(lesson_instance_id=instance_id).one()
        assert (moved.status, moved.vacancy_id, moved.round_number) == ("sent", second, 0)
