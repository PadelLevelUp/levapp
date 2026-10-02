"""
PAD-497 (invitations rule 18, absorbing PAD-494): a student's "no" is final for that class
occurrence, and a student holds at most one live automatic offer per occurrence.

Each cell says what the code before PAD-497 did, so the 2×2 (old/new × declined/not declined) on
one-spot and two-spot classes reads straight off the file: cells marked OLD-RED fail on #507's code.
"""
from datetime import timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import (
    NOW,
    PATCHES,
    _live_events,
    _seed,
    _vacancies,
)


def _io():
    import contextlib

    stack = contextlib.ExitStack()
    for target in PATCHES:
        stack.enter_context(patch(target))
    return stack


def _instance(instance_id):
    from padel_app.models.lesson_instances import LessonInstance

    return db.session.get(LessonInstance, instance_id)


def _events(instance_id):
    """Every invitation of the class in send order: (vacancy, player, status)."""
    from padel_app.models.notification_event import NotificationEvent

    return [(e.vacancy_id, e.player_id, e.status) for e in
            NotificationEvent.query.filter_by(lesson_instance_id=instance_id).order_by(NotificationEvent.id)]


def _answer(instance_id, player_id, action, when):
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.services.notification_service import respond_to_notification

    event = (NotificationEvent.query.filter_by(lesson_instance_id=instance_id, player_id=player_id)
             .order_by(NotificationEvent.id.desc()).first())
    return respond_to_notification(event.id, action, Player.query.get(player_id).user_id, now=when)


def _tick(monkeypatch, minutes):
    from padel_app.services.notification_service import process_invitation_batches
    from padel_app.tests.helpers import pin_clock

    t = pin_clock(monkeypatch, NOW + timedelta(minutes=minutes))
    process_invitation_batches(now=t)
    return t


# ── one spot ─────────────────────────────────────────────────────────────────────────────────

def test_one_spot_declined_a_later_round_does_not_ask_again(app, monkeypatch):
    """OLD-RED. Two rounds, one offer at a time: both students decline round 1; round 2 used to ask
    the first decliner again (rule 8 allowed it in a later round)."""
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, candidates = _seed(enrolled=0, candidates=2, max_players=1, groups=2, max_sim=1)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        first = _events(instance_id)[0][1]
        _answer(instance_id, first, "no", NOW + timedelta(minutes=1))
        second = _events(instance_id)[1][1]
        _answer(instance_id, second, "no", NOW + timedelta(minutes=2))
        for m in (4, 6, 8):
            _tick(monkeypatch, m)
        assert [e[1] for e in _events(instance_id)] == [first, second]
        assert _vacancies(instance_id)[0][1] == "expired"


def test_one_spot_not_declined_a_student_who_said_no_to_another_class_is_still_asked(app, monkeypatch):
    """Green before and after: the key is the class occurrence. A "no" to one class says nothing
    about another (here, the same students on a second class of the same coach)."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, candidates = _seed(enrolled=0, candidates=1, max_players=1)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        _answer(instance_id, candidates[0], "no", NOW + timedelta(minutes=1))

        a = _instance(instance_id)
        b = LessonInstance(lesson_id=a.lesson_id, start_datetime=a.start_datetime + timedelta(days=7),
                           end_datetime=a.end_datetime + timedelta(days=7), max_players=1,
                           status="scheduled", level_id=a.level_id, notifications_enabled=True)
        db.session.add(b)
        db.session.flush()
        from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance

        db.session.add(Association_CoachLessonInstance(coach_id=coach_id, lesson_instance_id=b.id))
        db.session.commit()
        trigger_invitations(b, coach_id, now=b.start_datetime - timedelta(hours=10))
        assert NotificationEvent.query.filter_by(lesson_instance_id=b.id, player_id=candidates[0]).count() == 1


def test_a_coach_recorded_no_is_final_too(app, monkeypatch):
    """OLD-RED. The coach records the student's "no" (rule 9); round 2 must not ask them again."""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services.notification_service import coach_respond_to_notification, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, candidates = _seed(enrolled=0, candidates=1, max_players=1, groups=2)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        event = NotificationEvent.query.filter_by(lesson_instance_id=instance_id).one()
        coach_respond_to_notification(event.id, "no", coach_id, now=NOW + timedelta(minutes=1))
        for m in (4, 6, 8, 130, 132):
            _tick(monkeypatch, m)
        assert NotificationEvent.query.filter_by(lesson_instance_id=instance_id).count() == 1


