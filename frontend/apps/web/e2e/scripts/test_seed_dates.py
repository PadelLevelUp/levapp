"""PAD-223: the seed's fixtures never collide, whatever weekday the suite runs on.

Run from the backend venv: ``python -m pytest frontend/apps/web/e2e/scripts``.
Pure — no Flask, no database.
"""
from datetime import datetime, timedelta

import pytest

from seed_dates import seed_dates, seed_today

# One full week: Monday 2026-09-07 through Sunday 2026-09-13.
WEEK = [datetime(2026, 9, 7) + timedelta(days=i) for i in range(7)]


def _overlaps(a_start, a_end, b_start, b_end):
    return a_start < b_end and b_start < a_end


@pytest.mark.parametrize("today", WEEK, ids=[d.strftime("%a") for d in WEEK])
def test_academy_class_is_the_students_soonest_class(today):
    """The Monday collision: the recurring class must never land before the academy class."""
    d = seed_dates(today)
    assert d.academy_start.weekday() == 0
    assert today < d.academy_start <= today + timedelta(days=7, hours=10)
    assert d.recurring_start > d.academy_start
    assert d.recurring_start.weekday() == 1
    assert "\"daysOfWeek\": [2]" in d.recurring_rule


@pytest.mark.parametrize("today", WEEK, ids=[d.strftime("%a") for d in WEEK])
def test_pending_class_is_tomorrow_and_clear_of_the_availability_windows(today):
    """The Sunday collision: tomorrow's class must not touch the specs' evening windows."""
    d = seed_dates(today)
    assert d.pending_start.date() == (today + timedelta(days=1)).date()
    tomorrow = d.pending_start.replace(hour=0)
    for start_h, start_m, end_h, end_m in ((15, 0, 16, 0), (18, 0, 20, 0), (19, 15, 19, 45)):
        window_start = tomorrow.replace(hour=start_h, minute=start_m)
        window_end = tomorrow.replace(hour=end_h, minute=end_m)
        assert not _overlaps(d.pending_start, d.pending_end, window_start, window_end)


@pytest.mark.parametrize("today", WEEK, ids=[d.strftime("%a") for d in WEEK])
def test_future_fixtures_never_overlap_each_other(today):
    d = seed_dates(today)
    future = [
        ("academy", d.academy_start, d.academy_end),
        ("declined", d.declined_start, d.declined_end),
        ("recurring", d.recurring_start, d.recurring_end),
        ("pending", d.pending_start, d.pending_end),
        ("upcoming", d.upcoming_start, d.upcoming_end),
    ]
    for i, (name_a, a0, a1) in enumerate(future):
        for name_b, b0, b1 in future[i + 1 :]:
            assert not _overlaps(a0, a1, b0, b1), f"{name_a} overlaps {name_b} on {today:%A}"


@pytest.mark.parametrize("today", WEEK, ids=[d.strftime("%a") for d in WEEK])
def test_past_fixtures_stay_in_earlier_weeks(today):
    """History and validation rows must never crowd the calendar's default week."""
    d = seed_dates(today)
    this_monday = today - timedelta(days=today.weekday())
    for start in d.attended_starts:
        assert start < this_monday
    for start, _ in d.missed_starts:
        assert start < this_monday
    for start, _ in d.validation_starts:
        assert start < this_monday
        assert start >= this_monday - timedelta(days=7), "validation classes sit in LAST week"


def test_today_can_be_pinned_for_reproduction():
    assert seed_today({"E2E_SEED_TODAY": "2026-09-13"}) == datetime(2026, 9, 13)
    real = seed_today({})
    assert (real.hour, real.minute, real.second) == (0, 0, 0)


# ── PAD-256: the seed's "today" is the club's date ─────────────────────────

def _frozen(utc_now):
    """A datetime whose now() is `utc_now` (naive UTC), converted to any zone."""
    from datetime import datetime as _dt, timezone as _tz

    class Frozen(_dt):
        @classmethod
        def now(cls, tz=None):
            aware = utc_now.replace(tzinfo=_tz.utc)
            return aware.astimezone(tz) if tz is not None else utc_now

    return Frozen


def test_today_is_the_club_date_in_summer_and_winter(monkeypatch):
    """Fixture times are Lisbon wall-clock (R-023), so "today" is the Lisbon
    date. At 23:30 UTC in July it is already the next day in Lisbon; in January
    Lisbon is UTC."""
    import seed_dates as sd

    monkeypatch.setattr(sd, "datetime", _frozen(datetime(2027, 7, 12, 23, 30)))
    assert sd.seed_today({}) == datetime(2027, 7, 13)
    monkeypatch.setattr(sd, "datetime", _frozen(datetime(2027, 1, 11, 23, 30)))
    assert sd.seed_today({}) == datetime(2027, 1, 11)



