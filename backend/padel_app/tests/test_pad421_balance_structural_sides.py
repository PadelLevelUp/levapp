"""
PAD-421 — never-filled spots balance the class's sides, if possible
(notifications.invitations rule 2b; owner, 2026-09-24).

A structural vacancy (a spot the class never filled) used to be created with ``side=None``, so
round 1 ("same level and same side") and round 2 ("same level") were the same for it and nothing
balanced the class: a class of 16 with 6 fixed students could invite 10 left-side players. Each
new structural vacancy now takes the side the class is short of: the enrolled players' sides plus
the sides its open vacancies already carry, ``both`` and no side counting on neither, a tie giving
``left`` and then alternating. Rounds 2-3 still widen, so a spot never stays empty.

Run:
    pytest padel_app/tests/test_pad421_balance_structural_sides.py -v
"""
from collections import Counter

from padel_app.sql_db import db
from padel_app.tests.test_effective_level_resolution import (
    _create_class,
    _create_coach,
    _create_coach_player,
    _create_level,
)


def _enrol(coach, level, instance, username, side):
    from padel_app.services.lesson_service import enrol

    cp = _create_coach_player(coach, level, username)
    cp.side = side
    enrol(cp.player_id, instance, "roster", confirmed=True)
    db.session.flush()
    return cp


def _sides(vacancies):
    return Counter(v.side for v in vacancies)


def test_a_class_of_16_with_4_left_and_2_right_gets_6_right_and_4_left_spots(app):
    """Criterion "Never-filled spots balance the class's sides" (rule 2b): it would end 8/8."""
    from padel_app.services.notification_service import _create_structural_vacancies

    with app.app_context():
        coach = _create_coach("bal-16")
        level = _create_level(coach, "3", display_order=1)
        db.session.commit()
        _, instance = _create_class(coach, "bal-16", instance_level=level, max_players=16)
        for i, side in enumerate(["left"] * 4 + ["right"] * 2):
            _enrol(coach, level, instance, f"bal16-{i}", side)
        db.session.commit()

        vacancies = _create_structural_vacancies(instance, coach.id)

        assert len(vacancies) == 10
        assert _sides(vacancies) == Counter({"right": 6, "left": 4})


def test_both_and_side_less_players_count_on_neither_side(app):
    """Criterion ""Both" and side-less players count on neither side when balancing"."""
    from padel_app.services.notification_service import _create_structural_vacancies

    with app.app_context():
        coach = _create_coach("bal-flex")
        level = _create_level(coach, "3", display_order=1)
        db.session.commit()
        _, instance = _create_class(coach, "bal-flex", instance_level=level, max_players=6)
        for i, side in enumerate(["left", "left", "both", None]):
            _enrol(coach, level, instance, f"balflex-{i}", side)
        db.session.commit()

        vacancies = _create_structural_vacancies(instance, coach.id)

        assert _sides(vacancies) == Counter({"right": 2})


def test_an_empty_class_alternates_starting_left(app):
    """Rule 2b: a tie gives left, then the sides alternate."""
    from padel_app.services.notification_service import _create_structural_vacancies

    with app.app_context():
        coach = _create_coach("bal-empty")
        level = _create_level(coach, "3", display_order=1)
        _create_coach_player(coach, level, "bal-empty-roster").side = "right"  # the roster plays sides
        db.session.commit()
        _, instance = _create_class(coach, "bal-empty", instance_level=level, max_players=4)

        vacancies = _create_structural_vacancies(instance, coach.id)

        assert [v.side for v in vacancies] == ["left", "right", "left", "right"]


def test_an_open_vacancy_s_side_counts_toward_the_balance(app):
    """Rule 2b: the sides the class's open vacancies already carry are counted too."""
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import _create_structural_vacancies

    with app.app_context():
        coach = _create_coach("bal-open")
        level = _create_level(coach, "3", display_order=1)
        db.session.commit()
        _, instance = _create_class(coach, "bal-open", instance_level=level, max_players=4)
        _enrol(coach, level, instance, "balopen-0", "left")
        departed = _create_coach_player(coach, level, "balopen-gone")
        db.session.add(Vacancy(lesson_instance_id=instance.id, coach_id=coach.id,
                               original_player_id=departed.player_id, side="right",
                               level_id=level.id, status="open", approval_status="not_required"))
        db.session.commit()

        vacancies = _create_structural_vacancies(instance, coach.id)

        # 1 left enrolled + 1 right already open → tie → left, then right: the class ends 2/2.
        assert [v.side for v in vacancies] == ["left", "right"]


def test_a_balancing_side_is_filled_by_that_side_first_and_by_anyone_if_nobody_matches():
    """Criterion "A balancing side is filled by that side first…" (rules 2b, 4a): round 1's
    same-side check admits the vacancy's side and `both`; round 2 has no side check at all."""
    from padel_app.services.notification_service import _side_eligible

    assert _side_eligible("right", "right")
    assert _side_eligible("both", "right")
    assert not _side_eligible("left", "right")


def test_a_roster_with_no_sided_player_keeps_spots_side_less(app):
    """Criterion "A roster with no left or right player keeps never-filled spots side-less" (rule 2b):
    balancing would only empty round 1 (a side-less player matches no side) and delay the fill."""
    from padel_app.services.notification_service import _create_structural_vacancies

    with app.app_context():
        coach = _create_coach("bal-noside")
        level = _create_level(coach, "3", display_order=1)
        db.session.commit()
        _, instance = _create_class(coach, "bal-noside", instance_level=level, max_players=3)
        for i, side in enumerate([None, "both"]):
            _enrol(coach, level, instance, f"balnoside-{i}", side)
        db.session.commit()

        vacancies = _create_structural_vacancies(instance, coach.id)

        assert [v.side for v in vacancies] == [None]


def test_a_player_who_gave_the_spot_up_counts_only_through_their_open_vacancy(app):
    """Criterion "A player who gave the spot up counts only through their open vacancy" (rule 2b):
    the count is the players HOLDING a spot (effective_filled_spots' predicate) plus the
    open vacancies. An absent player's side is already carried by the vacancy they opened; counting
    them too would weigh their side twice."""
    from padel_app.models.presences import Presence
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import _create_structural_vacancies

    with app.app_context():
        coach = _create_coach("bal-absent")
        level = _create_level(coach, "3", display_order=1)
        db.session.commit()
        _, instance = _create_class(coach, "bal-absent", instance_level=level, max_players=3)
        gone = _enrol(coach, level, instance, "balabsent-l", "left")
        _enrol(coach, level, instance, "balabsent-r", "right")
        Presence.query.filter_by(player_id=gone.player_id, lesson_instance_id=instance.id).one().status = "absent"
        db.session.add(Vacancy(lesson_instance_id=instance.id, coach_id=coach.id,
                               original_player_id=gone.player_id, side="left",
                               level_id=level.id, status="open", approval_status="not_required"))
        db.session.commit()

        vacancies = _create_structural_vacancies(instance, coach.id)

        # 1 right holding + 1 left open → tie → left. Counting the absent left player too gives right.
        assert [v.side for v in vacancies] == ["left"]
