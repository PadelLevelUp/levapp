"""PAD-814: the Presences trend on the first day of a month, and mid-month.

The tab's default window (the trailing 90 days, ``default_overview_range``) is
bucketed by month, and the series is gap-filled up to the window's end. So the
running month is always the series' last bucket, counted only up to today: a 0
on the 1st, a partial count on the 15th. These tests pin what the payload says
on those two days; how the charts must draw that last bucket is
attendance.validation rule 17b.
"""

from datetime import datetime, timedelta

import pytest

from padel_app.sql_db import db


OCTOBER_DAYS = (3, 10, 17, 24, 31)
NOVEMBER_DAYS = (5, 12)


@pytest.fixture
def pinned_world(app):
    """A coach and two enrolled students, both present at every class.

    Classes are on fixed dates: five in October 2026 and two in early
    November 2026, so a window ending on 1 November sees none of November's
    and a window ending on 15 November sees both.
    """
    from padel_app.models import User
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence

    with app.app_context():
        coach_user = User(name="Trend Coach", username="t814_coach", password="x", status="active")
        ana_user = User(name="Ana", username="t814_ana", password="x", status="active")
        rui_user = User(name="Rui", username="t814_rui", password="x", status="active")
        db.session.add_all([coach_user, ana_user, rui_user])
        db.session.flush()

        coach = Coach(user_id=coach_user.id)
        ana = Player(user_id=ana_user.id)
        rui = Player(user_id=rui_user.id)
        db.session.add_all([coach, ana, rui])
        db.session.flush()
        club = Club(name="T814 Club", description="c", location="x")
        db.session.add(club)
        db.session.flush()
        for player in (ana, rui):
            db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=player.id))

        def make_class(start):
            lesson = Lesson(
                title=f"Academy {start.date().isoformat()}",
                start_datetime=start,
                end_datetime=start + timedelta(hours=1),
                is_recurring=False,
                type="academy",
                max_players=4,
                status="active",
                club_id=club.id,
            )
            db.session.add(lesson)
            db.session.flush()
            db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
            instance = LessonInstance(
                lesson_id=lesson.id,
                original_lesson_occurence_date=start.date(),
                start_datetime=start,
                end_datetime=start + timedelta(hours=1),
                max_players=4,
                status="scheduled",
            )
            db.session.add(instance)
            db.session.flush()
            for player in (ana, rui):
                db.session.add(Association_PlayerLesson(player_id=player.id, lesson_id=lesson.id))
                db.session.add(Presence(
                    lesson_instance_id=instance.id, player_id=player.id,
                    invited=True, confirmed=True, status="present", validated=True,
                ))

        for day in OCTOBER_DAYS:
            make_class(datetime(2026, 10, day, 18, 0))
        for day in NOVEMBER_DAYS:
            make_class(datetime(2026, 11, day, 18, 0))
        db.session.commit()
        return {"coach_id": coach.id}


def _default_trend(app, coach_id, now):
    """The trend exactly as the route builds it when the client sends no range."""
    from padel_app.services.presence_overview_service import (
        build_presence_trend,
        default_overview_range,
    )

    start, end = default_overview_range(now=now)
    with app.app_context():
        return build_presence_trend(coach_id=coach_id, range_start=start, range_end=end)


@pytest.mark.criterion("ATTENDANCE-VALIDATION-51")
def test_on_the_first_the_running_month_is_a_zero_last_bucket(app, pinned_world):
    """1 Nov: October has presences, November none yet; the window ends today."""
    payload = _default_trend(app, pinned_world["coach_id"], now=datetime(2026, 11, 1, 10, 0))

    assert payload["granularity"] == "month"
    assert payload["to"] == "2026-11-01T23:59:59", "the window ends at the end of today"
    starts = [b["start"] for b in payload["buckets"]]
    assert starts == ["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"]
    assert payload["buckets"][-2]["count"] == 2 * len(OCTOBER_DAYS)
    # The running month is in the series, at 0, although only its first day has passed.
    assert payload["buckets"][-1] == {"start": "2026-11-01", "count": 0}


@pytest.mark.criterion("ATTENDANCE-VALIDATION-51")
def test_mid_month_the_running_month_counts_only_up_to_today(app, pinned_world):
    """15 Nov: November's last bucket holds the presences so far, not a whole month."""
    payload = _default_trend(app, pinned_world["coach_id"], now=datetime(2026, 11, 15, 10, 0))

    assert payload["to"] == "2026-11-15T23:59:59"
    assert payload["buckets"][-1] == {"start": "2026-11-01", "count": 2 * len(NOVEMBER_DAYS)}
    assert payload["buckets"][-2] == {"start": "2026-10-01", "count": 2 * len(OCTOBER_DAYS)}


@pytest.mark.criterion("ATTENDANCE-VALIDATION-51")
def test_the_first_bucket_starts_before_the_window(app, pinned_world):
    """The 90-day window starts mid-month, so its first month is partial too."""
    payload = _default_trend(app, pinned_world["coach_id"], now=datetime(2026, 11, 1, 10, 0))

    assert payload["from"] == "2026-08-04T00:00:00"
    assert payload["buckets"][0]["start"] == "2026-08-01"
