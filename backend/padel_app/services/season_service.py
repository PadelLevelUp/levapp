"""calendar.seasons (PAD-82): the coach's single recurring day/month season.

Read: `get_definition`, `serialize_definition`, `legacy_season_list`,
`resolve_season_end_for_coach`. Write: `save_definition` (validate → upsert the
one row → re-cap flagged classes), `delete_definition`.
"""
from datetime import date, datetime, time, timedelta

from padel_app.sql_db import db
from padel_app.utils.dates import club_now_naive
from padel_app.tools.season_dates import (
    next_occurrence_after,
    occurrence_containing,
    occurrence_label,
    season_wraps_year,
    validate_definition,
)


class InvalidSeasonError(ValueError):
    """Rule 2 violated; the route answers 400 `invalid_season`."""

    code = "invalid_season"


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

def get_definition(coach):
    return coach.season


def _markers(definition):
    return (
        definition.start_month,
        definition.start_day,
        definition.end_month,
        definition.end_day,
    )


def _occurrence_payload(occurrence, label):
    if occurrence is None:
        return None
    start, end = occurrence
    return {
        "startDate": start.isoformat(),
        "endDate": end.isoformat(),
        "label": occurrence_label(start, end, label),
    }


def serialize_definition(definition, today=None):
    """Rule 5's shape, or `None` when the coach has no definition."""
    if definition is None:
        return None
    today = today or club_now_naive().date()  # PAD-256: the club's date
    markers = _markers(definition)
    return {
        "label": definition.label,
        "startDay": definition.start_day,
        "startMonth": definition.start_month,
        "endDay": definition.end_day,
        "endMonth": definition.end_month,
        "wrapsYear": season_wraps_year(*markers),
        "needsReview": bool(definition.needs_review),
        "current": _occurrence_payload(occurrence_containing(today, *markers), definition.label),
        "upcoming": _occurrence_payload(next_occurrence_after(today, *markers), definition.label),
    }


def current_or_upcoming_occurrence(definition, today=None):
    today = today or club_now_naive().date()  # PAD-256: the club's date
    markers = _markers(definition)
    return occurrence_containing(today, *markers) or next_occurrence_after(today, *markers)


def legacy_season_list(coach, today=None):
    """Rule 8: the pre-PAD-82 list shape for mobile build 14 — `[]` or one
    entry for the current-or-upcoming occurrence."""
    definition = coach.season
    if definition is None:
        return []
    start, end = current_or_upcoming_occurrence(definition, today)
    return [
        {
            "id": definition.id,
            "name": occurrence_label(start, end, definition.label),
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
        }
    ]


def resolve_season_end_for_coach(coach, on_date):
    """Rule 9: the end of the occurrence containing `on_date`, else None
    (no definition, or a date in a gap — the caller fails closed)."""
    definition = coach.season
    if definition is None:
        return None
    occurrence = occurrence_containing(on_date, *_markers(definition))
    return occurrence[1] if occurrence else None


def cap_for_lesson_start(definition, lesson_start):
    """Rule 6's cap: the containing occurrence's end, or the next occurrence's
    end when the start falls in a gap."""
    markers = _markers(definition)
    occurrence = occurrence_containing(lesson_start, *markers) or next_occurrence_after(lesson_start, *markers)
    return occurrence[1]


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------

def _int_field(data, key):
    value = data.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        try:
            value = int(value)
        except (TypeError, ValueError):
            raise InvalidSeasonError(f"{key} must be a whole number")
    return value


def save_definition(coach, data):
    """Rule 6: create or replace the coach's definition, then re-cap every
    lesson flagged `recurs_until_season_end`. Returns the definition."""
    from padel_app.models import CoachSeason

    start_day = _int_field(data, "startDay")
    start_month = _int_field(data, "startMonth")
    end_day = _int_field(data, "endDay")
    end_month = _int_field(data, "endMonth")
    problem = validate_definition(start_month, start_day, end_month, end_day)
    if problem:
        raise InvalidSeasonError(problem)

    label = data.get("label")
    label = label.strip()[:120] if isinstance(label, str) and label.strip() else None

    definition = coach.season
    if definition is None:
        definition = CoachSeason(coach_id=coach.id)
        db.session.add(definition)
    definition.label = label
    definition.start_day = start_day
    definition.start_month = start_month
    definition.end_day = end_day
    definition.end_month = end_month
    definition.needs_review = False
    db.session.commit()
    db.session.refresh(coach)

    recap_flagged_lessons(coach)
    return coach.season


def delete_definition(coach):
    """Rule 7: remove the definition; snapshotted `recurrence_end`s stay."""
    definition = coach.season
    if definition is None:
        return False
    db.session.delete(definition)
    db.session.commit()
    return True


def recap_flagged_lessons(coach, *, now=None):
    """Re-cap FUTURE recurring instances of every lesson flagged
    `recurs_until_season_end` to the occurrence its start date belongs to
    (rule 6). Past/held instances are never touched."""
    from padel_app.services.lesson_service import delete_future_instances
    from padel_app.utils.dates import utcnow_naive

    definition = coach.season
    if definition is None:
        return
    if now is None:
        now = utcnow_naive()

    for lesson in coach.lessons:
        if not getattr(lesson, "recurs_until_season_end", False):
            continue
        new_end = cap_for_lesson_start(definition, lesson.start_datetime.date())
        if lesson.recurrence_end == new_end:
            continue
        lesson.recurrence_end = new_end
        lesson.save()

        cutoff = datetime.combine(new_end + timedelta(days=1), time.min)
        delete_future_instances(lesson, cutoff)

        # Reschedule reminder jobs within the new horizon (no-op in tests).
        try:
            from padel_app.scheduler import (
                schedule_lesson_reminder_jobs,
                cancel_lesson_reminder_jobs,
            )

            if lesson.coaches_relations:
                coach_id = lesson.coaches_relations[0].coach_id
                cancel_lesson_reminder_jobs(lesson.id, from_date=new_end + timedelta(days=1))
                schedule_lesson_reminder_jobs(lesson.id, coach_id)
        except Exception:
            pass
