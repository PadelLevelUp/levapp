"""PAD-541 — notifications.invitations rule 2c (owner, 2026-10-08, option A; numbering unconfirmed):
a spot freed by a cancellation asks first for the side the class is short of, not automatically
the leaver's. Counted as rule 2b counts (players still holding a spot, minus the leaver, plus the
class's other open vacancies); a tie keeps the leaver's side; several freed spots balance across
one another. The reporter's case: 6 left / 3 right, two left leavers, ends 5 / 4.
"""
import os
import threading

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_effective_level_resolution import _create_class, _create_coach, _create_level
from padel_app.tests.test_pad421_balance_structural_sides import _enrol

_POSTGRES_ONLY = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="a lock is only visible with two real connections",
)


def _class(username, sides, max_players=None):
    """A class whose holders play ``sides``; returns (coach, instance, {index: player_id})."""
    coach = _create_coach(username)
    level = _create_level(coach, "3", display_order=1)
    db.session.commit()
    _, instance = _create_class(coach, username, instance_level=level, max_players=max_players or len(sides))
    pids = {}
    for i, side in enumerate(sides):
        pids[i] = _enrol(coach, level, instance, f"{username}-{i}", side).player_id
    db.session.commit()
    return coach, instance, pids


def _absent(instance, player_id):
    from padel_app.models.presences import Presence

    Presence.query.filter_by(player_id=player_id, lesson_instance_id=instance.id).one().status = "absent"
    db.session.commit()


def test_the_reporters_class_ends_five_four_one_leaver_at_a_time(app):
    """Criterion "A freed spot asks the side the class is short of": 6L/3R, two left leavers."""
    from padel_app.services.notification_service import _create_vacancy_for_absent_player

    with app.app_context():
        coach, instance, pids = _class("b541-seq", ["left"] * 6 + ["right"] * 3)
        _absent(instance, pids[0])
        first = _create_vacancy_for_absent_player(instance, coach.id, pids[0]).side
        _absent(instance, pids[1])
        second = _create_vacancy_for_absent_player(instance, coach.id, pids[1]).side
        assert (first, second) == ("right", "left")


def test_the_reporters_class_ends_five_four_both_leavers_gone_before_either_spot_opens(app):
    from padel_app.services.notification_service import _create_vacancy_for_absent_player

    with app.app_context():
        coach, instance, pids = _class("b541-both", ["left"] * 6 + ["right"] * 3)
        _absent(instance, pids[0])
        _absent(instance, pids[1])
        sides = [_create_vacancy_for_absent_player(instance, coach.id, p).side for p in (pids[0], pids[1])]
        assert sides == ["right", "left"]


def test_a_tie_keeps_the_leavers_side(app):
    """Criterion "A tie keeps the leaver's side": 3L/3R still coming after a right leaver."""
    from padel_app.services.notification_service import _create_vacancy_for_absent_player

    with app.app_context():
        coach, instance, pids = _class("b541-tie", ["left"] * 3 + ["right"] * 4)
        _absent(instance, pids[6])
        assert _create_vacancy_for_absent_player(instance, coach.id, pids[6]).side == "right"


def test_a_both_side_leaver_on_an_uneven_class_asks_the_short_side_and_keeps_both_on_a_tie(app):
    from padel_app.services.notification_service import _create_vacancy_for_absent_player

    with app.app_context():
        coach, instance, pids = _class("b541-flex", ["left", "left", "right", "both"])
        _absent(instance, pids[3])
        assert _create_vacancy_for_absent_player(instance, coach.id, pids[3]).side == "right"

        coach2, instance2, pids2 = _class("b541-flex2", ["left", "right", "both"])
        _absent(instance2, pids2[2])
        assert _create_vacancy_for_absent_player(instance2, coach2.id, pids2[2]).side == "both"


def test_a_roster_with_no_sided_player_keeps_the_leavers_side(app):
    """Criterion "No sided roster keeps the leaver's side"."""
    from padel_app.services.notification_service import _create_vacancy_for_absent_player

    with app.app_context():
        coach, instance, pids = _class("b541-none", [None, None, None])
        _absent(instance, pids[0])
        assert _create_vacancy_for_absent_player(instance, coach.id, pids[0]).side is None


def test_the_simulation_shows_the_side_the_engine_would_choose(app):
    """invite-simulation rule 9: the leaver is still in the class when the coach asks; the spot's side
    is still the one rule 2c would give their vacancy."""
    from padel_app.services.invite_simulation_service import simulate_vacancy

    with app.app_context():
        coach, instance, pids = _class("b541-sim", ["left"] * 6 + ["right"] * 3)
        assert simulate_vacancy(instance, coach.id, pids[0])["spot"]["side"] == "right"


# ── Postgres: two cancellations at once still see each other's spot ─────────

@_POSTGRES_ONLY
def test_two_freed_spots_created_at_once_balance(app, monkeypatch):
    """Criterion "Two cancellations at once still balance": both creators pass a barrier just before
    the class lock, so they race for it; the side is chosen under the lock, so the second sees the
    first's spot. A side chosen before the lock (mutant) gives two `right`."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.vacancy import Vacancy
    from padel_app.services import notification_service as ns
    from padel_app.tests.test_pad493_starts_and_pacing import _race

    with app.app_context():
        coach, instance, pids = _class("b541-race", ["left"] * 6 + ["right"] * 3)
        _absent(instance, pids[0])
        _absent(instance, pids[1])
        coach_id, instance_id = coach.id, instance.id

    barrier = threading.Barrier(2, timeout=5)
    real_lock = ns._lock_instance

    def gated_lock(inst):
        barrier.wait()
        return real_lock(inst)

    monkeypatch.setattr(ns, "_lock_instance", gated_lock)

    def make(pid):
        def run():
            ns._create_vacancy_for_absent_player(db.session.get(LessonInstance, instance_id), coach_id, pid)
        return run

    _race(app, [make(pids[0]), make(pids[1])])
    with app.app_context():
        sides = sorted(v.side for v in Vacancy.query.filter_by(lesson_instance_id=instance_id, status="open"))
        assert sides == ["left", "right"], sides
