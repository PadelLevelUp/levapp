"""
PAD-256, reminders (notifications.reminders rule 15; R-023; decision
2026-09-10-class-time-storage, option B).

A class's `start_datetime` is the Lisbon wall-clock time the coach typed. The
scheduler and the "has it started" checks treated it as UTC, so from April to
October every reminder fired an hour late, a class at 23:00 or later got its
day-before reminder a day late, and a reminder could still go out in the
class's first hour. In winter Lisbon is UTC+0, so the same code was right, and
the bug looked intermittent.

Every behaviour is pinned twice: once on a summer date (WEST, UTC+1) and once on
a winter date (WET, UTC+0). A regression to "wall time read as UTC" fails the
summer half and passes the winter one, which is exactly how this bug hid.

`now` stays the UTC instant (it is also written as `reminder_attempts.sent_at`,
an event timestamp); it is converted to the club's clock only where it meets a
class time.
"""
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from padel_app.sql_db import db


SUMMER = datetime(2026, 7, 14)   # Tuesday, WEST (UTC+1)
WINTER = datetime(2026, 1, 13)   # Tuesday, WET (UTC+0)


def at(day, hour, minute=0):
    return day.replace(hour=hour, minute=minute)


# ── the two clocks ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("wall, utc", [
    (at(SUMMER, 14), datetime(2026, 7, 14, 13, 0)),
    (at(WINTER, 14), datetime(2026, 1, 13, 14, 0)),
])
def test_wall_to_utc_and_back(wall, utc):
    from padel_app.utils.dates import utc_to_wall_naive, wall_to_utc_naive

    assert wall_to_utc_naive(wall) == utc
    assert utc_to_wall_naive(utc) == wall


@pytest.mark.parametrize("utc_now, wall_now", [
    (datetime(2026, 7, 14, 9, 30), datetime(2026, 7, 14, 10, 30)),
    (datetime(2026, 1, 13, 9, 30), datetime(2026, 1, 13, 9, 30)),
])
def test_club_now_is_utc_now_on_the_club_clock(monkeypatch, utc_now, wall_now):
    from padel_app.utils import dates

    monkeypatch.setattr(dates, "utcnow_naive", lambda: utc_now)
    assert dates.club_now_naive() == wall_now


# ── when a reminder fires ───────────────────────────────────────────────────

@pytest.mark.parametrize("wall_start, timing, fires_utc", [
    # 24 h before a 14:00 class: 14:00 Lisbon the day before.
    (at(SUMMER, 14), {"type": "hours_before", "value": 24}, datetime(2026, 7, 13, 13, 0)),
    (at(WINTER, 14), {"type": "hours_before", "value": 24}, datetime(2026, 1, 12, 14, 0)),
    # Real hours across the spring change: 48 h before Monday 2026-03-30 10:00 WEST
    # (09:00 UTC) is Saturday 09:00 UTC, which is 09:00 WET.
    (datetime(2026, 3, 30, 10, 0), {"type": "hours_before", "value": 48}, datetime(2026, 3, 28, 9, 0)),
    # ... and across the autumn change: 48 h before Monday 2025-10-27 10:00 WET
    # (10:00 UTC) is Saturday 10:00 UTC, which is 11:00 WEST.
    (datetime(2025, 10, 27, 10, 0), {"type": "hours_before", "value": 48}, datetime(2025, 10, 25, 10, 0)),
    # Day before at 18:00, on the class's OWN date, for a late class.
    (at(SUMMER, 23, 30), {"type": "days_before", "days": 1, "time": "18:00"}, datetime(2026, 7, 13, 17, 0)),
    (at(WINTER, 23, 30), {"type": "days_before", "days": 1, "time": "18:00"}, datetime(2026, 1, 12, 18, 0)),
    # ... and for an early one.
    (at(SUMMER, 0, 30), {"type": "days_before_at_time", "days": 1, "time": "18:00"}, datetime(2026, 7, 13, 17, 0)),
    (at(WINTER, 0, 30), {"type": "days_before_at_time", "days": 1, "time": "18:00"}, datetime(2026, 1, 12, 18, 0)),
])
def test_reminder_fire_time_is_on_the_club_clock(wall_start, timing, fires_utc):
    from padel_app.scheduler import _fire_time_utc

    assert _fire_time_utc(wall_start, timing) == fires_utc


def test_fire_time_is_none_without_a_timing():
    from padel_app.scheduler import _fire_time_utc

    assert _fire_time_utc(at(SUMMER, 14), None) is None
    assert _fire_time_utc(at(SUMMER, 14), {"type": "unknown"}) is None


# ── seeding ─────────────────────────────────────────────────────────────────

