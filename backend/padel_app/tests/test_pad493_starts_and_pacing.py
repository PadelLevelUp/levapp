"""
PAD-493 (B-259, invitations rules 1b and 5): every legitimate start still starts, a repeat of it
changes nothing, and only process_invitation_batches paces the later batches.

Each kind of start runs twice: `repeat=False` makes the first call and checks it started the spot;
`repeat=True` makes it again and checks nothing moved. On the code before PAD-493 the first column
passes and the second fails; after it, both pass. The race itself (two callers at once) needs two
real connections and runs on Postgres only (`LEVAPP_TEST_DB=postgres`), forced by a gate.
"""
import contextlib
import os
import threading
from datetime import datetime, timedelta
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

# 22:30 UTC on 10 June is 23:30 in Lisbon, inside the default 22:00-07:00 quiet window; 06:30 UTC on
# 11 June is 07:30 Lisbon, after it and before the 09:00 class.
NIGHT = datetime(2026, 6, 10, 22, 30)
MORNING = datetime(2026, 6, 11, 6, 30)

POSTGRES_ONLY = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="a lock is only visible with two real connections",
)


@contextlib.contextmanager
def _io():
    with patch(PATCHES[0]), patch(PATCHES[1]):
        yield


def _instance(instance_id):
    from padel_app.models.lesson_instances import LessonInstance

    return db.session.get(LessonInstance, instance_id)


def _state(instance_id):
    return _vacancies(instance_id), _live_events(instance_id)


# ── the invitation-start job, and the same job re-armed by a config save ─────────────────────

@pytest.mark.parametrize("repeat", [False, True])
def test_the_invitation_start_job(app, monkeypatch, repeat):
    from padel_app import scheduler
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    monkeypatch.setattr(scheduler, "_app", app)
    with app.app_context():
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=4, max_players=1)
    with _io():
        scheduler._run_trigger_invitations(instance_id, coach_id)
        with app.app_context():
            first = _state(instance_id)
        if repeat:
            scheduler._run_trigger_invitations(instance_id, coach_id)  # re-armed: fires again
    with app.app_context():
        assert first[0] == [(1, "open", 1, 1)] and len(first[1]) == 3
        if repeat:
            assert _state(instance_id) == first


# ── a decline after the start opens a second spot: that one starts, the first is untouched ───

@pytest.mark.parametrize("repeat", [False, True])
def test_a_decline_after_the_start(app, monkeypatch, repeat):
    from padel_app.services.notification_service import respond_to_reminder
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, _, enrolled, _ = _seed(enrolled=2, candidates=5, max_players=2)
        respond_to_reminder(instance_id, "no", enrolled[0], now=NOW)
        first = _state(instance_id)
        assert first[0] == [(1, "open", 1, 1)] and len(first[1]) == 3
        if repeat:
            later = pin_clock(monkeypatch, NOW + timedelta(minutes=5))
            respond_to_reminder(instance_id, "no", enrolled[1], now=later)
            vacancies, events = _state(instance_id)
            assert vacancies == [(1, "open", 1, 1), (2, "open", 1, 1)]   # the new spot started
            assert [e for e in events if e[0] == 1] == first[1]         # the first spot gained nothing
            assert len([e for e in events if e[0] == 2]) == 3


# ── a spot held by quiet hours: created at night, started once the window ends ───────────────

@pytest.mark.parametrize("repeat", [False, True])
@pytest.mark.parametrize("starter", ["trigger", "tick"])
def test_a_spot_held_by_quiet_hours(app, monkeypatch, repeat, starter):
    from padel_app.services.notification_service import process_invitation_batches, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NIGHT)
    with app.app_context(), _io():
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=4, max_players=1, quiet=True)
        trigger_invitations(_instance(instance_id), coach_id, now=NIGHT)
        trigger_invitations(_instance(instance_id), coach_id, now=NIGHT)
        process_invitation_batches(now=NIGHT)
        # Held, not started: batch 0, nothing sent, so the morning start is still a first start.
        assert _state(instance_id) == ([(1, "open", 1, 0)], [])

        pin_clock(monkeypatch, MORNING)
        if starter == "trigger":
            trigger_invitations(_instance(instance_id), coach_id, now=MORNING)
        else:
            process_invitation_batches(now=MORNING)
        first = _state(instance_id)
        assert first[0] == [(1, "open", 1, 1)] and len(first[1]) == 3
        if repeat:
            again = MORNING + timedelta(minutes=2)
            pin_clock(monkeypatch, again)
            assert trigger_invitations(_instance(instance_id), coach_id, now=again) == []
            process_invitation_batches(now=again)
            assert _state(instance_id) == first


