"""PAD-682 (calendar.view rule 5a): weeks start on Sunday, on the backend too.

The coach dashboard's "this week" and the validation badge's ``weekOffset`` use the same
first day as the calendar grid beside them, and a test reads the frontend constant so the two
cannot drift apart.
"""
import pathlib
import re
from datetime import date, datetime, timedelta

ROOT = pathlib.Path(__file__).resolve().parents[3]
WEDNESDAY = datetime(2026, 10, 21, 10, 0)


def test_week_start_maps_wednesday_to_the_sunday_before():
    from padel_app.utils.dates import week_start

    assert week_start(date(2026, 10, 21)) == date(2026, 10, 18)


def test_week_start_of_a_sunday_is_itself_and_saturday_belongs_to_that_week():
    from padel_app.utils.dates import week_start

    assert week_start(date(2026, 10, 18)) == date(2026, 10, 18)
    assert week_start(date(2026, 10, 24)) == date(2026, 10, 18)
    assert week_start(date(2026, 10, 17)) == date(2026, 10, 11)


def test_the_constant_agrees_with_the_frontend():
    from padel_app.utils.dates import WEEK_STARTS_ON_SUNDAY

    source = (ROOT / "frontend" / "packages" / "config" / "src" / "week-start.ts").read_text()
    match = re.search(r"export const WEEK_STARTS_ON = (\d) as const;", source)
    assert match, "WEEK_STARTS_ON not found in frontend/packages/config/src/week-start.ts"
    assert int(match.group(1)) == WEEK_STARTS_ON_SUNDAY == 0


def test_week_bounds_and_offset_use_the_same_sunday_week():
    from padel_app.helpers.dashboard.coach_home import week_bounds, week_offset_of

    assert week_bounds(WEDNESDAY, 0) == (datetime(2026, 10, 18), datetime(2026, 10, 24, 23, 59, 59))
    assert week_offset_of(datetime(2026, 10, 18, 0, 0), WEDNESDAY) == 0
    assert week_offset_of(datetime(2026, 10, 17, 23, 0), WEDNESDAY) == -1


def _add_class(app, coach_id, *, start, capacity):
    from padel_app.models import Association_CoachLesson, LessonInstance
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson
    from padel_app.sql_db import db

    with app.app_context():
        club = Club.query.first() or Club(name="W Club", description="d", location="l")
        db.session.add(club)
        db.session.flush()
        lesson = Lesson(
            title=f"Class {start:%a %d}",
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            is_recurring=False,
            type="academy",
            max_players=capacity,
            status="active",
            club_id=club.id,
        )
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=lesson.id))
        db.session.add(
            LessonInstance(
                lesson_id=lesson.id,
                start_datetime=start,
                end_datetime=start + timedelta(hours=1),
                max_players=capacity,
                status="scheduled",
                notifications_enabled=True,
                original_lesson_occurence_date=start.date(),
            )
        )
        db.session.commit()


def test_dashboard_this_week_counts_sunday_18_and_not_saturday_17(app):
    from padel_app.helpers.dashboard.coach_home import build_week_pulse_block
    from padel_app.tests.helpers import make_coach

    coach_id = make_coach(app)
    _add_class(app, coach_id, start=datetime(2026, 10, 17, 10, 0), capacity=6)  # Saturday: last week
    _add_class(app, coach_id, start=datetime(2026, 10, 18, 10, 0), capacity=4)  # Sunday: this week

    with app.app_context():
        block = build_week_pulse_block(coach_id=coach_id, now=WEDNESDAY)

    seats = block["data"]["seatsFilled"]
    assert seats["total"] == 4  # only Sunday's 4 seats; Saturday's 6 belong to the previous week
