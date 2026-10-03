"""
PAD-446 (owner decision 2026-10-03): the waiting list is invitation group 0.

notifications.waiting-list rules 4–4c, 13, 15–17 and notifications.invitations rule 8a: when a spot
opens, the class's waiting-list students are ASKED first — before the coach's groups, in the order
they joined (a standing entry's creation time for an entry it fanned out), paced like a group — and
nobody is enrolled from the list without saying yes. A yes spends the standing credit and closes
the entry in the accept's commit; a no is final for the class and closes that class's entry.
"""
from datetime import timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad493_invitations_run_twice import NOW, PATCHES, START, _seed


def _io():
    import contextlib

    stack = contextlib.ExitStack()
    for target in PATCHES:
        stack.enter_context(patch(target))
    return stack


def _entry(instance_id, coach_id, player_id, joined_at, *, standing=None):
    from padel_app.models.waiting_list_entry import WaitingListEntry

    e = WaitingListEntry(lesson_instance_id=instance_id, player_id=player_id, coach_id=coach_id,
                         is_active=True, joined_at=joined_at,
                         standing_entry_id=standing.id if standing is not None else None)
    db.session.add(e)
    db.session.commit()
    return e.id


def _standing(coach_id, player_id, created_at, *, credits=3, used=0):
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry

    s = StandingWaitingListEntry(coach_id=coach_id, player_id=player_id, credits_total=credits,
                                 credits_used=used, expires_at=NOW + timedelta(days=30),
                                 is_active=True, created_at=created_at)
    db.session.add(s)
    db.session.commit()
    return s


def _invites(instance_id):
    """(player_id, round_number) of every invitation for the class, in the order sent."""
    from padel_app.models.notification_event import NotificationEvent

    return [(e.player_id, e.round_number) for e in
            NotificationEvent.query.filter_by(lesson_instance_id=instance_id).order_by(NotificationEvent.id)]


def _enrolled(instance_id):
    from padel_app.models.lesson_instances import LessonInstance

    db.session.expire_all()
    return set(LessonInstance.query.get(instance_id).enrolled_player_ids)


def _trigger(instance_id, coach_id, now=NOW):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import trigger_invitations

    return trigger_invitations(LessonInstance.query.get(instance_id), coach_id, now=now)


def _event(instance_id, player_id):
    from padel_app.models.notification_event import NotificationEvent

    return NotificationEvent.query.filter_by(lesson_instance_id=instance_id, player_id=player_id).one()


def _user_of(player_id):
    from padel_app.models.players import Player

    return Player.query.get(player_id).user_id


def test_the_waiting_list_is_asked_first_in_join_order_and_paced_like_a_group(app, monkeypatch):
    """AC "The waiting list is asked first, in join order": three on the list, maxSimultaneous 1."""
    from padel_app.services.notification_service import process_invitation_batches
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (r0, r1, ana, bea, caio) = _seed(enrolled=0, candidates=5,
                                                                   max_players=1, max_sim=1)
        _entry(instance_id, coach_id, ana, NOW - timedelta(hours=4))                  # 10:00, own
        _entry(instance_id, coach_id, bea, NOW - timedelta(hours=3),                  # fanned out 11:00 ...
               standing=_standing(coach_id, bea, NOW - timedelta(hours=5)))           # ... standing 09:00
        _entry(instance_id, coach_id, caio, NOW - timedelta(hours=2))                 # 12:00, own

        _trigger(instance_id, coach_id)
        assert _invites(instance_id) == [(bea, 0)]
        assert not _enrolled(instance_id) & {ana, bea, caio}

        process_invitation_batches(now=NOW + timedelta(minutes=121))
        assert _invites(instance_id) == [(bea, 0), (ana, 0)]
        process_invitation_batches(now=NOW + timedelta(minutes=242))
        assert _invites(instance_id) == [(bea, 0), (ana, 0), (caio, 0)]

        process_invitation_batches(now=NOW + timedelta(minutes=363))
        fourth = _invites(instance_id)[3]
        assert fourth[0] in (r0, r1) and fourth[1] == 1, _invites(instance_id)
        assert not _enrolled(instance_id), "nobody is enrolled from the waiting list without a yes"


