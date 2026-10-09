"""PAD-565 — phase 1 diagnosis (specflow-bugs): in a class that is NOT full, a freed spot asks the
wrong side.

What these tests pin is what the engine does TODAY on the ticket's roster (16 places, 6 left + 2
right enrolled, one left player leaves). Rules 2b and 2c (notifications.invitations) are both
implemented as written; their interaction is the defect:

- rule 2b sides the never-filled spots toward an even class AT CAPACITY (6L/2R + 8 spots →
  6 right + 2 left, projecting 8/8);
- rule 2c then counts those open spots ("plus the sides of the class's other open vacancies"), so
  the freed spot sees 7 / 8 and asks LEFT, not the 5 / 2 the coach sees.

The precondition is that the never-filled spots were already open (rule 1c's tick, PAD-540, or the
invite-start job) when the absence landed. Every leaver path — the coach's absent mark, a reminder
"no", a cancellation — converges on ``_create_vacancy_for_absent_player`` → ``freed_spot_side``.

The assertions marked TODAY document the defect; they flip once the owner approves the rule.
Run:
    pytest padel_app/tests/test_pad565_side_balance_non_full_class.py -v
"""
from collections import Counter

from padel_app.sql_db import db
from padel_app.tests.test_pad541_freed_spot_balances_sides import _absent, _class


def _open_sides(instance_id):
    from padel_app.models.vacancy import Vacancy

    return Counter(v.side for v in Vacancy.query.filter_by(lesson_instance_id=instance_id, status="open"))


def _ticket_class(username):
    """The ticket's roster: 16 places, 6 left + 2 right enrolled."""
    return _class(username, ["left"] * 6 + ["right"] * 2, max_players=16)


# ── precondition: rule 2b sides the never-filled spots toward capacity ──────────────────────────

def test_rule_2b_sides_the_eight_never_filled_spots_six_right_two_left(app):
    """Rule 2b on the ticket's roster: R,R,R,R then L,R,L,R — the class would end 8 / 8."""
    from padel_app.services.notification_service import _create_structural_vacancies

    with app.app_context():
        coach, instance, _ = _ticket_class("b565-2b")
        vacancies = _create_structural_vacancies(instance, coach.id)
        assert Counter(v.side for v in vacancies) == Counter({"right": 6, "left": 2})


# ── the 2×2: never-filled spots already open × the leaver's path ────────────────────────────────

def test_TODAY_with_the_never_filled_spots_open_a_left_leaver_frees_a_left_spot(app):
    """The ticket's observation. 5L/2R holding + 2L/6R open = 7 / 8 → rule 2c says left.
    The ticket expects right."""
    from padel_app.services.notification_service import (
        _create_structural_vacancies,
        _create_vacancy_for_absent_player,
    )

    with app.app_context():
        coach, instance, pids = _ticket_class("b565-open")
        _create_structural_vacancies(instance, coach.id)
        _absent(instance, pids[0])
        assert _create_vacancy_for_absent_player(instance, coach.id, pids[0]).side == "left"


def test_with_no_never_filled_spot_open_yet_the_same_leaver_frees_a_right_spot(app):
    """Outside the window (no vacancy yet), the count is the roster's 5 / 2 → right. Then the
    8 never-filled spots balance around it (5L/3R: R,R,L,R,L,R,L,R) so the class still projects
    8 / 8 with 6 right + 3 left open. The answer depends on which vacancy was created first."""
    from padel_app.services.notification_service import (
        _create_structural_vacancies,
        _create_vacancy_for_absent_player,
    )

    with app.app_context():
        coach, instance, pids = _ticket_class("b565-closed")
        _absent(instance, pids[0])
        assert _create_vacancy_for_absent_player(instance, coach.id, pids[0]).side == "right"
        structural = _create_structural_vacancies(instance, coach.id)
        assert len(structural) == 8
        assert _open_sides(instance.id) == Counter({"right": 6, "left": 3})


def test_TODAY_the_coach_absent_mark_and_tick_path_lands_in_the_same_place(app):
    """``trigger_invitations`` → ``_find_or_create_open_vacancies``: with a spot already open it
    creates only the leaver's vacancy, through the same ``freed_spot_side`` → left."""
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import (
        _create_structural_vacancies,
        _find_or_create_open_vacancies,
    )

    with app.app_context():
        coach, instance, pids = _ticket_class("b565-mark")
        _create_structural_vacancies(instance, coach.id)
        _absent(instance, pids[0])
        _find_or_create_open_vacancies(instance, coach.id)
        leaver = Vacancy.query.filter_by(lesson_instance_id=instance.id, original_player_id=pids[0]).one()
        assert leaver.side == "left"
        assert _open_sides(instance.id) == Counter({"right": 6, "left": 3})


def test_TODAY_the_reminder_no_path_lands_in_the_same_place(app):
    """``_free_spot_for_declining_player`` (reminder "no" and cancellation) → ``_ensure_vacancy_for_player``
    → the same side. The engine is left off so nothing is sent; the vacancy row is the evidence."""
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import (
        _create_structural_vacancies,
        _free_spot_for_declining_player,
        get_or_create_config,
    )

    with app.app_context():
        coach, instance, pids = _ticket_class("b565-no")
        _create_structural_vacancies(instance, coach.id)
        config = get_or_create_config(coach.id)
        config.auto_notify_enabled = False
        db.session.commit()
        presence = Presence.query.filter_by(player_id=pids[0], lesson_instance_id=instance.id).one()
        player = Player.query.get(pids[0])
        _free_spot_for_declining_player(
            instance, presence, player, coach, None, player.user_id, config, {}
        )
        leaver = Vacancy.query.filter_by(lesson_instance_id=instance.id, original_player_id=pids[0]).one()
        assert presence.status == "absent"
        assert leaver.side == "left"


# ── the ticket's table rows 2 and 3 (full classes) already hold ─────────────────────────────────

def test_a_full_class_of_two_two_losing_a_left_asks_left(app):
    from padel_app.services.notification_service import _create_vacancy_for_absent_player

    with app.app_context():
        coach, instance, pids = _class("b565-22", ["left", "left", "right", "right"])
        _absent(instance, pids[0])
        assert _create_vacancy_for_absent_player(instance, coach.id, pids[0]).side == "left"


def test_a_full_class_of_three_one_losing_a_left_asks_right(app):
    from padel_app.services.notification_service import _create_vacancy_for_absent_player

    with app.app_context():
        coach, instance, pids = _class("b565-31", ["left", "left", "left", "right"])
        _absent(instance, pids[0])
        assert _create_vacancy_for_absent_player(instance, coach.id, pids[0]).side == "right"


# ── the owner's case: 5 right + 2 left going, 12 places ─────────────────────────────────────────

def test_TODAY_the_owners_twelve_place_class_opens_four_left_and_one_right(app):
    """2L/5R + 5 spots: L,L,L (5/5), tie → L (6/5), R (6/6). Four left invitations go out at once
    for four distinct spots; a "yes" closes only its own spot's other invitations."""
    from padel_app.services.notification_service import _create_structural_vacancies

    with app.app_context():
        coach, instance, _ = _class("b565-owner", ["right"] * 5 + ["left"] * 2, max_players=12)
        vacancies = _create_structural_vacancies(instance, coach.id)
        assert Counter(v.side for v in vacancies) == Counter({"left": 4, "right": 1})
