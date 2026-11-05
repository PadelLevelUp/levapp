"""import.onboarding-runner (PAD-827): load a new coach's roster from an onboarding file.

The team's `flask onboarding` command (cli.py) is the only caller. A run creates students as an
import does (`bulk_create_players`), weekly classes as the coach's "add class" does
(`add_class_service`, telling nobody), records itself as one `BulkImport` row and can be undone by
`revert_import`. The file is JSON, data only, and lives outside the repository: it carries
students' names and the repository is public (R-036).
"""
import hashlib
import json
import re
import unicodedata
from datetime import date

from sqlalchemy import func

from padel_app.models import (
    Association_CoachLesson,
    Association_CoachPlayer,
    Association_PlayerLesson,
    BulkImport,
    Coach,
    Lesson,
    Player,
    PlayerLevelHistory,
    User,
)
from padel_app.services import import_service, lesson_service, season_service
from padel_app.sql_db import db

#: `BulkImport.filename` of an onboarding run (rule 10): how a run is found again.
MARKER = "onboarding:"
DEFAULT_COLOR = "#1355DC"

_ID = re.compile(r"^\d{4}_\d{2}_\d{2}_[a-z0-9]+(?:_[a-z0-9]+)*$")
_HH_MM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_SIDES = ("left", "right", "both")
#: Column lengths of users.name / users.email / users.phone, and of lessons.title.
_LIMITS = {"name": 120, "email": 120, "phone": 20}
_TITLE_LIMIT = 255
_TYPES = ("academy", "private")


class OnboardingRefused(Exception):
    """The run was not started: every reason is in ``problems``."""

    def __init__(self, problems):
        super().__init__("; ".join(problems))
        self.problems = list(problems)


class OnboardingFailed(Exception):
    """The run started and could not finish; what it created has been removed (rule 11)."""