def test_several_on_the_list_are_asked_together_up_to_max_simultaneous(app, monkeypatch):
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (r0, r1, ana, bea) = _seed(enrolled=0, candidates=4, max_players=1, max_sim=3)
        _entry(instance_id, coach_id, ana, NOW - timedelta(hours=2))
        _entry(instance_id, coach_id, bea, NOW - timedelta(hours=1))

        _trigger(instance_id, coach_id)
        assert _invites(instance_id) == [(ana, 0), (bea, 0)]


def test_the_last_waiting_list_no_moves_on_to_the_groups_at_once_and_closes_the_entry(app, monkeypatch):
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services.notification_service import respond_to_notification
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (r0, ana) = _seed(enrolled=0, candidates=2, max_players=1, max_sim=1)
        entry_id = _entry(instance_id, coach_id, ana, NOW - timedelta(hours=1))
        _trigger(instance_id, coach_id)
        assert _invites(instance_id) == [(ana, 0)]

        respond_to_notification(_event(instance_id, ana).id, "no", _user_of(ana), now=NOW + timedelta(minutes=1))
        assert _invites(instance_id) == [(ana, 0), (r0, 1)]
        db.session.expire_all()
        assert db.session.get(WaitingListEntry, entry_id).is_active is False


@pytest.mark.parametrize("commit_fails", [False, True])
def test_a_waiting_list_yes_spends_the_credit_in_the_accepts_commit(app, monkeypatch, commit_fails):
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (bea,) = _seed(enrolled=0, candidates=1, max_players=1, max_sim=1)
        standing = _standing(coach_id, bea, NOW - timedelta(days=1))
        standing_id = standing.id
        entry_id = _entry(instance_id, coach_id, bea, NOW - timedelta(hours=1), standing=standing)
        _trigger(instance_id, coach_id)
        event_id = _event(instance_id, bea).id

        if commit_fails:
            real_add = ns._add_player_to_instance

            def failing(player_id, instance):
                monkeypatch.setattr(db.session, "commit", lambda: (_ for _ in ()).throw(RuntimeError("commit failed")))
                try:
                    return real_add(player_id, instance)
                finally:
                    monkeypatch.undo()
                    pin_clock(monkeypatch, NOW)

            monkeypatch.setattr(ns, "_add_player_to_instance", failing)
            with pytest.raises(RuntimeError):
                ns.respond_to_notification(event_id, "yes", _user_of(bea), now=NOW + timedelta(minutes=1))
            db.session.rollback()
        else:
            ns.respond_to_notification(event_id, "yes", _user_of(bea), now=NOW + timedelta(minutes=1))

        db.session.expire_all()
        entry = db.session.get(WaitingListEntry, entry_id)
        used = db.session.get(StandingWaitingListEntry, standing_id).credits_used
        if commit_fails:
            assert (entry.is_active, used) == (True, 0)
            assert bea not in _enrolled(instance_id)
        else:
            assert (entry.is_active, used) == (False, 1)
            assert bea in _enrolled(instance_id)