def test_a_yes_after_the_students_own_no_enrols_nobody(app, monkeypatch):
    """OLD-RED. The late yes used to enrol the decliner while the spot was open."""
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, candidates = _seed(enrolled=0, candidates=2, max_players=1)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        decliner = _events(instance_id)[0][1]
        _answer(instance_id, decliner, "no", NOW + timedelta(minutes=1))
        result = _answer(instance_id, decliner, "yes", NOW + timedelta(minutes=2))
        assert result["action"] == "declined"
        assert decliner not in _instance(instance_id).enrolled_player_ids
        assert _vacancies(instance_id)[0][1] == "open"


def test_the_coach_can_still_invite_a_decliner_by_hand(app, monkeypatch):
    """Green before and after: a manual invite is the coach's decision, not the engine's."""
    from padel_app.services.notification_service import send_manual_notifications, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, candidates = _seed(enrolled=0, candidates=1, max_players=1)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        _answer(instance_id, candidates[0], "no", NOW + timedelta(minutes=1))
        sent = send_manual_notifications(instance_id, [candidates[0]], coach_id)
        assert len(sent) == 1 and sent[0].type == "manual"


def test_the_automatic_waiting_list_fill_skips_a_decliner(app, monkeypatch):
    """OLD-RED. The student said no to the invitation and is on the class's waiting list: the next
    automatic fill must not place them."""
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, candidates = _seed(enrolled=0, candidates=1, max_players=1, groups=2)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        _answer(instance_id, candidates[0], "no", NOW + timedelta(minutes=1))
        db.session.add(WaitingListEntry(lesson_instance_id=instance_id, player_id=candidates[0],
                                        coach_id=coach_id, is_active=True))
        db.session.commit()
        for m in (4, 6, 8):
            _tick(monkeypatch, m)
        assert candidates[0] not in _instance(instance_id).enrolled_player_ids


# ── two spots ────────────────────────────────────────────────────────────────────────────────

def test_two_spots_not_declined_one_live_offer_per_student(app, monkeypatch):
    """OLD-RED (PAD-494). Two spots, the same three students: nobody holds two live invitations."""
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, candidates = _seed(enrolled=0, candidates=3, max_players=2)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        players = [p for _, p in _live_events(instance_id)]
        assert len(players) == len(set(players)) == 3


def test_two_spots_declined_the_sibling_spot_never_asks_them(app, monkeypatch):
    """OLD-RED. Three students, two spots: the first spot asks all three, the second (skipping
    them while their offers are live) waits. Two decline; the third takes the first spot. The second
    spot must not ask the two decliners."""
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, candidates = _seed(enrolled=0, candidates=3, max_players=2)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        first_spot = _vacancies(instance_id)[0][0]
        asked = [p for v, p, _ in _events(instance_id) if v == first_spot]
        _answer(instance_id, asked[0], "no", NOW + timedelta(minutes=1))
        _answer(instance_id, asked[1], "no", NOW + timedelta(minutes=2))
        for m in (4, 6, 130, 132):
            _tick(monkeypatch, m)
        second_spot = _vacancies(instance_id)[1][0]
        assert {p for v, p, _ in _events(instance_id) if v == second_spot} & {asked[0], asked[1]} == set()