# ── semi-automatic: a second approval bundle for the class ───────────────────────────────────

def _approve_pending(coach_id, vacancy_id, now):
    from padel_app.models.replacement_approval_prompt import ReplacementApprovalPrompt
    from padel_app.services.replacement_approval_service import respond_to_approval

    prompt = ReplacementApprovalPrompt.query.filter_by(vacancy_id=vacancy_id).one()
    return respond_to_approval(prompt.bundle_id, "yes_now", coach_id, now=now)


@pytest.mark.parametrize("repeat", [False, True])
def test_a_semi_automatic_approval(app, monkeypatch, repeat):
    from padel_app.services.notification_service import respond_to_reminder
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io(), patch("padel_app.services.replacement_approval_service.publish"):
        instance_id, coach_id, enrolled, _ = _seed(enrolled=2, candidates=5, max_players=2, semi=True)
        respond_to_reminder(instance_id, "no", enrolled[0], now=NOW)
        assert _state(instance_id) == ([(1, "open", 1, 0)], [])      # pending approval, nothing sent
        _approve_pending(coach_id, 1, NOW + timedelta(minutes=1))
        first = _state(instance_id)
        assert first[0] == [(1, "open", 1, 1)] and len(first[1]) == 3
        if repeat:
            later = pin_clock(monkeypatch, NOW + timedelta(minutes=5))
            respond_to_reminder(instance_id, "no", enrolled[1], now=later)
            _approve_pending(coach_id, 2, later + timedelta(minutes=1))
            vacancies, events = _state(instance_id)
            assert vacancies == [(1, "open", 1, 1), (2, "open", 1, 1)]
            assert [e for e in events if e[0] == 1] == first[1]
            assert len([e for e in events if e[0] == 2]) == 3


# ── pacing: only the tick sends a later batch, and only after maxInactiveTime ────────────────

def test_only_the_tick_sends_the_next_batch_and_only_after_the_interval(app, monkeypatch):
    from padel_app.services.notification_service import process_invitation_batches, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=6, max_players=1)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        started = _state(instance_id)
        assert started[0] == [(1, "open", 1, 1)] and len(started[1]) == 3

        for minutes in (30, 60, 119):
            t = pin_clock(monkeypatch, NOW + timedelta(minutes=minutes))
            process_invitation_batches(now=t)
            trigger_invitations(_instance(instance_id), coach_id, now=t)
            assert _state(instance_id) == started, f"a batch went out {minutes} min after the first"

        t = pin_clock(monkeypatch, NOW + timedelta(minutes=121))
        process_invitation_batches(now=t)
        vacancies, events = _state(instance_id)
        assert vacancies == [(1, "open", 1, 2)]
        assert len(events) == 6


# ── the start is decided under the lock, on the re-read row ──────────────────────────────────

@pytest.fixture
def locks(monkeypatch):
    """The entity of every SELECT ... FOR UPDATE the code asks for, in order (PAD-261's spy)."""
    from sqlalchemy.orm import Query

    seen = []
    original = Query.with_for_update

    def spy(self, *args, **kwargs):
        seen.append(self.column_descriptions[0]["entity"].__name__)
        return original(self, *args, **kwargs)

    monkeypatch.setattr(Query, "with_for_update", spy)
    return seen


@pytest.mark.parametrize("starter", ["trigger", "tick"])
def test_the_start_locks_the_vacancy(app, monkeypatch, locks, starter):
    from padel_app.services.notification_service import process_invitation_batches, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NIGHT)
    with app.app_context(), _io():
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=2, max_players=1, quiet=True)
        trigger_invitations(_instance(instance_id), coach_id, now=NIGHT)   # held: created, not started
        locks.clear()
        pin_clock(monkeypatch, MORNING)
        if starter == "trigger":
            trigger_invitations(_instance(instance_id), coach_id, now=MORNING)
        else:
            process_invitation_batches(now=MORNING)
        assert "Vacancy" in locks
        assert _vacancies(instance_id) == [(1, "open", 1, 1)]