def test_a_waiting_list_no_closes_the_entry_for_that_class_only(app, monkeypatch):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services.notification_service import process_invitation_batches, respond_to_notification
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (r0, bea) = _seed(enrolled=0, candidates=2, max_players=1, max_sim=1)
        a = LessonInstance.query.get(instance_id)
        b = LessonInstance(lesson_id=a.lesson_id, start_datetime=START + timedelta(days=7),
                           end_datetime=START + timedelta(days=7, hours=1), max_players=1,
                           status="scheduled", level_id=a.level_id, notifications_enabled=True)
        db.session.add(b)
        db.session.commit()
        standing = _standing(coach_id, bea, NOW - timedelta(days=1))
        standing_id = standing.id
        entry_a = _entry(instance_id, coach_id, bea, NOW - timedelta(hours=1), standing=standing)
        entry_b = _entry(b.id, coach_id, bea, NOW - timedelta(hours=1), standing=standing)

        _trigger(instance_id, coach_id)
        respond_to_notification(_event(instance_id, bea).id, "no", _user_of(bea), now=NOW + timedelta(minutes=1))
        db.session.expire_all()
        assert db.session.get(WaitingListEntry, entry_a).is_active is False
        assert db.session.get(WaitingListEntry, entry_b).is_active is True
        standing = db.session.get(StandingWaitingListEntry, standing_id)
        assert (standing.is_active, standing.credits_used) == (True, 0)

        process_invitation_batches(now=NOW + timedelta(hours=5))
        assert [p for p, _ in _invites(instance_id)].count(bea) == 1, "never asked for class A again"


@pytest.mark.parametrize("side, says", [("left", "lado esquerdo"), ("right", "lado direito"), ("both", None), (None, None)])
def test_the_invitation_names_the_spots_side_only_when_it_has_one(app, monkeypatch, side, says):
    from padel_app.models import Message
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import process_invitation_batches
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (bea,) = _seed(enrolled=0, candidates=1, max_players=1, max_sim=1)
        db.session.add(Vacancy(lesson_instance_id=instance_id, coach_id=coach_id, status="open",
                               side=side, approval_status="not_required"))
        db.session.commit()
        _entry(instance_id, coach_id, bea, NOW - timedelta(hours=1))
        process_invitation_batches(now=NOW)

        event = _event(instance_id, bea)
        assert event.round_number == 0
        text = Message.query.get(event.message_id).text
        if says:
            assert says in text, text
        else:
            assert "lado" not in text and "side" not in text, text


def test_the_coach_recording_a_waiting_list_yes_settles_the_entry_too(app, monkeypatch):
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services.notification_service import coach_respond_to_notification
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (bea,) = _seed(enrolled=0, candidates=1, max_players=1, max_sim=1)
        standing = _standing(coach_id, bea, NOW - timedelta(days=1))
        standing_id = standing.id
        entry_id = _entry(instance_id, coach_id, bea, NOW - timedelta(hours=1), standing=standing)
        _trigger(instance_id, coach_id)

        coach_respond_to_notification(_event(instance_id, bea).id, "yes", coach_id, now=NOW + timedelta(minutes=1))
        db.session.expire_all()
        assert db.session.get(WaitingListEntry, entry_id).is_active is False
        assert db.session.get(StandingWaitingListEntry, standing_id).credits_used == 1
        assert bea in _enrolled(instance_id)


def test_a_student_who_blocked_automatic_invitations_is_not_asked_from_the_list(app, monkeypatch):
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (r0, bea) = _seed(enrolled=0, candidates=2, max_players=1, max_sim=1)
        _entry(instance_id, coach_id, bea, NOW - timedelta(hours=1))
        _block_automatic_invitations(bea)
        _trigger(instance_id, coach_id)
        assert _invites(instance_id) == [(r0, 1)]
        assert bea not in _enrolled(instance_id)


def _block_automatic_invitations(player_id):
    from padel_app.models.players import Player

    Player.query.get(player_id).user.notif_block_auto_invitations = True
    db.session.commit()


def test_the_templates_carry_waiting_list_invite_with_side_and_no_placement():
    from padel_app.models.notification_config import DEFAULT_MESSAGE_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES_PT

    for templates in (DEFAULT_MESSAGE_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES_PT):
        assert "{side}" in templates["waiting_list_invite"]
        assert "waiting_list_placed" not in templates