def test_two_spots_a_student_whose_offer_was_retired_is_asked_for_the_other_spot(app, monkeypatch):
    """The starvation cell (PAD-494). Two spots; the only other student holds an offer for the first
    spot, so the second waits. Someone else takes the first spot, which retires that offer without a
    "no": the second spot asks them on the next pass. OLD: they already held both offers."""
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, candidates = _seed(enrolled=0, candidates=2, max_players=2, max_sim=3)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        first_spot, second_spot = (v[0] for v in _vacancies(instance_id))
        # Both students were asked for the first spot; the second has nobody free to ask.
        assert {p for v, p in _live_events(instance_id) if v == second_spot} == set()
        winner, other = [p for v, p in _live_events(instance_id) if v == first_spot]
        _answer(instance_id, winner, "yes", NOW + timedelta(minutes=1))
        _tick(monkeypatch, 3)
        assert [(v, p) for v, p in _live_events(instance_id)] == [(second_spot, other)]


# ── what the coach sees ──────────────────────────────────────────────────────────────────────

def test_the_explanation_names_both_skips_and_the_picker_marks_the_decliner(app, monkeypatch):
    """Rule 18: the invite explanation gives `declined_this_class` for the student who said no and
    `offered_another_spot` for one holding a live offer for another spot; the manual picker marks
    the decliner (selectable) and nobody else."""
    from padel_app.services.invite_simulation_service import explain_player
    from padel_app.services.notification_service import get_notification_groups, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, enrolled_users, others = _seed(enrolled=1, candidates=2, max_players=2)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)   # the open place asks both
        decliner, holder = others
        _answer(instance_id, decliner, "no", NOW + timedelta(minutes=1))

        from padel_app.models.players import Player

        departing = Player.query.filter_by(user_id=enrolled_users[0]).one().id
        instance = _instance(instance_id)
        assert explain_player(instance, coach_id, departing, decliner, now=NOW)["stage"] == "declined_this_class"
        assert explain_player(instance, coach_id, departing, holder, now=NOW)["stage"] == "offered_another_spot"

        flags = {p["id"]: p["declinedThisClass"]
                 for g in get_notification_groups("LessonInstance", instance_id, None, coach_id)
                 for p in g["players"]}
        assert flags.get(str(decliner)) is True
        assert all(v is False for k, v in flags.items() if k != str(decliner))


@pytest.mark.parametrize("max_inactive", [True, False])
def test_a_started_spot_waiting_on_a_sibling_offer_is_asked_again_on_the_next_tick(app, monkeypatch, max_inactive):
    """Starvation, started spot. Two spots, three students, one offer at a time: the first spot
    asks A, the second asks B. B and then C decline the second spot, whose only remaining
    candidate, A, holds the first spot's offer: it waits with nothing of its own out. The first
    spot is then taken by someone else, retiring A's offer. The second spot must ask A on the next
    tick: not after maxInactiveTime, and not never (with it off)."""
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (a, b, c) = _seed(enrolled=0, candidates=3, max_players=2, max_sim=1,
                                                   max_inactive=max_inactive)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        first, second = (v[0] for v in _vacancies(instance_id))
        assert sorted(_live_events(instance_id)) == [(first, a), (second, b)]

        # B declines the second spot: its follow-up finds A (offer on the first) and C (free).
        _answer(instance_id, b, "no", NOW + timedelta(minutes=1))
        assert (second, c) in _live_events(instance_id)
        # C declines too: the second spot's only remaining candidate, A, holds the first spot's offer.
        _answer(instance_id, c, "no", NOW + timedelta(minutes=2))
        assert [e for e in _live_events(instance_id) if e[0] == second] == []
        assert next(v for v in _vacancies(instance_id) if v[0] == second)[1] == "open"   # waiting

        # The first spot is taken by someone else (the coach adds a student): A's offer is retired.
        from padel_app.services.notification_service import _close_vacancy
        from padel_app.models.vacancy import Vacancy

        _close_vacancy(db.session.get(Vacancy, first), None)
        db.session.commit()
        assert _live_events(instance_id) == []

        _tick(monkeypatch, 4)
        assert _live_events(instance_id) == [(second, a)]