def _seed(app, wall_start):
    """Coach, student, club, level, a one-off class at `wall_start`, the coach
    and the student on the instance. Returns (coach_id, student_id, instance_id)."""
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_PlayerLessonInstance import Association_PlayerLessonInstance
    from padel_app.models.clubs import Club
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.players import Player
    from padel_app.models.users import User

    tag = wall_start.strftime("%Y%m%d%H%M")
    coach_user = User(name="Coach", username=f"coach{tag}", email=f"c{tag}@t.test", password="x", status="active")
    student_user = User(name="Student", username=f"student{tag}", email=f"s{tag}@t.test", password="x", status="active")
    db.session.add_all([coach_user, student_user])
    db.session.flush()
    coach = Coach(user_id=coach_user.id)
    student = Player(user_id=student_user.id)
    club = Club(name=f"Club {tag}", description="", location="Lisboa")
    db.session.add_all([coach, student, club])
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
    db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=instance.id))
    db.session.add(Association_PlayerLessonInstance(player_id=student.id, lesson_instance_id=instance.id))
    db.session.commit()
    return coach.id, student.id, instance.id


# ── the scheduler arms the reminder at the club's time ─────────────────────

@pytest.mark.parametrize("wall_start, fires_utc", [
    (at(SUMMER, 14), datetime(2026, 7, 13, 13, 0)),
    (at(WINTER, 14), datetime(2026, 1, 12, 14, 0)),
])
def test_schedule_instance_jobs_arms_the_reminder_on_the_club_clock(app, monkeypatch, wall_start, fires_utc):
    from padel_app import scheduler

    fake_scheduler = MagicMock()
    monkeypatch.setattr(scheduler, "_scheduler", fake_scheduler)
    monkeypatch.setattr(scheduler, "_app", app)
    config = SimpleNamespace(
        get_reminder_timing=lambda: {"type": "hours_before", "value": 24},
        get_invitation_start_timing=lambda: None,
    )
    with app.app_context():
        coach_id, _student_id, instance_id = _seed(app, wall_start)
        with patch("padel_app.services.notification_service.get_or_create_config", return_value=config):
            scheduler.schedule_instance_jobs(instance_id, coach_id, now=datetime(2025, 12, 1))

    armed = {c.kwargs["id"]: c.kwargs["trigger"] for c in fake_scheduler.add_job.call_args_list}
    assert f"reminder_{instance_id}" in armed, armed
    assert armed[f"reminder_{instance_id}"].run_date.replace(tzinfo=None) == fires_utc


# ── a class that has started gets no reminder ──────────────────────────────

PATCHES = (
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
)


@pytest.mark.parametrize("wall_start, utc_now, expect_sent", [
    # 09:30 UTC is 10:30 Lisbon in July: the 10:00 class has started.
    (at(SUMMER, 10), datetime(2026, 7, 14, 9, 30), 0),
    # 09:30 UTC is 09:30 Lisbon in January: the 10:00 class has not.
    (at(WINTER, 10), datetime(2026, 1, 13, 9, 30), 1),
])
def test_send_guard_uses_the_club_clock(app, wall_start, utc_now, expect_sent):
    from padel_app.models.presences import Presence
    from padel_app.services.notification_service import send_class_reminders

    with app.app_context():
        _coach_id, student_id, instance_id = _seed(app, wall_start)
        with patch(PATCHES[0]), patch(PATCHES[1]):
            result = send_class_reminders(instance_id, now=utc_now)
        assert result["sent"] == expect_sent, result
        reminded = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=student_id).count()
        assert reminded == expect_sent


# ── the follow-up pass is never armed at or after the start ────────────────

@pytest.mark.parametrize("wall_start, utc_now, rearmed", [
    # 09:30 UTC + 2 h = 11:30 UTC = 12:30 Lisbon, after a 12:00 class: no follow-up.
    (at(SUMMER, 12), datetime(2026, 7, 14, 9, 30), False),
    # 09:30 UTC + 2 h = 11:30 Lisbon in January, before 12:00: follow-up armed.
    (at(WINTER, 12), datetime(2026, 1, 13, 9, 30), True),
])
def test_rearm_never_lands_after_the_start(app, monkeypatch, wall_start, utc_now, rearmed):
    from padel_app import scheduler
    from padel_app.models.lesson_instances import LessonInstance

    fake_scheduler = MagicMock()
    monkeypatch.setattr(scheduler, "_scheduler", fake_scheduler)
    monkeypatch.setattr(scheduler, "utcnow_naive", lambda: utc_now)
    config = SimpleNamespace(get_hours_between_reminders=lambda: 2)
    with app.app_context():
        _coach_id, _student_id, instance_id = _seed(app, wall_start)
        instance = LessonInstance.query.get(instance_id)
        with patch("padel_app.services.notification_service.get_or_create_config", return_value=config):
            scheduler._maybe_rearm_reminder(
                instance, func=lambda *a: None, args=[instance_id],
                base_job_id=f"reminder_{instance_id}", result={"more_due": True},
            )
    assert fake_scheduler.add_job.called is rearmed