def name_key(name):
    """A name without accents, case or repeated spaces (rule 3b): the comparison every name uses."""
    text = unicodedata.normalize("NFKD", str(name or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return " ".join(text.split()).casefold()


def connected_database():
    """The name of the database the app is connected to (rule 6)."""
    return db.engine.url.database


def parse(raw):
    try:
        return json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
    except (UnicodeDecodeError, ValueError) as exc:
        raise OnboardingRefused([f"the file is not valid JSON: {exc}"])


# ---------------------------------------------------------------------------
# rule 3 — the file, before the database is read
# ---------------------------------------------------------------------------

def _is_count(value):
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _is_id(value):
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _text(value):
    return isinstance(value, str) and value.strip() != ""


def _iso_date(value):
    try:
        return date.fromisoformat(value) if isinstance(value, str) else None
    except ValueError:
        return None


def validate_file(data):
    """Every problem with the file itself, in file order; an empty list accepts it."""
    if not isinstance(data, dict):
        return ["the file must be a JSON object"]
    problems = []

    if not (isinstance(data.get("id"), str) and _ID.match(data["id"])):
        problems.append(f'id "{data.get("id")}" must look like YYYY_MM_DD_<slug> (lower-case letters, digits, underscores)')

    coach = data.get("coach") if isinstance(data.get("coach"), dict) else {}
    club = coach.get("club") if isinstance(coach.get("club"), dict) else {}
    if not _is_id(coach.get("id")):
        problems.append("coach.id must be the coach's id")
    if not _text(coach.get("name")):
        problems.append("coach.name must be the coach's name")
    if not _is_id(club.get("id")):
        problems.append("coach.club.id must be the club's id")
    if not _text(club.get("name")):
        problems.append("coach.club.name must be the club's name")

    expects = data.get("expects") if isinstance(data.get("expects"), dict) else {}
    for key in ("players", "classes"):
        if not _is_count(expects.get(key)):
            problems.append(f"expects.{key} must be the coach's number of {key} before the run")

    players = data.get("players", [])
    classes = data.get("classes", [])
    if not isinstance(players, list):
        problems.append("players must be a list")
        players = []
    if not isinstance(classes, list):
        problems.append("classes must be a list")
        classes = []
    if not players and not classes:
        problems.append("the file has no players and no classes")

    seen_names, seen_emails = {}, {}
    for index, player in enumerate(players):
        if not isinstance(player, dict) or not _text(player.get("name")):
            problems.append(f"players[{index}] needs a name")
            continue
        name = player["name"]
        key = name_key(name)
        if key in seen_names:
            problems.append(f'duplicate player name "{name}" (same as "{seen_names[key]}")')
        else:
            seen_names[key] = name
        if player.get("side") is not None and player["side"] not in _SIDES:
            problems.append(f'player "{name}": side must be left, right or both')
        for field in ("email", "phone", "level_code"):
            if player.get(field) is not None and not _text(player[field]):
                problems.append(f'player "{name}": {field} must be text')
        # The columns' own limits: a longer value would fail part-way through the run.
        for field, limit in _LIMITS.items():
            if isinstance(player.get(field), str) and len(player[field]) > limit:
                problems.append(f'player "{name}": {field} is longer than {limit} characters')
        if _text(player.get("email")):
            email = player["email"].strip().lower()
            if email in seen_emails:
                problems.append(f'player "{name}": {email} is also the email of "{seen_emails[email]}"')
            else:
                seen_emails[email] = name
        if player.get("link_existing") not in (None, True, False):
            problems.append(f'player "{name}": link_existing must be true or false')

    seen_titles = set()
    for index, lesson in enumerate(classes):
        if not isinstance(lesson, dict) or not _text(lesson.get("title")):
            problems.append(f"classes[{index}] needs a title")
            continue
        problems.extend(_class_problems(lesson, seen_names, seen_titles))

    return problems


def _class_problems(lesson, player_names, seen_titles):
    title = lesson["title"]
    where = f'class "{title}"'
    problems = []
    if title in seen_titles:
        problems.append(f"{where}: duplicate class title")
    seen_titles.add(title)
    if len(title) > _TITLE_LIMIT:
        problems.append(f"{where}: title is longer than {_TITLE_LIMIT} characters")

    if lesson.get("type") is not None and lesson["type"] not in _TYPES:
        problems.append(f"{where}: type must be academy or private")
    if lesson.get("level_code") is not None and not _text(lesson["level_code"]):
        problems.append(f"{where}: level_code must be text")
    for flag in ("weekly", "notifications"):
        if lesson.get(flag) not in (None, True, False):
            problems.append(f"{where}: {flag} must be true or false")

    start_date = _iso_date(lesson.get("date"))
    if start_date is None:
        problems.append(f"{where}: date must be a YYYY-MM-DD date")
    start, end = lesson.get("start_time"), lesson.get("end_time")
    times_ok = True
    for field, value in (("start_time", start), ("end_time", end)):
        if not (isinstance(value, str) and _HH_MM.match(value)):
            problems.append(f"{where}: {field} must be HH:MM")
            times_ok = False
    # classes.create rule 8c: an end of 00:00 after a later start is midnight at the day's end.
    if times_ok and end <= start and not (end == "00:00" and start != "00:00"):
        problems.append(f"{where}: end_time {end} is not after start_time {start}")

    if lesson.get("weekly", True):
        until = lesson.get("until")
        until_date = _iso_date(until)
        if until != "season_end" and until_date is None:
            problems.append(f'{where}: a weekly class needs until ("season_end" or a YYYY-MM-DD date)')
        elif until_date is not None and start_date is not None and until_date < start_date:
            problems.append(f"{where}: until {until} is before date {lesson['date']}")

    names = lesson.get("players", [])
    if not isinstance(names, list):
        problems.append(f"{where}: players must be a list of names")
        names = []
    seen = set()
    for name in names:
        key = name_key(name)
        if key not in player_names:
            problems.append(f'{where}: player "{name}" is not in players')
        elif key in seen:
            problems.append(f'{where}: player "{name}" is listed twice')
        seen.add(key)

    capacity = lesson.get("max_players")
    if not _is_id(capacity):
        problems.append(f"{where}: max_players must be a positive whole number")
    elif capacity < len(names):
        problems.append(f"{where}: max_players {capacity} is below its {len(names)} players")
    return problems


# ---------------------------------------------------------------------------
# rule 4 — the target, before anything is written
# ---------------------------------------------------------------------------

def _earlier_run(onboarding_id):
    return BulkImport.query.filter_by(filename=MARKER + onboarding_id).order_by(BulkImport.id).first()


def _roster_links(coach_id):
    return Association_CoachPlayer.query.filter_by(coach_id=coach_id).all()


def _lessons_of(coach_id):
    return (
        Lesson.query.join(Association_CoachLesson, Association_CoachLesson.lesson_id == Lesson.id)
        .filter(Association_CoachLesson.coach_id == coach_id)
        .all()
    )


def _user_by_email(email):
    return User.query.filter(func.lower(User.email) == email.strip().lower()).first()


def check_target(data):
    """(coach, club, problems). The coach and club are None when the target itself is wrong."""
    earlier = _earlier_run(data["id"])
    if earlier is not None:
        # 4c comes first: after a run the roster no longer matches `expects`, and the
        # refusal that matters is that this id has been spent.
        return None, None, [
            f"onboarding {data['id']} was already applied (import #{earlier.id}, {earlier.status}); "
            "a correction is a new file with a new id"
        ]

    wanted = data["coach"]
    coach = db.session.get(Coach, wanted["id"])
    if coach is None:
        return None, None, [f"no coach with id {wanted['id']}"]

    problems = []
    found_name = (coach.user.name if coach.user else "") or ""
    if found_name.strip() != wanted["name"].strip():
        problems.append(f'coach #{coach.id} is "{found_name}", the file says "{wanted["name"]}"')
    club = coach.current_club
    wanted_club = wanted["club"]
    if club is None:
        problems.append(f"coach #{coach.id} has no club")
    elif club.id != wanted_club["id"] or (club.name or "").strip() != wanted_club["name"].strip():
        problems.append(
            f'coach #{coach.id}\'s current club is #{club.id} "{club.name}", '
            f'the file says #{wanted_club["id"]} "{wanted_club["name"]}"'
        )
    if problems:
        return None, None, problems

    roster = _roster_links(coach.id)
    lessons = _lessons_of(coach.id)
    expects = data["expects"]
    if len(roster) != expects["players"] or len(lessons) != expects["classes"]:
        problems.append(
            f"the file expects {expects['players']} players and {expects['classes']} classes, "
            f"found {len(roster)} players and {len(lessons)} classes"
        )

    codes = sorted(level.code for level in coach.levels)
    roster_names = {name_key(link.player.user.name) for link in roster if link.player and link.player.user}
    roster_player_ids = {link.player_id for link in roster}
    for player in data.get("players", []):
        name = player["name"]
        if player.get("level_code") and player["level_code"] not in codes:
            problems.append(f'player "{name}": level code "{player["level_code"]}" is not on the coach\'s ladder ({", ".join(codes)})')
        if name_key(name) in roster_names:
            problems.append(f'"{name}" is already on the coach\'s roster')
        if player.get("email"):
            email = player["email"].strip().lower()
            account = _user_by_email(email)
            if account is not None and not player.get("link_existing"):
                problems.append(
                    f'player "{name}": {email} belongs to an existing account (user #{account.id} "{account.name}"); '
                    'say "link_existing": true to put that account on the roster'
                )
            elif account is not None and account.player and account.player.id in roster_player_ids:
                problems.append(f'player "{name}": {email} is already on the coach\'s roster')

    titles = {lesson.title for lesson in lessons}
    for lesson in data.get("classes", []):
        title = lesson["title"]
        if lesson.get("level_code") and lesson["level_code"] not in codes:
            problems.append(f'class "{title}": level code "{lesson["level_code"]}" is not on the coach\'s ladder ({", ".join(codes)})')
        if title in titles:
            problems.append(f'class "{title}" already exists for this coach')
        if lesson.get("weekly", True) and lesson.get("until") == "season_end":
            start = date.fromisoformat(lesson["date"])
            if season_service.resolve_season_end_for_coach(coach, start) is None:
                problems.append(f'class "{title}": no season covers {lesson["date"]}; give until a date')
    return coach, club, problems


# ---------------------------------------------------------------------------
# rule 5 — the plan
# ---------------------------------------------------------------------------

def _counts(data):
    players = len(data.get("players", []))
    classes = len(data.get("classes", []))
    enrolments = sum(len(lesson.get("players", [])) for lesson in data.get("classes", []))
    return players, classes, enrolments


def describe_counts(players, classes, enrolments):
    return f"{players} players, {classes} classes, {enrolments} enrolments"


def plan_lines(data, coach, club):
    expects = data["expects"]
    lines = [
        f"Onboarding {data['id']}",
        f"Database: {connected_database()}",
        f"Coach: #{coach.id} {coach.user.name}",
        f"Club: #{club.id} {club.name}",
        f"Before: {expects['players']} players, {expects['classes']} classes",
        f"Creates: {describe_counts(*_counts(data))}",
    ]
    if data.get("classes"):
        lines.append("Classes:")
    for lesson in data.get("classes", []):
        start = date.fromisoformat(lesson["date"])
        if lesson.get("weekly", True):
            until = "the season's end" if lesson["until"] == "season_end" else lesson["until"]
            when = f"every {start.strftime('%A')} from {lesson['date']} until {until}"
        else:
            when = f"once on {start.strftime('%A')} {lesson['date']}"
        lines.append(
            f"  {lesson['title']}: {when}, {lesson['start_time']}-{lesson['end_time']}, "
            f"{len(lesson.get('players', []))}/{lesson['max_players']} students, "
            f"notifications {'on' if lesson.get('notifications') else 'off'}"
        )
    if data.get("notes"):
        lines.append("Notes:")
        lines.extend(f"  - {note}" for note in data["notes"])
    return lines


# ---------------------------------------------------------------------------
# rules 7 to 12 — apply
# ---------------------------------------------------------------------------

def _save(run, record_ids):
    run.record_ids = json.dumps(record_ids)
    db.session.commit()


def _class_payload(lesson, level_ids, player_ids):
    start = date.fromisoformat(lesson["date"])
    payload = {
        "name": lesson["title"],
        "classType": lesson.get("type") or "academy",
        "date": lesson["date"],
        "startTime": lesson["start_time"],
        "endTime": lesson["end_time"],
        "maxPlayers": lesson["max_players"],
        "levelId": level_ids[lesson["level_code"]] if lesson.get("level_code") else None,
        "color": lesson.get("color") or DEFAULT_COLOR,
        "playerIds": [player_ids[name_key(name)] for name in lesson.get("players", [])],
        "isRecurring": bool(lesson.get("weekly", True)),
        # rule 9: off unless the file says otherwise.
        "notificationsEnabled": bool(lesson.get("notifications", False)),
    }
    if payload["isRecurring"]:
        # The app's weekday numbering: Sunday is 0.
        payload["recurrenceRule"] = {"frequency": "weekly", "daysOfWeek": [(start.weekday() + 1) % 7]}
        if lesson["until"] == "season_end":
            payload["recursUntilSeasonEnd"] = True
        else:
            payload["endDate"] = lesson["until"]
    return payload


def _player_ids_by_name(data, record_ids):
    """Each file player's id: by email when the row has one, else by name among this run's players."""
    created = {}
    for player in Player.query.filter(Player.id.in_(record_ids.get("players", []))):
        created[name_key(player.user.name)] = player.id
    resolved = {}
    for row in data.get("players", []):
        key = name_key(row["name"])
        if row.get("email"):
            account = _user_by_email(row["email"])
            player_id = account.player.id if account is not None and account.player else None
        else:
            player_id = created.get(key)
        if player_id is None:
            raise OnboardingFailed(f'player "{row["name"]}" was not created')
        resolved[key] = player_id
    return resolved


def _ownership_problems(data, record_ids, coach_id, club_id):
    """Rule 12: what this run created belongs to the target coach and club, and is all there."""
    problems = []
    for link in Association_CoachPlayer.query.filter(Association_CoachPlayer.id.in_(record_ids.get("coach_players", []))):
        if link.coach_id != coach_id:
            problems.append(f"roster link #{link.id} belongs to coach #{link.coach_id}")
    roster = {link.player_id for link in _roster_links(coach_id)}

    lesson_ids = set(record_ids.get("lessons", []))
    for lesson in Lesson.query.filter(Lesson.id.in_(lesson_ids)):
        if lesson.club_id != club_id:
            problems.append(f'class "{lesson.title}" is in club #{lesson.club_id}')
        coaches = sorted(
            row.coach_id for row in Association_CoachLesson.query.filter_by(lesson_id=lesson.id)
        )
        if coaches != [coach_id]:
            problems.append(f'class "{lesson.title}" is linked to coaches {coaches}')
    for enrolment in Association_PlayerLesson.query.filter(
        Association_PlayerLesson.id.in_(record_ids.get("player_lessons", []))
    ):
        if enrolment.lesson_id not in lesson_ids or enrolment.player_id not in roster:
            problems.append(f"enrolment #{enrolment.id} joins class #{enrolment.lesson_id} and player #{enrolment.player_id}")

    wanted = _counts(data)
    found = tuple(len(record_ids.get(key, [])) for key in ("coach_players", "lessons", "player_lessons"))
    if found != wanted:
        problems.append(f"created {describe_counts(*found)}, the file has {describe_counts(*wanted)}")
    return problems


def _undo(run_id, coach_id, titles, lessons_before):
    """Rule 11: delete what the run created, then its history row, so the id is unused again."""
    db.session.rollback()
    run = db.session.get(BulkImport, run_id)
    coach = db.session.get(Coach, coach_id)
    record_ids = json.loads(run.record_ids or "{}")
    # A class whose creation raised after its row was written was never recorded. None of the
    # file's titles existed for this coach before the run (rule 4f), so they are this run's.
    lesson_ids = set(record_ids.get("lessons", []))
    lesson_ids.update(
        lesson.id for lesson in _lessons_of(coach_id)
        if lesson.title in titles and lesson.id not in lessons_before
    )
    record_ids["lessons"] = sorted(lesson_ids)
    enrolment_ids = set(record_ids.get("player_lessons", []))
    if lesson_ids:
        enrolment_ids.update(
            row.id for row in Association_PlayerLesson.query.filter(Association_PlayerLesson.lesson_id.in_(lesson_ids))
        )
    record_ids["player_lessons"] = sorted(enrolment_ids)
    _save(run, record_ids)

    import_service.revert_import(run_id, coach)
    db.session.delete(db.session.get(BulkImport, run_id))
    db.session.commit()


def apply(data, raw, coach, club):
    """Create everything in the file on ``coach``; return the run's ``BulkImport`` row.

    ``data`` has passed ``validate_file`` and ``check_target``. Raises ``OnboardingFailed`` after
    removing whatever the run created.
    """
    coach_id = coach.id
    titles = {lesson["title"] for lesson in data.get("classes", [])}
    lessons_before = {lesson.id for lesson in _lessons_of(coach_id)}
    record_ids = {"_onboarding": {"id": data["id"], "sha256": hashlib.sha256(raw).hexdigest()}}
    # Rule 10: the row exists before the first record, so an interrupted run can be reverted.
    run = BulkImport(
        coach_id=coach_id, filename=MARKER + data["id"], status="active",
        summary=json.dumps({}), record_ids=json.dumps(record_ids),
    )
    db.session.add(run)
    db.session.commit()
    run_id = run.id

    try:
        _create(data, run, record_ids, coach, club)
    except Exception as exc:  # noqa: BLE001 — whatever stopped the run, nothing may be left behind
        try:
            _undo(run_id, coach_id, titles, lessons_before)
        except Exception as undo_exc:  # noqa: BLE001
            db.session.rollback()
            raise OnboardingFailed(
                f"{exc}. Cleaning up also failed ({undo_exc}): run "
                f"`flask onboarding revert {data['id']}` to remove what was created"
            )
        raise OnboardingFailed(f"{exc}. Everything this run created was removed; the id is still unused")
    return db.session.get(BulkImport, run_id)


def _create(data, run, record_ids, coach, club):
    rows = [
        {"name": p["name"], "email": p.get("email"), "phone": p.get("phone"),
         "side": p.get("side"), "level_code": p.get("level_code")}
        for p in data.get("players", [])
    ]
    if rows:
        result = import_service.bulk_create_players(rows, coach, club)
        for key, ids in (result.get("created_ids") or {}).items():
            record_ids.setdefault(key, []).extend(ids)
        # A new player's first level writes a history row the import does not report.
        history = {
            row.id for row in PlayerLevelHistory.query.filter(
                PlayerLevelHistory.coach_id == coach.id,
                PlayerLevelHistory.player_id.in_(record_ids.get("players", [])),
            )
        }
        record_ids["player_level_history"] = sorted(history | set(record_ids.get("player_level_history", [])))
        _save(run, record_ids)
        if result.get("errors"):
            raise OnboardingFailed(f"players: {result['errors']}")

    player_ids = _player_ids_by_name(data, record_ids)
    level_ids = {level.code: level.id for level in coach.levels}
    for lesson in data.get("classes", []):
        try:
            # Through the module, and telling nobody (rule 9, PAD-330).
            created = lesson_service.add_class_service(
                _class_payload(lesson, level_ids, player_ids), coach, club, notify_students=False,
            )
            db.session.commit()
        except Exception as exc:  # noqa: BLE001
            raise OnboardingFailed(f'class "{lesson["title"]}": {exc}')
        record_ids.setdefault("lessons", []).append(created.id)
        record_ids.setdefault("player_lessons", []).extend(
            row.id for row in Association_PlayerLesson.query.filter_by(lesson_id=created.id)
        )
        _save(run, record_ids)

    problems = _ownership_problems(data, record_ids, coach.id, club.id)
    if problems:
        raise OnboardingFailed("ownership: " + "; ".join(problems))

    players, classes, enrolments = _counts(data)
    summary = {"Players": players, "Classes": classes, "Players in Classes": enrolments}
    run.summary = json.dumps({key: value for key, value in summary.items() if value})
    db.session.commit()


# ---------------------------------------------------------------------------
# rules 13, 14 — revert and list
# ---------------------------------------------------------------------------

def revert(onboarding_id):
    """Undo a run through ``import.revert``; returns what was deleted, by kind."""
    run = _earlier_run(onboarding_id)
    if run is None:
        raise OnboardingRefused([f"no onboarding {onboarding_id} was applied"])
    if run.status == "reverted":
        raise OnboardingRefused([f"onboarding {onboarding_id} is already reverted (import #{run.id})"])
    result = import_service.revert_import(run.id, run.coach)
    if isinstance(result, tuple):
        raise OnboardingRefused([result[0].get("error", "revert refused")])
    return result["deleted"]


def runs():
    """Every onboarding run, oldest first."""
    rows = (
        BulkImport.query.filter(BulkImport.filename.like(MARKER + "%"))
        .order_by(BulkImport.created_at, BulkImport.id)
        .all()
    )
    listed = []
    for row in rows:
        summary = json.loads(row.summary or "{}")
        listed.append({
            "id": row.filename[len(MARKER):],
            "import_id": row.id,
            "coach_id": row.coach_id,
            "coach_name": row.coach.user.name if row.coach and row.coach.user else "?",
            "applied_at": row.created_at,
            "status": row.status,
            "counts": describe_counts(
                summary.get("Players", 0), summary.get("Classes", 0), summary.get("Players in Classes", 0)
            ),
        })
    return listed
