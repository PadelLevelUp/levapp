"""import.onboarding-runner, history runs (rules 15 to 30): what a history file holds.

`validate` is the file's own check (rules 15, 16, 29 and 30's shape): every problem in file order,
before the database is read. `padel_app.services.onboarding_service` calls it from `validate_file`.
"""
import re
from datetime import date, timedelta

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


# ---------------------------------------------------------------------------
# rules 17, 18, 25, 28 — the target: every row resolved to a class, the plan and the table
# ---------------------------------------------------------------------------

#: `record_ids["_onboarding"]["history"]` of a history run's row (rule 25: one active run per coach).
HISTORY_FLAG = "history"
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


class _Class:
    """One weekly class of the coach, as it is now (rule 17: today's roster stands for the period)."""

    def __init__(self, lesson, first_day, cutoff_mark):
        self.lesson = lesson
        self.title = lesson.title
        self.weekday = lesson.start_datetime.weekday()
        self.start = lesson.start_datetime.strftime("%H:%M")
        self.minutes = int((lesson.end_datetime - lesson.start_datetime).total_seconds() // 60)
        self.roster = {
            _key(rel.player.user.name) for rel in lesson.players_relations if rel.player and rel.player.user
        }
        # Rule 19: the first date on or after `from` on the class's weekday.
        self.new_start = first_day + timedelta(days=(self.weekday - first_day.weekday()) % 7)
        self.moves = self.new_start < lesson.start_datetime.date()
        self.first_mark = cutoff_mark  # date of the first coach-made mark, or None
        self.excluded = lesson.excluded_date_set()
        self.until = lesson.recurrence_end

    def cutoff(self, through):
        """Rule 20: the earlier of `through` and the day before the first coach-made mark."""
        if self.first_mark is None:
            return through
        return min(through, self.first_mark - timedelta(days=1))

    def has_occurrence(self, day, through):
        if day.weekday() != self.weekday or day in self.excluded:
            return False
        start = min(self.new_start, self.lesson.start_datetime.date())
        return start <= day <= self.cutoff(through) and (self.until is None or day <= self.until)

    def occurrences(self, through):
        day, out = self.new_start if self.moves else self.lesson.start_datetime.date(), []
        while day <= self.cutoff(through):
            if self.has_occurrence(day, through):
                out.append(day)
            day += timedelta(days=7)
        return out


def _key(name):
    from padel_app.services.onboarding_service import name_key

    return name_key(name)


class HistoryPlan:
    def __init__(self):
        self.classes = []
        self.absences = []   # resolved rows: dicts with the row's fields and `class`
        self.guests = []
        self.adjustments = []  # {"student", "date", "lessons", "lesson_minutes", "minutes", "clashes"}
        self.problems = []
        self.players_to_create = []
        self.season_to_create = None
        self.table = []


def _coach_made():
    """Rule 20: a row the coach made, or one validated by someone other than this import (rows from before
    `recorded_by` existed carry NULL)."""
    from sqlalchemy import or_

    from padel_app.models import Presence

    return (Presence.validated.is_(True)) & or_(Presence.recorded_by.is_(None), Presence.recorded_by != "import")


def _is_coach_made(presence):
    return bool(presence.validated) and presence.recorded_by != "import"


def _instance_facts(coach_id):
    """(instance count, coach-made marks, {lesson id: date of its first coach-made mark})."""
    from sqlalchemy import func

    from padel_app.models import Association_CoachLesson, LessonInstance, Presence
    from padel_app.sql_db import db

    lesson_ids = db.session.query(Association_CoachLesson.lesson_id).filter_by(coach_id=coach_id)
    instances = LessonInstance.query.filter(LessonInstance.lesson_id.in_(lesson_ids))
    marks = (
        Presence.query.join(LessonInstance, LessonInstance.id == Presence.lesson_instance_id)
        .filter(LessonInstance.lesson_id.in_(lesson_ids), _coach_made())
    )
    firsts = dict(
        db.session.query(LessonInstance.lesson_id, func.min(LessonInstance.start_datetime))
        .join(Presence, Presence.lesson_instance_id == LessonInstance.id)
        .filter(LessonInstance.lesson_id.in_(lesson_ids), _coach_made())
        .group_by(LessonInstance.lesson_id)
        .all()
    )
    return instances.count(), marks.count(), {k: v.date() for k, v in firsts.items()}


def target_problems(data, coach):
    """Rules 25 and 28 against the database: the pinned starting state, one active history run, the season."""
    import json

    from padel_app.models import BulkImport
    from padel_app.services.onboarding_service import MARKER

    problems = []
    instances, marks, _ = _instance_facts(coach.id)
    expects = data["expects"]
    for label, found, wanted in (("instances", instances, expects["instances"]),
                                 ("coach marks", marks, expects["coach_marks"])):
        if found != wanted:
            problems.append(f"the file expects {wanted} {label}, found {found}")
    for run in BulkImport.query.filter_by(coach_id=coach.id, status="active").all():
        if not (run.filename or "").startswith(MARKER):
            continue
        meta = (json.loads(run.record_ids or "{}")).get("_onboarding") or {}
        if meta.get(HISTORY_FLAG):
            problems.append(f"the coach already has an active history run ({run.filename}, import #{run.id})")
    if data["history"].get("season") is not None:
        from padel_app.models import Association_CoachLesson, Lesson

        following = [
            lesson.title for lesson in
            Lesson.query.join(Association_CoachLesson, Association_CoachLesson.lesson_id == Lesson.id)
            .filter(Association_CoachLesson.coach_id == coach.id, Lesson.recurs_until_season_end.is_(True))
        ]
        if following:
            problems.append(
                "the file gives a season but the coach has classes that follow the season end ("
                + ", ".join(following) + "): saving a season re-caps them and deletes future occurrences"
            )
    if data["history"].get("season") is not None and coach.season is not None:
        problems.append(
            f"the coach already has a season ({coach.season.display_name}): a coach has one season, "
            "so the file's season cannot be added"
        )
    return problems


def plan(data, coach):
    """Rule 17: resolve every row, collect every problem, and build the table of rule 18. Writes nothing."""
    from padel_app.models import Association_CoachLesson, Lesson
    from padel_app.utils.dates import club_now_naive

    history = data["history"]
    first, through = date.fromisoformat(history["from"]), date.fromisoformat(history["through"])
    result = HistoryPlan()
    if through >= club_now_naive().date():
        result.problems.append(
            f"history.through {history['through']} must be before today on the club's clock "
            f"({club_now_naive().date().isoformat()}): a class not yet over is never written (rule 20)"
        )
    if history.get("season") is not None:
        result.season_to_create = history["season"]
    result.players_to_create = [p["name"] for p in data.get("players", [])]

    _, _, first_marks = _instance_facts(coach.id)
    lessons = (
        Lesson.query.join(Association_CoachLesson, Association_CoachLesson.lesson_id == Lesson.id)
        .filter(Association_CoachLesson.coach_id == coach.id, Lesson.is_recurring.is_(True))
        .order_by(Lesson.id).all()
    )
    result.classes = [_Class(lesson, first, first_marks.get(lesson.id)) for lesson in lessons]
    classes = result.classes

    from padel_app.models import Association_CoachPlayer

    roster = {_key(link.player.user.name): link.player
              for link in Association_CoachPlayer.query.filter_by(coach_id=coach.id)
              if link.player and link.player.user}
    created = {_key(name) for name in result.players_to_create}
    known = set(roster) | created
    in_classes = {}
    for c in classes:
        for person in c.roster:
            in_classes.setdefault(person, []).append(c)

    def where(kind, index, row):
        return f"{kind}[{index}] ({row['student']}, {row['date']}" + (
            f", sheet {row['sheet_date']}" if row.get("sheet_date") else "") + ")"

    def refuse(kind, index, row, why):
        result.problems.append(f"{where(kind, index, row)}: {why}")

    def occurrence_problem(c, row):
        day = date.fromisoformat(row["date"])
        if day < c.new_start and day < c.lesson.start_datetime.date():
            return f"{day.isoformat()} is before the class's first occurrence {c.new_start.isoformat()}"
        if c.until is not None and day > c.until:
            return f"{day.isoformat()} is after the class's end {c.until.isoformat()}"
        if day in c.excluded:
            return f"{day.isoformat()} was cancelled for {c.title}"
        if day > c.cutoff(through):
            return (f"{day.isoformat()} is after the cut-off {c.cutoff(through).isoformat()} of {c.title} "
                    f"(the coach's first own mark is {c.first_mark.isoformat()})") if c.first_mark else (
                f"{day.isoformat()} is after history.through")
        return None

    for index, row in enumerate(history.get("absences", [])):
        k, day = _key(row["student"]), date.fromisoformat(row["date"])
        if k not in known:
            refuse("absences", index, row, "the student is not on the coach's roster"); continue
        mine = in_classes.get(k, [])
        if mine:
            same_day = [c for c in mine if c.weekday == day.weekday()]
            if not same_day:
                refuse("absences", index, row, f"the student is in no class on {WEEKDAYS[day.weekday()]}"); continue
            if len(same_day) > 1:
                refuse("absences", index, row,
                       "the student is in two classes that day: " + ", ".join(c.title for c in same_day)); continue
            target = same_day[0]
        else:
            if row.get("start_time"):
                options = [c for c in classes if c.weekday == day.weekday() and c.start == row["start_time"]]
                if not options:
                    refuse("absences", index, row, f"no class starts at {row['start_time']} on {WEEKDAYS[day.weekday()]}"); continue
            else:
                options = [c for c in classes if c.weekday == day.weekday() and c.minutes == row["minutes"]]
                if not options:
                    refuse("absences", index, row, f"the coach has no {row['minutes']}-minute class on {WEEKDAYS[day.weekday()]}"); continue
            if len(options) > 1:
                refuse("absences", index, row,
                       "the student is in no class and the coach has several that day: " + ", ".join(c.title for c in options)); continue
            target = options[0]
        if target.minutes != row["minutes"]:
            refuse("absences", index, row, f"{target.title} lasts {target.minutes} minutes, the row says {row['minutes']}"); continue
        problem = occurrence_problem(target, row)
        if problem:
            refuse("absences", index, row, problem); continue
        result.absences.append({**row, "class": target})

    for index, row in enumerate(history.get("guests", [])):
        k, day = _key(row["student"]), date.fromisoformat(row["date"])
        if k not in known:
            refuse("guests", index, row, "the student is not on the coach's roster"); continue
        options = [c for c in classes if c.weekday == day.weekday() and c.start == row["start_time"]]
        if not options:
            refuse("guests", index, row, f"the coach has no class on {WEEKDAYS[day.weekday()]} at {row['start_time']}"); continue
        target = options[0]
        if k in target.roster:
            refuse("guests", index, row, f"the student is on {target.title}'s roster today, so not a guest"); continue
        if target.minutes != row["minutes"]:
            refuse("guests", index, row, f"{target.title} lasts {target.minutes} minutes, the row says {row['minutes']}"); continue
        problem = occurrence_problem(target, row)
        if problem:
            refuse("guests", index, row, problem); continue
        result.guests.append({**row, "class": target})

    for index, row in enumerate(history.get("adjustments", [])):
        k = _key(row["student"])
        label = f"adjustments[{index}] ({row['student']}, {row['date']})"
        if k not in known:
            result.problems.append(f"{label}: the student is not on the coach's roster"); continue
        length = row.get("lesson_minutes")
        if length is None:
            lengths = {c.minutes for c in in_classes.get(k, [])}
            if len(lengths) != 1:
                result.problems.append(f"{label}: the student's class length cannot be told; give lesson_minutes"); continue
            length = lengths.pop()
        if row["minutes"] % length:
            result.problems.append(
                f"{label}: {row['minutes']} minutes do not divide into {length}-minute lessons; give lesson_minutes"); continue
        result.adjustments.append({"student": row["student"], "date": row["date"], "minutes": row["minutes"],
                                   "lesson_minutes": length, "lessons": row["minutes"] // length,
                                   "start_time": row.get("start_time") or "09:00"})

    result.table = _table(history, result)
    return result


def _table(history, result):
    """Rule 18: per student, what the file's loaded rows give, beside the sheet's totals and the excluded rows."""
    rows = {}

    def line(name):
        return rows.setdefault(_key(name), {"student": name, "just_n": 0, "just_min": 0, "unj_n": 0, "unj_min": 0,
                                            "guest_n": 0, "guest_min": 0, "ex_just": 0, "ex_unj": 0, "ex_guest": 0})

    for row in result.absences:
        entry = line(row["student"])
        key = "unj" if row["type"] == "unjustified" else "just"
        entry[key + "_n"] += 1
        entry[key + "_min"] += row["minutes"]
    for row in result.guests:
        entry = line(row["student"])
        entry["guest_n"] += 1
        entry["guest_min"] += row["minutes"]
    for adj in result.adjustments:
        entry = line(adj["student"])
        entry["just_n"] += adj["lessons"]
        entry["just_min"] += adj["minutes"]
    for row in history.get("excluded", []):
        entry = line(row["student"])
        if row["kind"] == "guest":
            entry["ex_guest"] += row["minutes"]
        elif row.get("type") == "unjustified":
            entry["ex_unj"] += row["minutes"]
        else:
            entry["ex_just"] += row["minutes"]
    sheet = {_key(t["student"]): t for t in history.get("sheet_totals", [])}
    for k, entry in rows.items():
        entry["balance"] = entry["guest_min"] - entry["just_min"]
        entry["owed"] = max(entry["just_n"] - entry["guest_n"], 0)
        entry["sheet"] = sheet.get(k)
    return sorted(rows.values(), key=lambda e: _key(e["student"]))


def _mark(file_value, sheet_value):
    if sheet_value is None:
        return str(file_value)
    gap = file_value - sheet_value
    return f"{file_value}/{sheet_value} " + ("✓" if gap == 0 else f"Δ{gap:+d}")


def plan_lines(data, coach, club, plan_):
    """Rule 18's output for a history file."""
    from padel_app.services.onboarding_service import connected_database

    history, through = data["history"], date.fromisoformat(data["history"]["through"])
    lines = [
        f"Onboarding {data['id']} (history run)",
        f"Database: {connected_database()}",
        f"Coach: #{coach.id} {coach.user.name}",
        f"Club: #{club.id} {club.name}",
        f"Period: {history['from']}..{history['through']}",
    ]
    for note in data.get("notes", []):
        lines.append(f"Note: {note}")
    if plan_.season_to_create:
        s = plan_.season_to_create
        lines.append(f"Season to be created: {s['start_date']}..{s['end_date']}" + (f" ({s['label']})" if s.get("label") else ""))
    if plan_.players_to_create:
        lines.append(f"{len(plan_.players_to_create)} players to be created, in no class: " + ", ".join(plan_.players_to_create))
    lines.append("Classes:")
    for c in plan_.classes:
        move = f"starts {c.lesson.start_datetime.date()} -> {c.new_start}" if c.moves else f"starts {c.lesson.start_datetime.date()}"
        cut = f", cut-off {c.cutoff(through)} (first coach mark {c.first_mark})" if c.first_mark else ""
        lines.append(f"  {c.title}: {move}, {len(c.occurrences(through))} occurrences{cut}")
    lines.append(
        f"Rows: {len(plan_.absences)} absences, {len(plan_.guests)} guests, {len(plan_.adjustments)} adjustments "
        f"({sum(a['lessons'] for a in plan_.adjustments)} one-off lessons), {len(history.get('excluded', []))} excluded"
    )
    moved = [r for r in plan_.absences + plan_.guests if r.get("sheet_date")]
    for row in moved:
        lines.append(f"  moved: {row['student']} sheet {row['sheet_date']} -> {row['date']}")
    for row in history.get("excluded", []):
        lines.append(f"  excluded row {row['source_row']}: {row['student']} {row['kind']}"
                     + (f" {row['type']}" if row.get("type") else "") + f" {row['minutes']} min: {row['reason']}")
    lines.append("Expected vs file (justified min, unjustified min, guest min as file/sheet; balance min; classes owed):")
    for e in plan_.table:
        s = e["sheet"] or {}
        lines.append(
            f"  {e['student']}: justified {_mark(e['just_min'], s.get('justified_minutes'))}"
            f" ({e['just_n']}), unjustified {_mark(e['unj_min'], s.get('unjustified_minutes'))}"
            f" ({e['unj_n']}), guest {_mark(e['guest_min'], s.get('guest_minutes'))} ({e['guest_n']}),"
            f" balance {e['balance']:+d}, owed {e['owed']}"
            + (f", excluded just {e['ex_just']} unj {e['ex_unj']} guest {e['ex_guest']}"
               if e["ex_just"] or e["ex_unj"] or e["ex_guest"] else "")
        )
    return lines


# ---------------------------------------------------------------------------
# rules 19 to 28 — the apply, its proof and its revert
# ---------------------------------------------------------------------------

def _record(run, record_ids, **kinds):
    """Add ids to ``record_ids`` under their keys and save the row, so an interrupted run can be reverted."""
    from padel_app.services.onboarding_service import _save

    for kind, ids in kinds.items():
        record_ids.setdefault(kind, [])
        record_ids[kind].extend(i for i in ids if i not in record_ids[kind])
    _save(run, record_ids)


def _wall(day, clock):
    from datetime import datetime

    hours, minutes = map(int, clock.split(":"))
    return datetime(day.year, day.month, day.day, hours, minutes)


def apply(data, raw, coach, club, plan_):
    """Rules 19 to 28: write the history. ``data`` passed the file check, ``target_problems`` and ``plan``.

    Returns ``(run, lines)``: the ``BulkImport`` row and the table with the app's own numbers. Raises
    ``OnboardingFailed`` after putting everything back."""
    import hashlib
    import json

    from padel_app.models import BulkImport
    from padel_app.services.onboarding_service import MARKER, OnboardingFailed
    from padel_app.sql_db import db

    record_ids = {"_onboarding": {"id": data["id"], "sha256": hashlib.sha256(raw).hexdigest(), HISTORY_FLAG: True}}
    run = BulkImport(coach_id=coach.id, filename=MARKER + data["id"], status="active",
                     summary=json.dumps({}), record_ids=json.dumps(record_ids))
    db.session.add(run)
    db.session.commit()
    run_id, coach_id = run.id, coach.id
    try:
        lines = _write_everything(data, run, record_ids, coach, club, plan_)
    except Exception as exc:  # noqa: BLE001 — whatever stopped the run, nothing may be left behind
        try:
            _undo(run_id, coach_id)
        except Exception as undo_exc:  # noqa: BLE001
            db.session.rollback()
            raise OnboardingFailed(
                f"{exc}. Cleaning up also failed ({undo_exc}): run "
                f"`flask onboarding revert {data['id']}` to remove what was created"
            )
        raise OnboardingFailed(f"{exc}. Everything this run wrote was removed; the id is still unused")
    return db.session.get(BulkImport, run_id), lines


def _find_instance(lesson_id, day):
    """The occurrence of ``lesson_id`` on ``day``, found as ``get_or_materialize_instance`` finds it."""
    from datetime import datetime, time
    from sqlalchemy import and_, or_

    from padel_app.models import LessonInstance

    start = datetime.combine(day, time.min)
    return (
        LessonInstance.query.filter(LessonInstance.lesson_id == lesson_id)
        .filter(or_(
            LessonInstance.original_lesson_occurence_date == day,
            and_(LessonInstance.original_lesson_occurence_date.is_(None),
                 LessonInstance.start_datetime >= start, LessonInstance.start_datetime < start + timedelta(days=1)),
        )).order_by(LessonInstance.id).first()
    )


def _materialise(run, record_ids, lesson, day):
    """(instance, created): the occurrence, quietly. ``created`` comes from the materialising call itself, so an
    occurrence someone else made is never recorded as the run's. The intent is saved first
    (``pending_instance``): a failure between the commit inside the call and the recording of the id
    is cleaned up by ``_undo`` (rule 26)."""
    from padel_app.services import lesson_service

    record_ids["pending_instance"] = {"lesson_id": lesson.id, "date": day.isoformat(),
                                      "existed": _find_instance(lesson.id, day) is not None}
    _record(run, record_ids)
    instance = lesson_service.get_or_materialize_instance(lesson, day, quiet=True)
    created = bool(getattr(instance, "_materialised_now", False))
    record_ids.pop("pending_instance", None)
    _record(run, record_ids, lesson_instances=[instance.id] if created else [])
    return instance, created


def _write_everything(data, run, record_ids, coach, club, plan_):
    import json

    from padel_app.models import Association_PlayerLesson, LessonInstance, Player, PlayerLevelHistory, Presence, User
    from padel_app.models import Association_CoachPlayer
    from padel_app.services import import_service, lesson_service, season_service
    from padel_app.services.onboarding_service import DEFAULT_COLOR, OnboardingFailed
    from padel_app.sql_db import db

    history = data["history"]
    through = date.fromisoformat(history["through"])
    summary = {}

    # Rule 28: the season.
    if plan_.season_to_create:
        season = plan_.season_to_create
        start, end = date.fromisoformat(season["start_date"]), date.fromisoformat(season["end_date"])
        definition = season_service.save_definition(coach, {
            "startDay": start.day, "startMonth": start.month, "endDay": end.day, "endMonth": end.month,
            "label": season.get("label"),
        })
        _record(run, record_ids, coach_seasons=[definition.id])
        record_ids["coach_season_definition"] = [start.day, start.month, end.day, end.month, definition.label]
        _record(run, record_ids)
        summary["Seasons"] = 1

    # Rule 30: the students the file creates, as rule 7 creates them, in no class.
    rows = [{"name": p["name"], "email": p.get("email"), "phone": p.get("phone"), "side": p.get("side"),
             "level_code": p.get("level_code")} for p in data.get("players", [])]
    if rows:
        result = import_service.bulk_create_players(rows, coach, club)
        for kind, ids in (result.get("created_ids") or {}).items():
            _record(run, record_ids, **{kind: ids})
        levels = [r.id for r in PlayerLevelHistory.query.filter(
            PlayerLevelHistory.coach_id == coach.id, PlayerLevelHistory.player_id.in_(record_ids.get("players", [])))]
        _record(run, record_ids, player_level_history=levels)
        if result.get("errors"):
            raise OnboardingFailed(f"players: {result['errors']}")
        summary["Players"] = len(rows)

    players = {}
    for link in Association_CoachPlayer.query.filter_by(coach_id=coach.id):
        if link.player and link.player.user:
            players[_key(link.player.user.name)] = link.player

    # Rule 19: each series' start moves back to its first date on or after `from`.
    record_ids.setdefault("series_starts", {})
    moved = 0
    for c in plan_.classes:
        if not c.moves:
            continue
        lesson, old = c.lesson, c.lesson.start_datetime
        record_ids["series_starts"][str(lesson.id)] = {
            "start": old.isoformat(), "end": lesson.end_datetime.isoformat(), "moved_to": c.new_start.isoformat(),
            "recurrence_rule": lesson.recurrence_rule}
        _record(run, record_ids)
        lesson_service.edit_lesson_helper(
            data={"date": c.new_start.isoformat(), "event_date": old.date()}, lesson=lesson)
        db.session.commit()
        if lesson.start_datetime.date() != c.new_start or lesson.start_datetime.time() != old.time():
            raise OnboardingFailed(f"{c.title}: the series start did not move to {c.new_start}")
        moved += 1
    if moved:
        summary["Series moved"] = moved

    # Rules 20, 21, 22: occurrences up to each class's cut-off, marked and validated.
    absences, guests = {}, {}
    for row in plan_.absences:
        absences.setdefault((row["class"].lesson.id, date.fromisoformat(row["date"])), {})[_key(row["student"])] = row
    for row in plan_.guests:
        guests.setdefault((row["class"].lesson.id, date.fromisoformat(row["date"])), []).append(row)
    record_ids.setdefault("presence_before", {})
    n_instances = 0

    def mark(presence, status, justification, note):
        presence.status, presence.justification = status, justification
        presence.validated, presence.recorded_by = True, "import"
        presence.note = (note or "").strip() or None

    for c in plan_.classes:
        lesson = c.lesson
        for day in c.occurrences(through):
            instance, created_instance = _materialise(run, record_ids, lesson, day)
            if created_instance:
                n_instances += 1
            existing = {p.id: p for p in Presence.query.filter_by(lesson_instance_id=instance.id)}
            before_ids = set(existing)
            marks = absences.get((lesson.id, day), {})
            marked_students = set()
            for presence in existing.values():
                person = db.session.get(Player, presence.player_id)
                row = marks.get(_key(person.user.name)) if person and person.user else None
                if not created_instance:
                    if _is_coach_made(presence):
                        raise OnboardingFailed(f"{c.title} {day}: a coach-made mark appeared under the cut-off")
                    record_ids["presence_before"][str(presence.id)] = {
                        "status": presence.status, "justification": presence.justification,
                        "validated": presence.validated, "recorded_by": presence.recorded_by, "note": presence.note}
                if row is not None:
                    marked_students.add(_key(person.user.name))
                    mark(presence, "absent", "unjustified" if row["type"] == "unjustified" else "justified",
                         row.get("note"))
                else:
                    mark(presence, "present", None, None)
            # A student in no class has no row on the occurrence: the absence is theirs alone (rule 17a).
            for student, row in marks.items():
                if student in marked_students:
                    continue
                lesson_service.enrol(players[student].id, instance, "import", validated=True, new_engine=True)
                presence = Presence.query.filter_by(lesson_instance_id=instance.id, player_id=players[student].id).one()
                mark(presence, "absent", "unjustified" if row["type"] == "unjustified" else "justified", row.get("note"))
            for row in guests.get((lesson.id, day), []):
                guest = players[_key(row["student"])]
                lesson_service.enrol(guest.id, instance, "import", validated=True, new_engine=True)
                presence = Presence.query.filter_by(lesson_instance_id=instance.id, player_id=guest.id).one()
                mark(presence, "present", None, None)
            db.session.commit()
            after = {p.id for p in Presence.query.filter_by(lesson_instance_id=instance.id)}
            # A created occurrence's rows are all the run's; an existing one's are the run's only when new.
            _record(run, record_ids, presences=sorted(after if created_instance else after - before_ids))

    # Rule 23: the adjustments, one-off lessons of one student, one justified absence each.
    n_lessons = 0
    for adj in plan_.adjustments:
        person = players[_key(adj["student"])]
        day = date.fromisoformat(adj["date"])
        clock = adj["start_time"]
        for _ in range(adj["lessons"]):
            hours, minutes = map(int, clock.split(":"))
            end_total = hours * 60 + minutes + adj["lesson_minutes"]
            if end_total > 24 * 60:
                raise OnboardingFailed(f'adjustment of {adj["student"]}: the lessons run past midnight')
            end = f"{end_total // 60 % 24:02d}:{end_total % 60:02d}"
            created = lesson_service.add_class_service({
                "name": "Ajuste manual (histórico)", "classType": "academy", "date": day.isoformat(),
                "startTime": clock, "endTime": end, "maxPlayers": 1, "levelId": None, "color": DEFAULT_COLOR,
                "playerIds": [person.id], "isRecurring": False, "notificationsEnabled": False,
            }, coach, club, notify_students=False)
            db.session.commit()
            _record(run, record_ids, lessons=[created.id],
                    player_lessons=[r.id for r in Association_PlayerLesson.query.filter_by(lesson_id=created.id)])
            instance, _ = _materialise(run, record_ids, created, day)
            rows_ = list(Presence.query.filter_by(lesson_instance_id=instance.id))
            for presence in rows_:
                mark(presence, "absent", "justified", None)
            db.session.commit()
            _record(run, record_ids, presences=[p.id for p in rows_])
            n_lessons += 1
            clock = end
            n_instances += 1
    if n_lessons:
        summary["Lessons"] = n_lessons
    summary["Instances"], summary["Presences"] = n_instances, len(record_ids.get("presences", []))

    lines = _prove(data, plan_, record_ids, coach, club)
    run.summary = json.dumps(summary)
    db.session.commit()
    return lines


def app_numbers(coach_id, first, through):
    """What the Presences tab and the engine say, per student name key (rule 26)."""
    from datetime import datetime, time

    from padel_app.services.notification_service import makeups_owed_for
    from padel_app.services.presence_overview_service import build_presence_stats

    stats = build_presence_stats(coach_id=coach_id, range_start=datetime.combine(first, time.min),
                                 range_end=datetime.combine(through, time.max))
    owed = makeups_owed_for([p["playerId"] for p in stats["players"]], coach_id)
    return {_key(p["name"]): {**p, "owed": owed.get(p["playerId"], 0)} for p in stats["players"]}


def _prove(data, plan_, record_ids, coach, club):
    """Rule 26: ownership, nothing left to validate, and the app's numbers equal the file's loaded rows."""
    from padel_app.models import Association_CoachLesson, Lesson, LessonInstance, Presence
    from padel_app.services.onboarding_service import OnboardingFailed
    from padel_app.sql_db import db

    history = data["history"]
    first, through = date.fromisoformat(history["from"]), date.fromisoformat(history["through"])
    problems = []

    coach_lessons = {r.lesson_id for r in Association_CoachLesson.query.filter_by(coach_id=coach.id)}
    for lesson_id in record_ids.get("lessons", []):
        lesson = db.session.get(Lesson, lesson_id)
        if lesson is None or lesson.club_id != club.id or {r.coach_id for r in lesson.coaches_relations} != {coach.id}:
            problems.append(f"lesson {lesson_id} is not the target coach's alone, in the target club")
    for instance_id in record_ids.get("lesson_instances", []):
        instance = db.session.get(LessonInstance, instance_id)
        if instance is None or instance.lesson_id not in coach_lessons:
            problems.append(f"instance {instance_id} is not on one of the target coach's classes")
    for presence_id in record_ids.get("presences", []):
        presence = db.session.get(Presence, presence_id)
        if presence is None or presence.lesson_instance.lesson_id not in coach_lessons:
            problems.append(f"presence {presence_id} is not on one of the target coach's classes")

    for c in plan_.classes:
        left = (
            Presence.query.join(LessonInstance, LessonInstance.id == Presence.lesson_instance_id)
            .filter(LessonInstance.lesson_id == c.lesson.id, Presence.validated.is_(False))
            .filter(LessonInstance.start_datetime < _wall(c.cutoff(through) + timedelta(days=1), "00:00"))
            .count()
        )
        if left:
            problems.append(f"{c.title}: {left} rows are left to validate up to {c.cutoff(through)}")

    numbers = app_numbers(coach.id, first, through)
    lines = ["Expected vs app (file loaded rows / app; ✓ = equal):"]
    for e in plan_.table:
        app = numbers.get(_key(e["student"]))
        if app is None:
            problems.append(f"{e['student']}: not on the coach's roster after the run")
            continue
        pairs = (("justified", e["just_n"], app["justified"]), ("justified min", e["just_min"], app["justifiedMinutes"]),
                 ("unjustified", e["unj_n"], app["unjustified"]), ("guest", e["guest_n"], app["invitesJoined"]),
                 ("guest min", e["guest_min"], app["guestPresenceMinutes"]), ("balance", e["balance"], app["balanceMinutes"]),
                 ("owed", e["owed"], app["owed"]))
        cells = []
        for label, expected, found in pairs:
            cells.append(f"{label} {expected}/{found} " + ("✓" if expected == found else f"Δ{found - expected:+d}"))
            if expected != found:
                problems.append(f"{e['student']}: {label} is {found} in the app, the file's rows give {expected}")
        lines.append(f"  {e['student']}: " + ", ".join(cells)
                     + (f"; excluded just {e['ex_just']} unj {e['ex_unj']} guest {e['ex_guest']}"
                        if e["ex_just"] or e["ex_unj"] or e["ex_guest"] else ""))
    if problems:
        raise OnboardingFailed("proof failed: " + "; ".join(problems))
    return lines


def _restore(run, record_ids):
    """Put back what a history run changed and did not create: series starts, updated presences, the season."""
    from datetime import datetime

    from padel_app.models import Lesson, Presence
    from padel_app.models.coach_seasons import CoachSeason
    from padel_app.sql_db import db

    for presence_id, before in (record_ids.get("presence_before") or {}).items():
        presence = db.session.get(Presence, int(presence_id))
        if presence is not None:
            for field, value in before.items():
                setattr(presence, field, value)
    for lesson_id, before in (record_ids.get("series_starts") or {}).items():
        lesson = db.session.get(Lesson, int(lesson_id))
        if lesson is not None:
            lesson.start_datetime = datetime.fromisoformat(before["start"])
            lesson.end_datetime = datetime.fromisoformat(before["end"])
            if "recurrence_rule" in before:
                lesson.recurrence_rule = before["recurrence_rule"]
    for season_id in record_ids.get("coach_seasons", []):
        season = db.session.get(CoachSeason, season_id)
        if season is not None:
            db.session.delete(season)
    db.session.commit()


def _undo(run_id, coach_id):
    """Rule 26: the run failed, so restore, delete what it created, and drop its row."""
    import json

    from padel_app.models import BulkImport, Coach
    from padel_app.services import import_service
    from padel_app.sql_db import db

    db.session.rollback()
    run = db.session.get(BulkImport, run_id)
    record_ids = json.loads(run.record_ids or "{}")
    _restore(run, record_ids)
    pending = record_ids.get("pending_instance")
    if pending and not pending["existed"]:
        # The call made the occurrence and the failure came before its id was recorded (rule 26).
        orphan = _find_instance(pending["lesson_id"], date.fromisoformat(pending["date"]))
        if orphan is not None and orphan.id not in record_ids.get("lesson_instances", []):
            from padel_app.services.onboarding_service import _save

            record_ids.setdefault("lesson_instances", []).append(orphan.id)
            _save(run, record_ids)
    import_service.revert_import(run_id, db.session.get(Coach, coach_id))
    db.session.delete(db.session.get(BulkImport, run_id))
    db.session.commit()


def revert_problems(run):
    """Rule 27: what the coach has since done that a revert would lose; empty when the revert is safe."""
    import json

    from padel_app.models import Lesson, Presence
    from padel_app.models.coach_seasons import CoachSeason
    from padel_app.sql_db import db

    record_ids = json.loads(run.record_ids or "{}")
    problems = []
    marked = [pid for pid in list(record_ids.get("presences", [])) + [int(i) for i in record_ids.get("presence_before", {})]
              if (p := db.session.get(Presence, pid)) is not None and p.recorded_by == "coach"]
    if marked:
        problems.append(f"the coach has since marked {len(marked)} rows the run wrote (presence ids {sorted(marked)})")
    for lesson_id, before in (record_ids.get("series_starts") or {}).items():
        lesson = db.session.get(Lesson, int(lesson_id))
        if lesson is not None and lesson.start_datetime.date().isoformat() != before["moved_to"]:
            problems.append(f"class #{lesson_id} ({lesson.title}) no longer starts on {before['moved_to']}")
    # Rows the run did not write, on what the run created: deleting the occurrence would delete them too.
    written = set(record_ids.get("presences", []))
    instance_ids = list(record_ids.get("lesson_instances", []))
    lesson_ids = list(record_ids.get("lessons", []))
    strangers = []
    if instance_ids:
        strangers += [p for p in Presence.query.filter(Presence.lesson_instance_id.in_(instance_ids))
                      if p.id not in written]
    if lesson_ids:
        from padel_app.models import Association_PlayerLesson, LessonInstance

        extra = [i.id for i in LessonInstance.query.filter(LessonInstance.lesson_id.in_(lesson_ids))
                 if i.id not in set(instance_ids)]
        if extra:
            problems.append(f"an adjustment lesson holds occurrence(s) the run did not make (instance ids {sorted(extra)})")
        known_enrolments = set(record_ids.get("player_lessons", []))
        other = [r.id for r in Association_PlayerLesson.query.filter(Association_PlayerLesson.lesson_id.in_(lesson_ids))
                 if r.id not in known_enrolments]
        if other:
            problems.append(f"an adjustment lesson has enrolments the run did not make (ids {sorted(other)})")
    if strangers:
        where = sorted({(p.lesson_instance_id, p.lesson_instance.start_datetime.date().isoformat()) for p in strangers})
        problems.append(
            f"{len(strangers)} rows on the run's occurrences were not written by the run (presence ids "
            f"{sorted(p.id for p in strangers)}; occurrences {where}): deleting the occurrences would delete them"
        )
    wanted = record_ids.get("coach_season_definition")
    for season_id in record_ids.get("coach_seasons", []):
        season = db.session.get(CoachSeason, season_id)
        if season is not None and wanted and [season.start_day, season.start_month, season.end_day,
                                              season.end_month, season.label] != wanted:
            problems.append(f"the coach changed the season #{season_id} the run created")
    return problems


def revert(run):
    """Rule 27: restore, then ``import.revert`` the recorded rows. ``run`` passed ``revert_problems``."""
    import json

    from padel_app.services import import_service
    from padel_app.sql_db import db

    _restore(run, json.loads(run.record_ids or "{}"))
    result = import_service.revert_import(run.id, run.coach)
    db.session.commit()
    return result


def is_history_run(run):
    import json

    return bool(((json.loads(run.record_ids or "{}")).get("_onboarding") or {}).get(HISTORY_FLAG))
