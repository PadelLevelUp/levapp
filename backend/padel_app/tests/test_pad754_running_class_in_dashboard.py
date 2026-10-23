"""PAD-754 (dashboard.blocks rules 8 and 9): a class already running at `now` stays on the coach home.

The coach home loads its classes once over a window that opens a week before the current week, and
every block cuts its own window with rule 9's overlap test, so a class that started 30 minutes ago and
ends in 30 is still in the hero and the next 7 days."""
from datetime import datetime, timedelta

from padel_app.tests.test_dashboard_coach_home import _seed

SEEDED_AT = datetime(2026, 8, 4, 10, 0)  # B1 Class runs 10:45-11:45
RUNNING = SEEDED_AT + timedelta(minutes=75)  # 11:15, half way through B1


def test_a_class_running_across_now_stays_in_the_hero_and_the_schedule(app):
    from padel_app.helpers.dashboard.coach_home import (
        build_next_class_block,
        build_schedule_block,
        load_coach_home_events,
    )

    coach_id, _, _ = _seed(app, now=SEEDED_AT)

    with app.app_context():
        events = load_coach_home_events(coach_id=coach_id, now=RUNNING)
        hero = build_next_class_block(coach_id=coach_id, now=RUNNING, events=events)
        schedule = build_schedule_block(coach_id=coach_id, now=RUNNING, events=events)

    assert hero is not None and hero["data"]["title"] == "B1 Class"
    assert [row["title"] for row in schedule["data"]["items"]][:2] == ["B1 Class", "A2 Class"]