@pytest.mark.skipif(
    __import__("os").getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="a lock is only visible with two real connections",
)
def test_a_waiting_list_yes_and_a_group_yes_on_two_spots_cannot_overfill(app, monkeypatch):
    """Postgres, forced (the PAD-499 cell (a) shape): one place left, two open spots. X answers yes
    to a group-0 (waiting-list) invitation for V1 and pauses after closing it; Y answers yes to a
    group-1 invitation for V2. One of them gets the place, never both, and X's entry closes only if
    X got it."""
    import threading

    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock
    from padel_app.tests.test_pad493_starts_and_pacing import _race
    from padel_app.tests.test_pad499_accept_lock_ends_early import _enrolled as _filled, _two_open_spots_for_one_place

    pin_clock(monkeypatch, NOW)
    instance_id, ids, (x, y, _z) = _two_open_spots_for_one_place(app)
    with app.app_context():
        NotificationEvent.query.get(ids[x][0]).round_number = 0
        coach_id = NotificationEvent.query.get(ids[x][0]).coach_id
        entry = WaitingListEntry(lesson_instance_id=instance_id, player_id=x, coach_id=coach_id, is_active=True)
        db.session.add(entry)
        db.session.commit()
        entry_id = entry.id

    closed, second_done = threading.Event(), threading.Event()
    real_close, real_add = ns._close_vacancy, ns._add_player_to_instance

    def close(vacancy, filled_by_player_id, **kwargs):
        retired = real_close(vacancy, filled_by_player_id, **kwargs)
        if filled_by_player_id == x:
            closed.set()
        return retired

    def add(player_id, instance):
        if player_id == x:
            second_done.wait(timeout=5)
        return real_add(player_id, instance)

    monkeypatch.setattr(ns, "_close_vacancy", close)
    monkeypatch.setattr(ns, "_add_player_to_instance", add)
    results = {}

    def first():
        results["x"] = ns.respond_to_notification(ids[x][0], "yes", ids[x][1], now=NOW + timedelta(minutes=1))

    def second():
        closed.wait(timeout=5)
        try:
            results["y"] = ns.respond_to_notification(ids[y][0], "yes", ids[y][1], now=NOW + timedelta(minutes=1))
        finally:
            second_done.set()

    with _io():
        _race(app, [first, second])
    filled, places = _filled(app, instance_id)
    assert filled <= places, f"class overfilled: {filled} on {places} places ({results})"
    with app.app_context():
        db.session.expire_all()
        x_in = x in _enrolled(instance_id)
        assert db.session.get(WaitingListEntry, entry_id).is_active is (not x_in)
        assert [results["x"]["action"], results["y"]["action"]].count("confirmed") == 1, results


def test_a_crash_right_after_the_accepts_commit_leaves_the_entry_settled(app, monkeypatch):
    """Rule 15: the entry and the credit are written IN the accept's single commit, not after it. A
    crash right after that commit (here: in the next save) must find the student enrolled AND the
    entry closed with the credit spent — never enrolled with a live entry and an unspent credit."""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, (bea,) = _seed(enrolled=0, candidates=1, max_players=1, max_sim=1)
        standing = _standing(coach_id, bea, NOW - timedelta(days=1))
        standing_id = standing.id
        entry_id = _entry(instance_id, coach_id, bea, NOW - timedelta(hours=1), standing=standing)
        _trigger(instance_id, coach_id)
        event_id = _event(instance_id, bea).id

        real_add = ns._add_player_to_instance

        def add_then_crash(player_id, instance):
            result = real_add(player_id, instance)  # the accept's commit happens in here
            monkeypatch.setattr(NotificationEvent, "save", lambda self: (_ for _ in ()).throw(RuntimeError("crash")))
            return result

        monkeypatch.setattr(ns, "_add_player_to_instance", add_then_crash)
        with pytest.raises(RuntimeError):
            ns.respond_to_notification(event_id, "yes", _user_of(bea), now=NOW + timedelta(minutes=1))
        db.session.rollback()
        db.session.expire_all()
        assert bea in _enrolled(instance_id)
        assert db.session.get(WaitingListEntry, entry_id).is_active is False
        assert db.session.get(StandingWaitingListEntry, standing_id).credits_used == 1
