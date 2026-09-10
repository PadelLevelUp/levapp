"""calendar.seasons rules 3–4 (PAD-82): the occurrence maths for a recurring
day/month season.

Pure functions over plain ints and `datetime.date`, with no ORM import, so the
tests can pin them without an app context. Two twins exist and are pinned by
the same cases: `@levelup/config` (`season-coverage.ts`) for the shells, and
an inlined copy inside the PAD-82 Alembic migration (migrations never import
application code — see the PAD-246 migration for the precedent).

A definition is `(start_month, start_day, end_month, end_day)`. It *wraps* the
year when the end marker comes before the start marker (1 Sep → 31 Jul, the
production case). An *occurrence* is one concrete `(start_date, end_date)`,
inclusive at both ends. A date the season does not cover is a *gap* (August
for 1 Sep → 31 Jul) and answers `None`.
"""
from calendar import monthrange
from datetime import date

__all__ = [
    "clamp_day",
    "season_wraps_year",
    "occurrence_containing",
    "next_occurrence_after",
    "occurrence_label",
    "validate_definition",
]


def clamp_day(year, month, day):
    """`date(year, month, day)` with the day clamped to the month's length —
    29 February becomes 28 February in a non-leap year (rule 2)."""
    return date(year, month, min(day, monthrange(year, month)[1]))


def season_wraps_year(start_month, start_day, end_month, end_day):
    return (end_month, end_day) < (start_month, start_day)


def _occurrence_starting(year, start_month, start_day, end_month, end_day):
    start = clamp_day(year, start_month, start_day)
    end_year = year + 1 if season_wraps_year(start_month, start_day, end_month, end_day) else year
    return start, clamp_day(end_year, end_month, end_day)


def occurrence_containing(on_date, start_month, start_day, end_month, end_day):
    """The `(start, end)` occurrence containing `on_date`, or `None` in a gap."""
    wraps = season_wraps_year(start_month, start_day, end_month, end_day)
    year = on_date.year
    if not wraps:
        start, end = _occurrence_starting(year, start_month, start_day, end_month, end_day)
        return (start, end) if start <= on_date <= end else None
    start_this_year = clamp_day(year, start_month, start_day)
    if on_date >= start_this_year:
        return _occurrence_starting(year, start_month, start_day, end_month, end_day)
    end_this_year = clamp_day(year, end_month, end_day)
    if on_date <= end_this_year:
        return _occurrence_starting(year - 1, start_month, start_day, end_month, end_day)
    return None


def next_occurrence_after(on_date, start_month, start_day, end_month, end_day):
    """The first occurrence whose start is strictly after `on_date`."""
    for year in (on_date.year, on_date.year + 1):
        start, end = _occurrence_starting(year, start_month, start_day, end_month, end_day)
        if start > on_date:
            return start, end
    # Unreachable for a valid definition (an occurrence starts every year), but
    # keep the function total.
    return _occurrence_starting(on_date.year + 2, start_month, start_day, end_month, end_day)


def occurrence_label(start, end, label=None):
    """The coach's own label, else "2026/2027" for a wrapping occurrence and
    "2026" for one inside a single year."""
    if label:
        return label
    return f"{start.year}/{end.year}" if end.year != start.year else str(start.year)


def validate_definition(start_month, start_day, end_month, end_day):
    """`None` when the definition is valid, else the reason (rule 2)."""
    for name, month in (("start", start_month), ("end", end_month)):
        if not isinstance(month, int) or isinstance(month, bool) or not 1 <= month <= 12:
            return f"{name} month must be between 1 and 12"
    for name, month, day in (("start", start_month, start_day), ("end", end_month, end_day)):
        if not isinstance(day, int) or isinstance(day, bool) or day < 1:
            return f"{name} day must be at least 1"
        # 29 February is allowed (it clamps); use a leap year for the bound.
        if day > monthrange(2024, month)[1]:
            return f"{name} day is not valid for that month"
    if (start_month, start_day) == (end_month, end_day):
        return "a season must span at least one day"
    return None
