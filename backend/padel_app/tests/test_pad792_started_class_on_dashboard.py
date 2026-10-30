"""PAD-792 (dashboard.blocks rule 12, B-711): a class that has started is no longer something to fill.

At 20:23 the coach's dashboard still offered "Treino A" (19:30-21:00, 0/2) as "2 vagas livres ·
Convidar" in needs-you, as "A SEGUIR · 19:30" in the hero, and as "Vazia · Convidar" in the next 7
days. Every block cuts its window with rule 9's overlap test, which keeps a running class on purpose
(PAD-754); nothing asked whether it had started. Now needs-you drops it at its start time, and the
hero and the schedule row carry `inProgress` (the row without `inviteHref`).

The seed's B1 Class runs 10:45-11:45 with 2 of 6 seats taken; A2 Class is tomorrow, full.
"""
from datetime import datetime, timedelta

from padel_app.tests.test_dashboard_coach_home import _seed

SEEDED_AT = datetime(2026, 8, 4, 10, 0)
B1_START = SEEDED_AT + timedelta(minutes=45)  # 10:45
RUNNING = B1_START + timedelta(minutes=30)  # 11:15, half way through B1


def _coach_home(app, now):
    from padel_app.helpers.dashboard.coach_home import (
        build_needs_you_block,
        build_next_class_block,
        build_schedule_block,
        load_coach_home_events,
    )

    coach_id, coach_user_id, _ = _seed(app, now=SEEDED_AT)
    with app.app_context():
        events = load_coach_home_events(coach_id=coach_id, now=now)
        return (
            build_next_class_block(coach_id=coach_id, now=now, events=events),
            build_needs_you_block(coach_id=coach_id, user_id=coach_user_id, now=now, events=events),
            build_schedule_block(coach_id=coach_id, now=now, events=events),
        )


def _empty_seat_titles(needs_you):
    return [i["classTitle"] for i in needs_you["data"]["items"] if i["kind"] == "empty_seats"]


def test_before_its_start_the_class_still_needs_the_coach(app):
    hero, needs_you, schedule = _coach_home(app, B1_START - timedelta(minutes=1))

    assert _empty_seat_titles(needs_you) == ["B1 Class"]
    assert hero["data"]["title"] == "B1 Class" and hero["data"]["inProgress"] is False
    first = schedule["data"]["items"][0]
    assert first["title"] == "B1 Class" and first["inProgress"] is False and "inviteHref" in first


def test_at_its_start_time_the_empty_seats_card_is_gone(app):
    _, needs_you, _ = _coach_home(app, B1_START)

    assert _empty_seat_titles(needs_you) == []


def test_a_running_class_is_in_progress_on_the_hero_and_the_schedule(app):
    hero, needs_you, schedule = _coach_home(app, RUNNING)

    assert _empty_seat_titles(needs_you) == []
    # PAD-754 holds: the running class is still the hero and the first row of the next 7 days.
    assert hero["data"]["title"] == "B1 Class"
    assert hero["data"]["inProgress"] is True
    assert hero["data"]["minutesUntil"] is None
    running, tomorrow = schedule["data"]["items"][:2]
    assert running["title"] == "B1 Class" and running["inProgress"] is True
    assert "inviteHref" not in running, "no Convidar on a class that has started"
    assert tomorrow["title"] == "A2 Class" and tomorrow["inProgress"] is False
    assert "inviteHref" in tomorrow


def test_once_it_ends_the_hero_moves_to_the_next_class(app):
    hero, _, _ = _coach_home(app, B1_START + timedelta(hours=1))

    assert hero["data"]["title"] == "A2 Class" and hero["data"]["inProgress"] is False


def test_two_classes_running_the_hero_is_the_one_that_started_first():
    """Rule 12c: an assumption pending the owner's confirmation (the ticket asks which to show)."""
    from padel_app.helpers.dashboard.coach_home import next_class_block

    now = datetime(2026, 10, 29, 20, 23)
    later = {"type": "class", "id": "2", "title": "Later", "date": "2026-10-29", "startTime": "20:00", "endTime": "21:00"}
    earlier = {"type": "class", "id": "1", "title": "Earlier", "date": "2026-10-29", "startTime": "19:30", "endTime": "21:00"}

    block = next_class_block([earlier, later], now=now)

    assert block["data"]["title"] == "Earlier" and block["data"]["inProgress"] is True


def test_at_its_start_time_the_student_hero_moves_to_the_next_class(app):
    """The student home loads its classes from `now` (calendar_helpers: start_datetime >= start), so
    a running class never reaches it: at the start time the hero is the next class, not in progress.
    Showing the student "A DECORRER" would need that loader window changed; not in PAD-792."""
    from padel_app.helpers.dashboard.player_home import (
        build_player_next_class_block,
        build_player_schedule_block,
    )
    from padel_app.models import Presence

    _, _, b1_instance_id = _seed(app, now=SEEDED_AT)
    with app.app_context():
        player_id = Presence.query.filter_by(lesson_instance_id=b1_instance_id).first().player_id
        hero = build_player_next_class_block(player_id=player_id, now=RUNNING)
        schedule = build_player_schedule_block(player_id=player_id, now=RUNNING)

    assert hero["data"]["title"] == "A2 Class" and hero["data"]["inProgress"] is False
    assert "B1 Class" not in [row["title"] for row in schedule["data"]["items"]]
    assert all(row["inProgress"] is False and "inviteHref" not in row for row in schedule["data"]["items"])
