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


def _instance_facts(coach_id):
    """(instance count, coach-made marks, {lesson id: date of its first coach-made mark})."""
    from sqlalchemy import func

    from padel_app.models import Association_CoachLesson, LessonInstance, Presence
    from padel_app.sql_db import db

    lesson_ids = db.session.query(Association_CoachLesson.lesson_id).filter_by(coach_id=coach_id)
    instances = LessonInstance.query.filter(LessonInstance.lesson_id.in_(lesson_ids))
    marks = (
        Presence.query.join(LessonInstance, LessonInstance.id == Presence.lesson_instance_id)
        .filter(LessonInstance.lesson_id.in_(lesson_ids), Presence.recorded_by == "coach")
    )
    firsts = dict(
        db.session.query(LessonInstance.lesson_id, func.min(LessonInstance.start_datetime))
        .join(Presence, Presence.lesson_instance_id == LessonInstance.id)
        .filter(LessonInstance.lesson_id.in_(lesson_ids), Presence.recorded_by == "coach")
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