# ── PAD-343: every fixture a dashboard spec reads is inside that block's window ──
#
# Walking the weekday at midnight hid the Monday failure: the academy class is
# 7 days + 10 h after midnight, so it is outside a [now, now + 7 days) window
# only for a run between 00:00 and 10:00. The walk below adds the run's hour,
# and a run that crosses midnight after seeding (a long suite seeded at 23:59).

COACH_SCHEDULE_DAYS = 7  # backend/padel_app/helpers/dashboard/coach_home.py SCHEDULE_DAYS
COACH_SCHEDULE_ROWS = 5  # ...SCHEDULE_ROWS: rows the coach's list shows
PLAYER_SCHEDULE_DAYS = 30  # backend/padel_app/helpers/dashboard/player_home.py PLAYER_SCHEDULE_DAYS

# Minutes after the seed's midnight at which a spec reads the dashboard: early
# morning (the Monday sweep ran at 06:39), just either side of 10:00, the last
# minute of the day, and a suite seeded at 23:59 still running 3 hours later.
RUN_OFFSETS = [timedelta(minutes=m) for m in (1, 6 * 60 + 39, 9 * 60 + 59, 10 * 60 + 1, 23 * 60 + 59, 27 * 60)]


def _runs():
    for today in WEEK:
        for offset in RUN_OFFSETS:
            yield pytest.param(today, today + offset, id=f"{today:%a}+{int(offset.total_seconds() // 60)}m")


def _in_window(start, end, now, days):
    """The dashboards' one predicate: overlaps [now, now + days)."""
    return end > now and start < now + timedelta(days=days)


def _coach_future_classes(d):
    """Every seeded class on the coach's calendar that can fall in the next 7 days."""
    classes = [
        ("academy", d.academy_start, d.academy_end),
        ("declined", d.declined_start, d.declined_end),
        ("pending", d.pending_start, d.pending_end),
        ("upcoming", d.upcoming_start, d.upcoming_end),
    ]
    first_tuesday = d.recurring_start
    for week in range(2):
        start = first_tuesday + timedelta(weeks=week)
        classes.append((f"recurring+{week}w", start, start + (d.recurring_end - d.recurring_start)))
    return classes


@pytest.mark.parametrize("today,now", list(_runs()))
def test_coach_next_7_days_lists_the_upcoming_fixture(today, now):
    """dashboard/upcoming-class-deeplink.spec.ts (coach) and Maestro 02-coach-dashboard
    read "E2E Upcoming Class" in the coach's "Next 7 days" — inside the window and
    within the rows shown, with room to spare for a class a spec adds."""
    d = seed_dates(today)
    assert _in_window(d.upcoming_start, d.upcoming_end, now, COACH_SCHEDULE_DAYS)
    listed = sorted(
        (start, name)
        for name, start, end in _coach_future_classes(d)
        if _in_window(start, end, now, COACH_SCHEDULE_DAYS)
    )
    row = [name for _, name in listed].index("upcoming") + 1
    assert row <= COACH_SCHEDULE_ROWS - 2, f"row {row} of {COACH_SCHEDULE_ROWS}: {listed}"


@pytest.mark.parametrize("today", WEEK, ids=[d.strftime("%a") for d in WEEK])
def test_upcoming_fixture_is_in_a_later_week_except_on_monday(today):
    """The deeplink spec proves the click selects the class's week. That is only
    visible when the class is not in the calendar's default (Monday) week, which
    is impossible for anything inside a 7-day window on a Monday before 10:00."""
    d = seed_dates(today)
    this_monday = today - timedelta(days=today.weekday())
    later_week = d.upcoming_start >= this_monday + timedelta(days=7)
    assert later_week == (today.weekday() != 0)


@pytest.mark.parametrize("today,now", list(_runs()))
def test_student_schedule_lists_the_academy_class(today, now):
    """student-dashboard-home, student-dashboard-kpi and the student deeplink test
    read "E2E Academy Class" in the student's schedule, a 30-day window."""
    d = seed_dates(today)
    assert _in_window(d.academy_start, d.academy_end, now, PLAYER_SCHEDULE_DAYS)


def test_the_academy_class_is_not_a_coach_next_7_days_fixture():
    """Why the upcoming fixture exists: on a Monday before 10:00 the academy
    class is outside the coach's window. If this ever passes, the fixture can go."""
    monday = WEEK[0]
    d = seed_dates(monday)
    assert not _in_window(d.academy_start, d.academy_end, monday + timedelta(hours=6, minutes=39), COACH_SCHEDULE_DAYS)
