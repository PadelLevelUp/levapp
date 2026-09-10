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
