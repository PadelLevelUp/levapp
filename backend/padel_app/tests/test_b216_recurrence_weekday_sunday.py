"""B-216: moving a recurring class's date rewrites its `daysOfWeek` — on the calendar's
convention, 0 = Sunday … 6 = Saturday (`calendar_tools.WEEKDAY_MAP`, date-fns `getDay`).

`update_recurrence_weekday` computed weekdays as `date.weekday() + 1` (ISO, Sunday = 7). Monday to
Saturday coincide (1..6) — Sunday does not. Moving an occurrence ONTO a Sunday wrote 7, which
`WEEKDAY_MAP` drops, so the series lost that day; moving one OFF a Sunday never removed the stored 0.
"""
import json
from datetime import date, datetime
from types import SimpleNamespace

from padel_app.services.lesson_service import update_recurrence_weekday
from padel_app.tools.calendar_tools import expand_occurrences

MON, TUE, WED, SUN = date(2026, 10, 5), date(2026, 10, 6), date(2026, 10, 7), date(2026, 10, 4)


def _moved(days, old, new):
    lesson = SimpleNamespace(recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": days}))
    return json.loads(update_recurrence_weekday(lesson, old_date=old, new_date=new))


def _weekdays_expanded(rule, start):
    occ = expand_occurrences(
        datetime.combine(start, datetime.min.time().replace(hour=10)),
        json.dumps(rule),
        date(2026, 10, 31),
        datetime(2026, 10, 1),
        datetime(2026, 10, 31, 23, 59),
    )
    return sorted({o.date().isoweekday() % 7 for o in occ})  # back to 0 = Sunday


def test_moving_a_monday_occurrence_onto_a_sunday_keeps_the_sunday():
    rule = _moved([1, 3], old=MON, new=SUN)  # Mon + Wed, the Monday moves to Sunday
    assert rule["daysOfWeek"] == [0, 3]
    assert _weekdays_expanded(rule, SUN) == [0, 3]


def test_moving_a_sunday_occurrence_off_the_sunday_drops_it():
    rule = _moved([0], old=SUN, new=TUE)
    assert rule["daysOfWeek"] == [2]
    assert _weekdays_expanded(rule, TUE) == [2]


def test_weekdays_other_than_sunday_are_unchanged_by_the_convention():
    # Monday..Saturday are 1..6 in both conventions: the control cell.
    rule = _moved([1, 3], old=MON, new=TUE)
    assert rule["daysOfWeek"] == [2, 3]
    assert _weekdays_expanded(rule, TUE) == [2, 3]