def test_the_start_decides_on_the_row_not_on_a_stale_copy(app, monkeypatch):
    """Another caller started the spot after this one loaded it: the locked re-read sees it."""
    from sqlalchemy import text

    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import _start_vacancy, get_or_create_config
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NIGHT)
    with app.app_context(), _io():
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=2, max_players=1, quiet=True)
        from padel_app.services.notification_service import trigger_invitations

        trigger_invitations(_instance(instance_id), coach_id, now=NIGHT)
        stale = Vacancy.query.filter_by(lesson_instance_id=instance_id).one()
        assert stale.last_activity_at is None
        db.session.execute(text("UPDATE vacancies SET last_activity_at = :t WHERE id = :id"),
                           {"t": MORNING, "id": stale.id})
        assert stale.last_activity_at is None                    # the loaded copy is stale

        sent = _start_vacancy(stale, _instance(instance_id), get_or_create_config(coach_id), coach_id, now=MORNING)
        assert sent == []
        assert _live_events(instance_id) == []


# ── the race: two triggers at once (Postgres only) ───────────────────────────────────────────

def _race(app, targets):
    errors = []

    def wrap(fn):
        def run():
            try:
                with app.app_context():
                    fn()
                    db.session.remove()
            except BaseException as exc:  # noqa: BLE001 — surfaced below
                errors.append(exc)
        return threading.Thread(target=run)

    threads = [wrap(fn) for fn in targets]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    assert not any(t.is_alive() for t in threads), "a caller never finished (lock never released?)"
    assert not errors, errors


@contextlib.contextmanager
def _both_loaded(monkeypatch):
    """Hold each trigger after it has loaded the open, unstarted vacancy until the other has too,
    so both decide on the same unstarted state unless a lock serialises them."""
    from padel_app.services import notification_service as ns

    real = ns._find_or_create_open_vacancies
    gate = threading.Barrier(2)

    def gated(instance, coach_id):
        found = real(instance, coach_id)
        try:
            gate.wait(timeout=1.5)
        except threading.BrokenBarrierError:
            pass
        return found

    monkeypatch.setattr(ns, "_find_or_create_open_vacancies", gated)
    yield


def _seed_one_unstarted_vacancy(app):
    from padel_app.models.vacancy import Vacancy

    with app.app_context():
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=4, max_players=1)
        db.session.add(Vacancy(lesson_instance_id=instance_id, coach_id=coach_id, status="open",
                               current_round_number=1, current_batch_number=0))
        db.session.commit()
        return instance_id, coach_id


def _trigger(instance_id, coach_id):
    from padel_app.services.notification_service import trigger_invitations

    return lambda: trigger_invitations(_instance(instance_id), coach_id, now=NOW)


@POSTGRES_ONLY
def test_two_triggers_at_once_start_the_spot_once(app, monkeypatch):
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    instance_id, coach_id = _seed_one_unstarted_vacancy(app)
    with _io(), _both_loaded(monkeypatch):
        _race(app, [_trigger(instance_id, coach_id)] * 2)
    with app.app_context():
        assert _vacancies(instance_id) == [(1, "open", 1, 1)]
        assert len(_live_events(instance_id)) == 3


@POSTGRES_ONLY
def test_without_the_lock_the_same_race_starts_the_spot_twice(app, monkeypatch):
    """The harness has teeth: a check-then-send with no lock and no re-read sends two batches."""
    from padel_app.services import notification_service as ns
    from padel_app.tests.helpers import pin_clock

    def unlocked(vacancy, instance, config, coach_id, *, now):
        if vacancy.status != "open" or vacancy.last_activity_at is not None:
            return []
        return ns._send_invitation_batch(vacancy, instance, config, coach_id, now=now)

    monkeypatch.setattr(ns, "_start_vacancy", unlocked)
    pin_clock(monkeypatch, NOW)
    instance_id, coach_id = _seed_one_unstarted_vacancy(app)
    with _io(), _both_loaded(monkeypatch):
        _race(app, [_trigger(instance_id, coach_id)] * 2)
    with app.app_context():
        assert _vacancies(instance_id)[0][3] == 2, "both callers sent a batch"


# ── B-260 (rule 17): a double tap racing itself is answered once (Postgres only) ─────────────

@contextlib.contextmanager
def _both_past_the_repeat_check(monkeypatch):
    """Hold each answer just after the first repeat check until the other has passed it too, or
    the gate times out (a lock that makes the second wait is visible as the timeout)."""
    from padel_app.services import notification_service as ns

    real = ns._repeated_answer
    gate = threading.Barrier(2)

    def gated(event, action):
        result = real(event, action)
        try:
            gate.wait(timeout=1.5)
        except threading.BrokenBarrierError:
            pass
        return result

    monkeypatch.setattr(ns, "_repeated_answer", gated)
    yield


def _one_invitation_out(app, candidates):
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.services.notification_service import trigger_invitations

    with app.app_context(), _io():
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=candidates, max_players=1)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        event = NotificationEvent.query.filter_by(lesson_instance_id=instance_id).order_by(NotificationEvent.id).first()
        return instance_id, event.id, Player.query.get(event.player_id).user_id


