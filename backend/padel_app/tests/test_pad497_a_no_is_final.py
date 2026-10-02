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


def test_a_spot_held_up_in_an_early_round_moves_on_to_the_next_group(app, monkeypatch):
    """Rule 18's wait must not hold a spot in an early invitation group: students who only a later
    group admits would never be asked while the early group's candidates sit on another spot's
    unanswered offers. Two left-side spots; three left-side students and one right-side student;
    round 1 requires the spot's side, round 2 is open. The first spot asks the three left players;
    the second, finding them all on the first spot's offers, moves to round 2 and asks the right
    player on the next tick."""
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (a, b, c, d) = _seed(enrolled=0, candidates=4, max_players=2, groups=2)
        cfg = NotificationConfig.query.filter_by(coach_id=coach_id).one()
        cfg.invitation_groups = [
            {"id": "1", "rules": [{"attribute": "side", "operation": "same_as_vacancy"}]},
            {"id": "2", "rules": []},
        ]
        for pid, side in ((a, "left"), (b, "left"), (c, "left"), (d, "right")):
            Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=pid).one().side = side
        spots = [Vacancy(lesson_instance_id=instance_id, coach_id=coach_id, status="open", side="left",
                         current_round_number=1, current_batch_number=0) for _ in range(2)]
        db.session.add_all(spots)
        db.session.commit()
        first, second = (v.id for v in spots)

        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        assert sorted(p for v, p in _live_events(instance_id) if v == first) == sorted([a, b, c])
        _tick(monkeypatch, 2)
        _tick(monkeypatch, 4)
        assert [p for v, p in _live_events(instance_id) if v == second] == [d]


# ── #513 review F1: the wait counts only holders this round would otherwise ask ──────────────

def _sided_class(app, *, spots, groups, sides, max_sim=1, exclude=()):
    """A class with `spots` open left-side spots; students with the given sides; invitation
    groups: 1 = round 1 requires the spot's side, 2 = round 1 sided then round 2 open."""
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.vacancy import Vacancy

    instance_id, coach_id, _, players = _seed(enrolled=0, candidates=len(sides), max_players=spots,
                                              groups=groups, max_sim=max_sim)
    cfg = NotificationConfig.query.filter_by(coach_id=coach_id).one()
    sided = {"id": "1", "rules": [{"attribute": "side", "operation": "same_as_vacancy"}]}
    cfg.invitation_groups = [sided, {"id": "2", "rules": []}][:groups] if groups > 1 else [{"id": "1", "rules": []}]
    if exclude:
        cfg.restrictions = {**cfg.get_restrictions(),
                            "excludedPlayers": {"enabled": True, "playerIds": [str(p) for p in exclude]}}
    for pid, side in zip(players, sides):
        Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=pid).one().side = side
    rows = [Vacancy(lesson_instance_id=instance_id, coach_id=coach_id, status="open", side="left",
                    current_round_number=1, current_batch_number=0) for _ in range(spots)]
    db.session.add_all(rows)
    db.session.commit()
    return instance_id, coach_id, players, [r.id for r in rows]


def test_s1_two_spots_nobody_answers_a_later_group_student_is_still_asked(app, monkeypatch):
    """S1. Two spots; round 1 admits the left players A and B, round 2 everyone (C is right-side);
    one offer at a time; nobody answers. Each spot asks one of A/B; once the inactivity interval
    passes, a spot finds its round-1 students all holding offers and must move on to round 2 and
    ask C — not sit in round 1 until the class starts."""
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, (a, b, c), _ = _sided_class(app, spots=2, groups=2, sides=("left", "left", "right"))
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        assert sorted(p for _, p in _live_events(instance_id)) == sorted([a, b])
        for m in (121, 123, 125, 127):
            _tick(monkeypatch, m)
        assert c in [p for _, p in _live_events(instance_id)]


def test_s2_an_excluded_student_with_a_manual_invite_does_not_hold_round_1(app, monkeypatch):
    """S2. One spot; round 1 admits A and B (left), round 2 everyone. The coach excluded B from
    automatic invitations and invited B by hand. A declines: round 1 has nobody it would ask (B is
    excluded), so the spot moves to round 2 and asks C."""
    from padel_app.services.notification_service import send_manual_notifications, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, (a, b, c), _ = _sided_class(app, spots=1, groups=2, sides=("left", "left", "right"),
                                                           exclude=(2,))
        assert b == 2
        send_manual_notifications(instance_id, [b], coach_id)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        assert [p for v, p in _live_events(instance_id) if v is not None] == [a]
        _answer(instance_id, a, "no", NOW + timedelta(minutes=1))
        for m in (3, 5, 7):
            _tick(monkeypatch, m)
        assert c in [p for v, p in _live_events(instance_id) if v is not None]


