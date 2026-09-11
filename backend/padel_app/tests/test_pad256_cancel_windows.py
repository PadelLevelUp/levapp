"""
PAD-256, cancellation and proactive-decline windows (attendance.confirm rules
6, 7, 9, 10 and 16; R-023; decision 2026-09-10-class-time-storage, option B).

A class's `start_datetime` is the Lisbon wall-clock time the coach typed. The
cancel path compared it with UTC now, so from April to October:
- a student could cancel for an hour after the class had started;
- the late-cancellation flag turned on an hour late;
- the proactive-decline window closed an hour late.

The payload also sent deadlines that were the wall start minus N wall hours,
so across a daylight-saving change the web showed a deadline an hour off.

Each behaviour is pinned on a summer date (WEST, UTC+1) and a winter date (WET,
UTC+0). `now` stays the UTC instant and is converted to the club's clock only
where it meets a class time.
"""
from datetime import datetime
from unittest.mock import patch

import pytest
from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db


SUMMER = datetime(2026, 7, 14)   # Tuesday, WEST (UTC+1)
WINTER = datetime(2026, 1, 13)   # Tuesday, WET (UTC+0)

PATCHES = (
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
)


def at(day, hour, minute=0):
    return day.replace(hour=hour, minute=minute)


def _seed(wall_start, *, cancellation_hours=None):
    """Coach, club, level, a student enrolled and confirmed in a one-off class at
    `wall_start`. Returns (instance_id, student_user_id, student_player_id)."""
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_PlayerLessonInstance import Association_PlayerLessonInstance
    from padel_app.models.clubs import Club
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence
    from padel_app.models.users import User

    tag = wall_start.strftime("%Y%m%d%H%M")
    cu = User(name="Coach", username=f"cw-coach{tag}", email=f"cwc{tag}@t.test", password="x", status="active")
    su = User(name="Student", username=f"cw-student{tag}", email=f"cws{tag}@t.test", password="x", status="active")
    db.session.add_all([cu, su])
    db.session.flush()
    coach = Coach(user_id=cu.id)
    player = Player(user_id=su.id)
    club = Club(name=f"CW {tag}", description="", location="Lisboa")
    db.session.add_all([coach, player, club])
    db.session.flush()
    level = CoachLevel(coach_id=coach.id, label="B", code="B1", display_order=1)
    db.session.add(level)
    db.session.flush()
    end = wall_start.replace(hour=(wall_start.hour + 1) % 24)
    lesson = Lesson(title="Class", start_datetime=wall_start, end_datetime=end, is_recurring=False,
                    type="academy", max_players=4, color="#000000", status="active", club_id=club.id)
    db.session.add(lesson)
    db.session.flush()
    instance = LessonInstance(lesson_id=lesson.id, start_datetime=wall_start, end_datetime=end,
                              max_players=4, status="scheduled", level_id=level.id,
                              notifications_enabled=True,
                              original_lesson_occurence_date=wall_start.date())
    db.session.add(instance)
    db.session.flush()
    db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
    db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=instance.id))
    db.session.add(Association_PlayerLessonInstance(player_id=player.id, lesson_instance_id=instance.id))
    db.session.add(Presence(lesson_instance_id=instance.id, player_id=player.id, status="present",
                            invited=True, confirmed=True))
    if cancellation_hours is not None:
        db.session.add(NotificationConfig(coach_id=coach.id,
                                          restrictions={"cancellationDeadlineHours": cancellation_hours}))
    db.session.commit()
    return instance.id, su.id, player.id


# ── the late-cancellation flag counts real hours ────────────────────────────

@pytest.mark.parametrize("wall_start, utc_now, late", [
    # 09:30 UTC on 07-13 is 10:30 Lisbon: 23.5 h before a 10:00 class on 07-14.
    (at(SUMMER, 10), datetime(2026, 7, 13, 9, 30), True),
    # 09:30 UTC on 01-12 is 09:30 Lisbon: 24.5 h before a 10:00 class on 01-13.
    (at(WINTER, 10), datetime(2026, 1, 12, 9, 30), False),
])
def test_late_cancellation_flag_uses_the_club_clock(app, wall_start, utc_now, late):
    from padel_app.models.presences import Presence
    from padel_app.services.notification_service import cancel_attendance

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, user_id, player_id = _seed(wall_start)
        result = cancel_attendance(user_id, lesson_instance_id=instance_id, now=utc_now)
        presence = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=player_id).one()
        assert result["proactive"] is False
        assert presence.late_cancellation is late


# ── a class that has started can no longer be cancelled ────────────────────

@pytest.mark.parametrize("wall_start, utc_now, refused", [
    # 09:30 UTC is 10:30 Lisbon in July: the 10:00 class has started.
    (at(SUMMER, 10), datetime(2026, 7, 14, 9, 30), True),
    # 09:30 UTC is 09:30 Lisbon in January: it has not.
    (at(WINTER, 10), datetime(2026, 1, 13, 9, 30), False),
])
def test_started_class_cannot_be_cancelled_on_the_club_clock(app, wall_start, utc_now, refused):
    from padel_app.services.notification_service import cancel_attendance

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, user_id, _player_id = _seed(wall_start)
        if refused:
            with pytest.raises(HTTPException) as exc:
                cancel_attendance(user_id, lesson_instance_id=instance_id, now=utc_now)
            assert exc.value.code == 409
        else:
            assert cancel_attendance(user_id, lesson_instance_id=instance_id, now=utc_now)["action"] == "declined"


# ── the proactive-decline window closes at the real reminder instant ───────

@pytest.mark.parametrize("wall_start, utc_now, open_", [
    # Default reminder: 48 h before. A 10:00 July class is 09:00 UTC, so the
    # window closes at 09:00 UTC two days earlier; 09:30 UTC is past it.
    (at(SUMMER, 10), datetime(2026, 7, 12, 9, 30), False),
    # In January it closes at 10:00 UTC two days earlier; 09:30 UTC is before it.
    (at(WINTER, 10), datetime(2026, 1, 11, 9, 30), True),
])
def test_proactive_window_uses_the_club_clock(app, wall_start, utc_now, open_):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import proactive_decline_window_is_open

    with app.app_context():
        instance_id, _user_id, _player_id = _seed(wall_start)
        instance = LessonInstance.query.get(instance_id)
        assert proactive_decline_window_is_open(instance, None, now=utc_now) is open_


# ── the payload's deadlines are wall-clock and DST-correct ─────────────────

@pytest.mark.parametrize("wall_start, cancellation_deadline, proactive_deadline", [
    # Monday after the spring change (2026-03-29): 48 real hours before 10:00
    # WEST (09:00 UTC) is Saturday 09:00 UTC, which is 09:00 on the club's clock.
    (datetime(2026, 3, 30, 10, 0), "2026-03-28T09:00:00", "2026-03-28T09:00:00"),
    # No change in between: 48 h before is 10:00 on the club's clock.
    (at(WINTER, 10), "2026-01-11T10:00:00", "2026-01-11T10:00:00"),
])
def test_payload_deadlines_are_on_the_club_wall_clock(app, wall_start, cancellation_deadline, proactive_deadline):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.serializers.lesson import serialize_class_instance

    with app.app_context():
        instance_id, _user_id, _player_id = _seed(wall_start, cancellation_hours=48)
        payload = serialize_class_instance(LessonInstance.query.get(instance_id))
        assert payload["cancellationDeadlineHours"] == 48
        assert payload["cancellationDeadline"] == cancellation_deadline
        assert payload["proactiveDeclineDeadline"] == proactive_deadline