def _answer(event_id, action, user_id, results):
    from padel_app.services.notification_service import respond_to_notification

    return lambda: results.append(respond_to_notification(event_id, action, user_id, now=NOW + timedelta(minutes=1)))


@POSTGRES_ONLY
def test_a_double_yes_at_once_leaves_the_winner_confirmed(app, monkeypatch):
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    instance_id, event_id, user_id = _one_invitation_out(app, candidates=3)
    results = []
    with _io(), _both_past_the_repeat_check(monkeypatch):
        _race(app, [_answer(event_id, "yes", user_id, results)] * 2)
    with app.app_context():
        assert sorted(r["action"] for r in results) == ["confirmed", "confirmed"]
        assert db.session.get(NotificationEvent, event_id).status == "confirmed"


@POSTGRES_ONLY
def test_a_double_no_at_once_invites_one_next_student(app, monkeypatch):
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    instance_id, event_id, user_id = _one_invitation_out(app, candidates=6)
    with app.app_context():
        before = len(_live_events(instance_id))           # 3 out of 6
    results = []
    with _io(), _both_past_the_repeat_check(monkeypatch):
        _race(app, [_answer(event_id, "no", user_id, results)] * 2)
    with app.app_context():
        # one declined, one more invited: still `before` live
        assert len(_live_events(instance_id)) == before


# ── review finding 1: a start that sent nothing is not a start ───────────────────────────────

@pytest.mark.parametrize("max_inactive", [True, False])
def test_a_spot_whose_first_batch_maxtotal_stopped_is_retried_on_the_next_tick(app, monkeypatch, max_inactive):
    """Two spots, three students, maxTotal 3: the first spot takes the whole budget and the second
    sends nothing. A decline frees budget; the next tick must start the second spot, whether or
    not maxInactiveTime is on (with it off, a falsely-started spot would never be retried)."""
    from padel_app.models.notification_event import NotificationEvent
    from padel_app.models.players import Player
    from padel_app.services.notification_service import (
        process_invitation_batches,
        respond_to_notification,
        trigger_invitations,
    )
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=3, max_players=2, max_total=3,
                                            max_inactive=max_inactive)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        vacancies = _vacancies(instance_id)
        assert [v[3] for v in vacancies] == [1, 0]         # the second spot sent nothing
        second = vacancies[1][0]

        event = NotificationEvent.query.filter_by(lesson_instance_id=instance_id).order_by(NotificationEvent.id).first()
        later = pin_clock(monkeypatch, NOW + timedelta(minutes=1))
        respond_to_notification(event.id, "no", Player.query.get(event.player_id).user_id, now=later)

        tick = pin_clock(monkeypatch, NOW + timedelta(minutes=4))
        process_invitation_batches(now=tick)
        assert len([e for e in _live_events(instance_id) if e[0] == second]) == 1
        assert next(v for v in _vacancies(instance_id) if v[0] == second)[3] == 1


# ── review finding 2: a second absence while a spot holds gets its own vacancy ───────────────

def test_a_student_marked_absent_while_another_spot_holds_gets_a_vacancy(app, monkeypatch):
    """Two places, one enrolled, one other student: the never-filled place is started and, with
    nobody else to ask, holds while its one offer is live. The coach then marks the enrolled student
    absent: that place needs its own vacancy, started now."""
    from padel_app.models.presences import Presence
    from padel_app.services.notification_service import process_invitation_batches, trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), _io():
        instance_id, coach_id, enrolled_users, _ = _seed(enrolled=1, candidates=1, max_players=2)
        trigger_invitations(_instance(instance_id), coach_id, now=NOW)
        later = pin_clock(monkeypatch, NOW + timedelta(hours=3))
        process_invitation_batches(now=later)
        assert [(v[1], v[3]) for v in _vacancies(instance_id)] == [("open", 1)]   # held

        from padel_app.models.players import Player

        enrolled_player = Player.query.filter_by(user_id=enrolled_users[0]).one()
        presence = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=enrolled_player.id).one()
        presence.status = "absent"
        presence.confirmed = True
        db.session.commit()
        trigger_invitations(_instance(instance_id), coach_id, now=later)   # what confirm_presences calls

        from padel_app.models.vacancy import Vacancy

        theirs = Vacancy.query.filter_by(lesson_instance_id=instance_id, original_player_id=enrolled_player.id).all()
        assert len(theirs) == 1 and theirs[0].status == "open"
        assert theirs[0].current_batch_number == 1                          # started by that call