def test_s3_one_group_an_excluded_holder_does_not_hold_the_spot_open(app, monkeypatch):
    """S3. One spot, ONE invitation group (round 1 is the last). B is excluded and holds a manual
    invitation; A is asked and declines. Nobody the round would ask is left, and B is someone it
    would never ask: the spot expires as before, instead of waiting until the class starts."""
    from padel_app.services.notification_service import send_manual_notifications, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, (a, b), (spot,) = _sided_class(app, spots=1, groups=1, sides=("left", "left"),
                                                             exclude=(2,))
        assert b == 2
        send_manual_notifications(instance_id, [b], coach_id)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        _answer(instance_id, a, "no", NOW + timedelta(minutes=1))
        for m in (3, 5):
            _tick(monkeypatch, m)
        assert _vacancies(instance_id)[0][1] == "expired"


@pytest.mark.skipif(
    __import__("os").getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="a lock is only visible with two real connections",
)
def test_f3_a_no_landing_between_a_yes_and_its_lock_wins(app, monkeypatch):
    """#513 review F3. The yes path commits (the invite message's save) before it takes rule 10's
    lock; a "no" on the same invitation landing in that gap must win: no enrolment, no
    confirmed invitation carrying answer "no"."""
    import threading

    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services import notification_service as ns
    from padel_app.services.notification_service import respond_to_notification, trigger_invitations
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad493_starts_and_pacing import _race

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, candidates = _seed(enrolled=0, candidates=2, max_players=1)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        student = _events(instance_id)[0][1]
        from padel_app.models.players import Player

        event_id = NotificationEvent.query.filter_by(lesson_instance_id=instance_id, player_id=student).one().id
        user_id = Player.query.get(student).user_id

    in_gap, no_done = threading.Event(), threading.Event()
    real_lock = ns._lock_vacancy_and_instance

    def gated_lock(vacancy, instance):
        if threading.current_thread().name == "yes":
            in_gap.set()
            no_done.wait(timeout=5)
        return real_lock(vacancy, instance)

    monkeypatch.setattr(ns, "_lock_vacancy_and_instance", gated_lock)

    def yes():
        threading.current_thread().name = "yes"
        respond_to_notification(event_id, "yes", user_id, now=NOW + timedelta(minutes=1))

    def no():
        in_gap.wait(timeout=5)
        try:
            respond_to_notification(event_id, "no", user_id, now=NOW + timedelta(minutes=1))
        finally:
            no_done.set()

    with _io():
        _race(app, [yes, no])
    with app.app_context():
        db.session.expire_all()
        event = db.session.get(NotificationEvent, event_id)
        assert student not in _instance(instance_id).enrolled_player_ids
        assert (event.status, event.answer) == ("expired", "no")


def test_f2_a_failed_send_leaves_no_phantom_to_hold_the_class(app, monkeypatch):
    """#513 review F2 (PAD-495 item 8, landed here): a batch whose second message fails must not
    leave that student holding a live invitation they never received — under rule 18 such a phantom
    would skip them for every spot of the class and could hold a spot until the class starts."""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services import notification_service as ns
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=5, max_players=1)
        real = ns._send_system_message
        calls = {"n": 0}

        def flaky(*args, **kwargs):
            if kwargs.get("message_type") == "notification_invite":
                calls["n"] += 1
                if calls["n"] == 2:
                    raise RuntimeError("send failed")
            return real(*args, **kwargs)

        monkeypatch.setattr(ns, "_send_system_message", flaky)
        with pytest.raises(RuntimeError):
            trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        assert NotificationEvent.query.filter(
            NotificationEvent.lesson_instance_id == instance_id,
            NotificationEvent.status.in_(("sent", "queued")),
            NotificationEvent.message_id.is_(None),
        ).count() == 0


# ── #513 re-review: no invitation without its message, on every path ────────────────────────

def _live_without_message(instance_id):
    from padel_app.models.notification_event import NotificationEvent

    return NotificationEvent.query.filter(
        NotificationEvent.lesson_instance_id == instance_id,
        NotificationEvent.status.in_(("sent", "queued")),
        NotificationEvent.message_id.is_(None),
    ).count()


def test_r1_a_manual_invitation_whose_message_fails_leaves_nothing_behind(app, monkeypatch):
    """Re-review item 1: the coach's manual invitation is committed with its message, never before
    it, so a failed send cannot leave a live invitation that holds the student (and a spot)."""
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (b,) = _seed(enrolled=0, candidates=1, max_players=1)

        def boom(*args, **kwargs):
            raise RuntimeError("send failed")

        monkeypatch.setattr(ns, "_send_system_message", boom)
        with pytest.raises(RuntimeError):
            ns.send_manual_notifications(instance_id, [b], coach_id)
        db.session.rollback()
        assert _live_without_message(instance_id) == 0


