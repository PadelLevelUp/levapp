"""
PAD-825 (notifications.invite-simulation rule 9): the simulation's side counts carry their two
parts, so the tutorial can show the roster next to the projection a coach read as the roster
(PAD-822). Built from PAD-822's class: 8 left and 5 right going, four open right spots freed by
absences, a right-side student who cancels.
"""
from padel_app.sql_db import db
from padel_app.tests.test_effective_level_resolution import _create_class, _create_coach, _create_level
from padel_app.tests.test_pad421_balance_structural_sides import _enrol


def _pad822_class():
    from padel_app.models.presences import Presence
    from padel_app.models.vacancy import Vacancy

    coach = _create_coach("p825")
    level = _create_level(coach, "3", display_order=1)
    db.session.commit()
    _, instance = _create_class(coach, "p825", instance_level=level, max_players=17)
    going = ([_enrol(coach, level, instance, f"p825-l{i}", "left") for i in range(8)]
             + [_enrol(coach, level, instance, f"p825-r{i}", "right") for i in range(5)])
    absent = [_enrol(coach, level, instance, f"p825-a{i}", "right") for i in range(4)]
    for cp in absent:
        Presence.query.filter_by(player_id=cp.player_id, lesson_instance_id=instance.id).one().status = "absent"
        db.session.add(Vacancy(lesson_instance_id=instance.id, coach_id=coach.id, status="open",
                               side="right", level_id=level.id, original_player_id=cp.player_id))
    db.session.commit()
    return coach, instance, going


def test_the_side_counts_carry_who_is_going_and_the_open_spots(app):
    from padel_app.services.notification_service import freed_spot_side_counts

    with app.app_context():
        coach, instance, going = _pad822_class()
        leaver = going[-1]  # a right-side student who cancels
        counts = freed_spot_side_counts(instance, coach.id, leaver.player_id, "right")

        # The projection, as today: going without the leaver plus the open spots on their side.
        assert (counts["left"], counts["right"], counts["chosen"]) == (8, 8, "right")
        # Its two parts, which the tutorial shows as the roster line.
        assert counts["going"] == {"left": 8, "right": 4}
        assert counts["open"] == {"left": 0, "right": 4}
        assert counts["left"] == counts["going"]["left"] + counts["open"]["left"]
        assert counts["right"] == counts["going"]["right"] + counts["open"]["right"]
