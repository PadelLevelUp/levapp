"""import.onboarding-runner, history runs (rules 15 to 30): what a history file holds.

`validate` is the file's own check (rules 15, 16, 29 and 30's shape): every problem in file order,
before the database is read. `padel_app.services.onboarding_service` calls it from `validate_file`.
"""
import re
from datetime import date

_HH_MM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
ABSENCE_TYPES = ("justified", "unjustified", "coach")
EXCLUDED_KINDS = ("absence", "guest")
#: `presences.note` holds at most this many characters (attendance.presence rule 11).
NOTE_LIMIT = 1000
_SEASON_LABEL_LIMIT = 120


def _date(value):
    try:
        return date.fromisoformat(value) if isinstance(value, str) else None
    except ValueError:
        return None


def _text(value):
    return isinstance(value, str) and value.strip() != ""


def _count(value, minimum=1):
    return isinstance(value, int) and not isinstance(value, bool) and value >= minimum


def validate(data):
    """Rule 16's problems with ``data["history"]``, plus the history-only parts of ``expects``."""
    from padel_app.services.onboarding_service import name_key

    history = data.get("history")
    if not isinstance(history, dict):
        return ["history must be an object"]
    problems = []

    expects = data.get("expects") if isinstance(data.get("expects"), dict) else {}
    for key in ("instances", "coach_marks"):
        if not (isinstance(expects.get(key), int) and not isinstance(expects.get(key), bool) and expects[key] >= 0):
            problems.append(f"expects.{key} must be the coach's number of {key.replace('_', ' ')} before the run")

    first, last = _date(history.get("from")), _date(history.get("through"))
    if first is None:
        problems.append("history.from must be a YYYY-MM-DD date")
    if last is None:
        problems.append("history.through must be a YYYY-MM-DD date")
    if first and last and first > last:
        problems.append(f"history.from {history['from']} is after history.through {history['through']}")

    def in_range(day, where):
        if day is not None and first and last and not first <= day <= last:
            problems.append(f"{where}: date {day.isoformat()} is outside {history['from']}..{history['through']}")

    def row_date(row, where, field="date", required=True):
        value = row.get(field)
        if value is None and not required:
            return None
        day = _date(value)
        if day is None:
            problems.append(f"{where}: {field} must be a YYYY-MM-DD date")
        return day

    def listed(field):
        rows = history.get(field, [])
        if not isinstance(rows, list):
            problems.append(f"history.{field} must be a list")
            return []
        return rows

    season = history.get("season")
    if season is not None:
        if not isinstance(season, dict):
            problems.append("history.season must be an object")
        else:
            start, end = _date(season.get("start_date")), _date(season.get("end_date"))
            if start is None or end is None:
                problems.append("history.season needs start_date and end_date as YYYY-MM-DD dates")
            else:
                if start >= end:
                    problems.append("history.season: start_date must be before end_date")
                elif (end - start).days >= 366:
                    problems.append("history.season: the span must be under one year")
                if first and not start <= first <= end:
                    problems.append("history.season must contain history.from")
            label = season.get("label")
            if label is not None and not (_text(label) and len(label) <= _SEASON_LABEL_LIMIT):
                problems.append(f"history.season: label must be text of at most {_SEASON_LABEL_LIMIT} characters")

    source_rows = {}

    def source_row(row, where):
        value = row.get("source_row")
        if value is None:
            return
        if not _count(value):
            problems.append(f"{where}: source_row must be a positive whole number")
        elif value in source_rows:
            problems.append(f"{where}: source_row {value} is also {source_rows[value]}")
        else:
            source_rows[value] = where

    def student_of(row, where):
        if not _text(row.get("student")):
            problems.append(f"{where}: student must be a name")
            return None
        return name_key(row["student"])

    seen_absences = {}
    for index, row in enumerate(listed("absences")):
        where = f"absences[{index}]"
        if not isinstance(row, dict):
            problems.append(f"{where} must be an object")
            continue
        student = student_of(row, where)
        day = row_date(row, where)
        in_range(day, where)
        if row.get("type") not in ABSENCE_TYPES:
            problems.append(f"{where}: type must be justified, unjustified or coach")
        if not _count(row.get("minutes")):
            problems.append(f"{where}: minutes must be a positive whole number")
        note = row.get("note")
        if note is not None and not isinstance(note, str):
            problems.append(f"{where}: note must be text")
        elif isinstance(note, str) and len(note) > NOTE_LIMIT:
            problems.append(f"{where}: note is longer than {NOTE_LIMIT} characters")
        if row.get("start_time") is not None and not (
            isinstance(row["start_time"], str) and _HH_MM.match(row["start_time"])
        ):
            problems.append(f"{where}: start_time must be HH:MM")
        row_date(row, where, "sheet_date", required=False)
        source_row(row, where)
        if student and day:
            if (student, day) in seen_absences:
                problems.append(f"{where}: {row['student']} already has an absence on {day.isoformat()} ({seen_absences[(student, day)]})")
            else:
                seen_absences[(student, day)] = where

    for index, row in enumerate(listed("guests")):
        where = f"guests[{index}]"
        if not isinstance(row, dict):
            problems.append(f"{where} must be an object")
            continue
        student_of(row, where)
        in_range(row_date(row, where), where)
        if not (isinstance(row.get("start_time"), str) and _HH_MM.match(row["start_time"])):
            problems.append(f"{where}: start_time must be HH:MM")
        if not _count(row.get("minutes")):
            problems.append(f"{where}: minutes must be a positive whole number")
        row_date(row, where, "sheet_date", required=False)
        source_row(row, where)

    for index, row in enumerate(listed("adjustments")):
        where = f"adjustments[{index}]"
        if not isinstance(row, dict):
            problems.append(f"{where} must be an object")
            continue
        student_of(row, where)
        in_range(row_date(row, where), where)
        for field in ("minutes", "lesson_minutes"):
            if (field == "minutes" or row.get(field) is not None) and not _count(row.get(field)):
                problems.append(f"{where}: {field} must be a positive whole number")
        if row.get("start_time") is not None and not (
            isinstance(row["start_time"], str) and _HH_MM.match(row["start_time"])
        ):
            problems.append(f"{where}: start_time must be HH:MM")

    for index, row in enumerate(listed("excluded")):
        where = f"excluded[{index}]"
        if not isinstance(row, dict):
            problems.append(f"{where} must be an object")
            continue
        if not _count(row.get("source_row")):
            problems.append(f"{where}: source_row must be a positive whole number")
        else:
            source_row(row, where)
        student_of(row, where)
        if row.get("kind") not in EXCLUDED_KINDS:
            problems.append(f"{where}: kind must be absence or guest")
        if row.get("type") is not None and row["type"] not in ABSENCE_TYPES:
            problems.append(f"{where}: type must be justified, unjustified or coach")
        if not _count(row.get("minutes")):
            problems.append(f"{where}: minutes must be a positive whole number")
        if not _text(row.get("reason")):
            problems.append(f"{where}: a reason is needed")

    for index, row in enumerate(listed("sheet_totals")):
        where = f"sheet_totals[{index}]"
        if not isinstance(row, dict):
            problems.append(f"{where} must be an object")
            continue
        student_of(row, where)
        for field in ("justified_minutes", "unjustified_minutes", "guest_minutes"):
            if row.get(field) is not None and not _count(row[field], 0):
                problems.append(f"{where}: {field} must be a whole number of minutes")

    return problems
