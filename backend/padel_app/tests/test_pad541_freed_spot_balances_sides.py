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
    """invite-simulation rule 9 (#591 review): 6L/3R with a left leaver still in the class asks
    `right`; without the simulation's rule-2c call it would show the leaver's `left`."""
    from padel_app.services.invite_simulation_service import simulate_vacancy

    with app.app_context():
        coach, instance, pids = _class("b541-sim", ["left"] * 6 + ["right"] * 3)
        assert simulate_vacancy(instance, coach.id, pids[0])["spot"]["side"] == "right"


def test_the_simulation_counts_the_leaver_out(app):
    """4L/3R with a left leaver still in the class: counted out, 3 / 3 ties and keeps `left`;
    counted in, 4 / 3 would ask `right`."""
    from padel_app.services.invite_simulation_service import simulate_vacancy

    with app.app_context():
        coach, instance, pids = _class("b541-simx", ["left"] * 4 + ["right"] * 3)
        assert simulate_vacancy(instance, coach.id, pids[0])["spot"]["side"] == "left"


def test_a_both_side_player_counts_on_neither_side(app):
    """Rules 2b/2c (#591 review): a `both` holder is on neither side. With a left, a right and a
    `both` still coming and a `both` leaver, the count is 1 / 1 and the tie keeps `both`; counting
    the holder as left would ask `right`, as right would ask `left`."""
    from padel_app.services.notification_service import _create_vacancy_for_absent_player

    with app.app_context():
        coach, instance, pids = _class("b541-both-holder", ["left", "right", "both", "both"])
        _absent(instance, pids[3])
        assert _create_vacancy_for_absent_player(instance, coach.id, pids[3]).side == "both"


def test_the_leaver_is_counted_out_even_while_still_holding(app):
    """Rule 2c counts the class WITHOUT the leaver, whether or not their presence is already absent
    (#PAD-541 review: the engine cells always marked them absent first, so dropping the exclusion
    survived)."""
    from padel_app.services.notification_service import freed_spot_side

    with app.app_context():
        coach, instance, pids = _class("b541-hold", ["left"] * 4 + ["right"] * 3)
        assert freed_spot_side(instance, coach.id, pids[0], "left") == "left"   # 3 / 3 without them


def test_a_coach_with_no_settings_yet_still_gets_one_vacancy_per_leaver(app):
    """B-322: creating the coach's settings committed inside the locked section and ended the lock;
    reading them first keeps the section to one commit. On SQLite this pins only the outcome."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import _create_vacancy_for_absent_player

    with app.app_context():
        coach, instance, pids = _class("b541-nocfg", ["left", "left", "left", "right"])  # 2L/1R left: asks right
        assert NotificationConfig.query.filter_by(coach_id=coach.id).first() is None
        _absent(instance, pids[0])
        v = _create_vacancy_for_absent_player(instance, coach.id, pids[0])
        assert Vacancy.query.filter_by(lesson_instance_id=instance.id, status="open").count() == 1
        assert v.side == "right"


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