def test_r2_an_automatic_invitation_whose_message_is_withheld_is_discarded(app, monkeypatch):
    """Re-review item 2: `_send_system_message` returns None without raising when a backstop
    withholds the message (empty body PAD-67, availability PAD-107, block-all PAD-112). The
    invitation must then be discarded, not committed by the next student's message."""
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=3, max_players=1)
        real = ns._send_system_message
        calls = {"n": 0}

        def withheld_once(*args, **kwargs):
            if kwargs.get("message_type") == "notification_invite":
                calls["n"] += 1
                if calls["n"] == 1:
                    return None          # a backstop withheld the first student's message
            return real(*args, **kwargs)

        monkeypatch.setattr(ns, "_send_system_message", withheld_once)
        ns.trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        assert _live_without_message(instance_id) == 0
        assert len(_live_events(instance_id)) == 2


def test_r2_an_empty_invitation_body_sends_nothing_and_leaves_nothing(app, monkeypatch):
    """The PAD-67 backstop for real: a template that renders to nothing withholds the message."""
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=2, max_players=1)
        monkeypatch.setattr(ns, "_format_template", lambda *a, **k: "")
        ns.trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        assert _live_without_message(instance_id) == 0


def test_r3_a_manual_invitation_counts_for_the_skip(app, monkeypatch):
    """Re-review item 3 (mutant M4): a student already holding the coach's manual invitation for
    the class is not sent an automatic one on top."""
    from padel_app.services.notification_service import send_manual_notifications, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (b,) = _seed(enrolled=0, candidates=1, max_players=1)
        send_manual_notifications(instance_id, [b], coach_id)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        assert [v for v, _p in _live_events(instance_id)] == [None]


_POSTGRES_ONLY = pytest.mark.skipif(
    __import__("os").getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="a lock is only visible with two real connections",
)


def _manual_invitation(app):
    from padel_app.models.players import Player
    from padel_app.services.notification_service import send_manual_notifications
    from padel_app.tests.helpers import pin_clock  # noqa: F401

    with app.app_context(), _io():
        instance_id, coach_id, _, (b,) = _seed(enrolled=0, candidates=1, max_players=1)
        event = send_manual_notifications(instance_id, [b], coach_id)[0]
        return instance_id, event.id, Player.query.get(b).user_id, b


@_POSTGRES_ONLY
def test_r5_a_double_no_on_a_manual_invitation_is_answered_once(app, monkeypatch):
    """Re-review item 5 (mutant M8b): a manual invitation has no vacancy, so its answer locks the
    invitation row. Two "no" at once: the coach is told once."""
    import threading

    from padel_app.models import Message
    from padel_app.services import notification_service as ns
    from padel_app.services.notification_service import respond_to_notification
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad493_starts_and_pacing import _race

    pin_clock(monkeypatch, NOW)
    instance_id, event_id, user_id, _b = _manual_invitation(app)
    with app.app_context():
        before = Message.query.count()

    real = ns._repeated_answer
    gate = threading.Barrier(2)

    def gated(event, action, **kwargs):
        result = real(event, action, **kwargs)
        try:
            gate.wait(timeout=1.5)
        except threading.BrokenBarrierError:
            pass
        return result

    monkeypatch.setattr(ns, "_repeated_answer", gated)
    no = lambda: respond_to_notification(event_id, "no", user_id, now=NOW + timedelta(minutes=1))  # noqa: E731
    with _io():
        _race(app, [no, no])
    with app.app_context():
        assert Message.query.count() - before == 1     # one decline message to the coach


@_POSTGRES_ONLY
def test_r5_a_no_landing_in_a_manual_yes_gap_wins(app, monkeypatch):
    """F3 for a manual invitation: a "no" landing between the "yes"'s first commit and its lock
    wins — no enrolment."""
    import threading

    from padel_app.models.notification_event import NotificationEvent
    from padel_app.services import notification_service as ns
    from padel_app.services.notification_service import respond_to_notification
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad493_starts_and_pacing import _race

    pin_clock(monkeypatch, NOW)
    instance_id, event_id, user_id, b = _manual_invitation(app)
    in_gap, no_done = threading.Event(), threading.Event()
    real_lock = ns._lock_vacancy_and_instance

    def gated_lock(vacancy, instance):
        if threading.current_thread().name == "yes":
            in_gap.set()
            no_done.wait(timeout=5)
        return real_lock(vacancy, instance)

    monkeypatch.setattr(ns, "_lock_vacancy_and_instance", gated_lock)

    def yes():
        threading.current_thread().name = "yes"
        respond_to_notification(event_id, "yes", user_id, now=NOW + timedelta(minutes=1))

    def no():
        in_gap.wait(timeout=5)
        try:
            respond_to_notification(event_id, "no", user_id, now=NOW + timedelta(minutes=1))
        finally:
            no_done.set()

    with _io():
        _race(app, [yes, no])
    with app.app_context():
        db.session.expire_all()
        assert b not in _instance(instance_id).enrolled_player_ids
        assert db.session.get(NotificationEvent, event_id).answer == "no"
