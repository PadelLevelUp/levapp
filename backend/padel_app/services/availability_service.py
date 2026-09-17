"""classes.availability + settings.coach-working-hours (PAD-357).

The one computation of "when is a private class possible" for a coach and a
set of people, mirrored by the pure module `packages/config/src/availability.ts`
the shells render with. The server holds the private inputs — every person's
classes and unavailability blocks — and serves only the resulting free windows,
never anyone's busy intervals (the `calendar.student-blockers` privacy posture).

Times are the club's wall-clock, as `classes.class-requests` rule 8 stores
them; a day's arithmetic is done in minutes-of-day, half-open on the minute.
"""
from datetime import date as _date, datetime, time, timedelta

from flask import abort, jsonify, make_response

from padel_app.models.lesson_instances import LessonInstance
from padel_app.models import Association_CoachPlayer, CalendarBlock, Coach, Player, User
from padel_app.sql_db import db

DAY_KEYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
DEFAULT_WINDOW = ("08:00", "22:00")   # classes.class-requests rule 1, until a coach declares hours
MIN_FREE_MINUTES = 30                  # the shortest class a request may ask for
MAX_RANGE_DAYS = 62
MAX_PEOPLE = 4


def refuse(status: int, code: str, message: str, **extra):
    abort(make_response(jsonify({"code": code, "message": message, **extra}), status))


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


# ── settings.coach-working-hours ─────────────────────────────────────────────

def validate_working_hours(payload):
    """Rule 2: keys mon..sun, windows HH:MM on a 15-minute grid, start < end,
    sorted and non-overlapping per day. None clears. Returns the normalised value."""
    if payload is None:
        return None
    if not isinstance(payload, dict):
        refuse(400, "INVALID_WORKING_HOURS", "working hours must be an object of weekdays", day=None)
    out = {}
    for day, windows in payload.items():
        if day not in DAY_KEYS or not isinstance(windows, list):
            refuse(400, "INVALID_WORKING_HOURS", f"unknown weekday {day!r}", day=day)
        parsed = []
        for w in windows:
            try:
                start, end = w
                s, e = _minutes(str(start)), _minutes(str(end))
            except (TypeError, ValueError):
                refuse(400, "INVALID_WORKING_HOURS", f"{day}: windows are [\"HH:MM\", \"HH:MM\"]", day=day)
            if s % 15 or e % 15 or not (0 <= s < e <= 24 * 60):
                refuse(400, "INVALID_WORKING_HOURS", f"{day}: a window is start < end on a 15-minute grid", day=day)
            parsed.append((s, e))
        parsed.sort()
        for (s1, e1), (s2, _e2) in zip(parsed, parsed[1:]):
            if s2 < e1:
                refuse(400, "INVALID_WORKING_HOURS", f"{day}: windows overlap", day=day)
        out[day] = [[_hhmm(s), _hhmm(e)] for s, e in parsed]
    return out


def set_working_hours(coach: Coach, payload):
    coach.working_hours = validate_working_hours(payload)
    db.session.commit()
    return coach.working_hours


def working_windows_for(coach: Coach, day: _date) -> list:
    """The coach's windows for a day in minutes; the default when unset or the
    day is missing; [] for an explicit day off."""
    hours = coach.working_hours
    key = DAY_KEYS[day.weekday()]
    if hours is None or key not in hours:
        return [(_minutes(DEFAULT_WINDOW[0]), _minutes(DEFAULT_WINDOW[1]))]
    return [(_minutes(s), _minutes(e)) for s, e in hours[key]]


# ── classes.class-requests rule 12: who you can bring ────────────────────────

def _eligible_user(user: User) -> bool:
    from padel_app.tools.username_tools import is_placeholder_username

    return (
        user is not None
        and user.status == "active"
        and user.password is not None
        and bool(user.username)
        and not is_placeholder_username(user.username)
    )


def resolve_participants(requester: Player, coach: Coach, usernames) -> list:
    """One answer per username, never an oracle: `ok` with the player, or one
    of USERNAME_NOT_FOUND (unknown, placeholder, inactive, or not on this
    coach's roster alike), SELF_INVITE, DUPLICATE_INVITEE."""
    out, seen = [], set()
    for raw in usernames or []:
        username = (raw or "").strip()
        key = username.lower()
        if not username:
            continue
        if key in seen:
            out.append({"username": username, "ok": False, "code": "DUPLICATE_INVITEE"})
            continue
        seen.add(key)
        user = User.query.filter(db.func.lower(User.username) == key).first()
        if user is not None and requester.user_id == user.id:
            out.append({"username": username, "ok": False, "code": "SELF_INVITE"})
            continue
        player = user.player if (user is not None and _eligible_user(user)) else None
        on_roster = player is not None and Association_CoachPlayer.query.filter_by(
            coach_id=coach.id, player_id=player.id
        ).first() is not None
        if not on_roster:
            out.append({"username": username, "ok": False, "code": "USERNAME_NOT_FOUND"})
            continue
        out.append({"username": username, "ok": True, "playerId": str(player.id), "name": user.name})
    return out


def participants_or_refuse(requester: Player, coach: Coach, usernames, *, status_for_bad: int = 400) -> list:
    """The resolved invitees as Player ids, or the request-time refusals of rule 12."""
    resolved = resolve_participants(requester, coach, usernames)
    if len(resolved) + 1 > MAX_PEOPLE:
        refuse(400, "TOO_MANY_PEOPLE", f"a class is for {MAX_PEOPLE} people at most, you included")
    for item in resolved:
        if item["ok"]:
            continue
        code = item["code"]
        status = {"USERNAME_NOT_FOUND": 404, "SELF_INVITE": 400, "DUPLICATE_INVITEE": 409}[code]
        refuse(status, code, f"{item['username']}: {code.lower().replace('_', ' ')}", username=item["username"])
    return [int(item["playerId"]) for item in resolved]


# ── the free windows ─────────────────────────────────────────────────────────

def _strip(dt: datetime) -> datetime:
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def _person_busy_by_day(player: Player, range_start: datetime, range_end: datetime) -> dict:
    """{date -> [(start_min, end_min)]} of a person's classes and their
    `unavailable` blocks, recurring ones expanded. Private: only the
    subtraction leaves this module.

    Classes are the person's calendar projection (classes.class-requests rule
    13): every occurrence of a series they are on, materialised or not, plus
    the materialised occurrences they hold a presence on. Never Presence rows
    alone — a future occurrence gets its Presence only when it materialises
    (#338 review F1).
    """
    from padel_app.helpers.calendar_helpers import load_lesson_instances_for_player, load_lessons_for_player
    from padel_app.tools.calendar_tools import expand_occurrences

    busy = {}

    def add(start: datetime, end: datetime):
        start, end = _strip(start), _strip(end)
        day = start.date()
        s = start.hour * 60 + start.minute
        e = (end.hour * 60 + end.minute) if end.date() == day else 24 * 60
        if e > s:
            busy.setdefault(day, []).append((s, e))

    def _d(value):
        return value.date() if isinstance(value, datetime) else value

    mine = load_lesson_instances_for_player(player.id, range_start, range_end)
    seen = set()
    for (lesson_id, occ_date), inst in mine.items():
        seen.add((lesson_id, _d(occ_date)))
        if inst.status in ("canceled", "completed"):
            continue
        add(inst.start_datetime, inst.end_datetime)

    lessons = load_lessons_for_player(player.id, range_start, range_end)
    if lessons:
        # An occurrence that exists as an instance without this person's presence
        # is one they were taken off (or declined): the instance is the truth there.
        materialised = {
            (i.lesson_id, _d(i.original_lesson_occurence_date))
            for i in LessonInstance.query.filter(
                LessonInstance.lesson_id.in_([l.id for l in lessons]),
                LessonInstance.start_datetime >= range_start - timedelta(days=1),
                LessonInstance.start_datetime <= range_end + timedelta(days=1),
            ).all()
        }
        for lesson in lessons:
            if lesson.end_datetime is None or lesson.start_datetime is None:
                continue
            duration = lesson.end_datetime - lesson.start_datetime
            for occ in lesson.occurrences_between(range_start, range_end):
                key = (lesson.id, _strip(occ).date())
                if key in seen or key in materialised:
                    continue
                add(_strip(occ), _strip(occ) + duration)

    if player.user_id is None:
        return busy
    blocks = CalendarBlock.query.filter(
        CalendarBlock.user_id == player.user_id,
        CalendarBlock.blocks_auto_invitations.is_(True),
    ).all()
    for block in blocks:
        duration = block.end_datetime - block.start_datetime
        for occ in expand_occurrences(
            block.start_datetime, block.recurrence_rule, block.recurrence_end,
            range_start - timedelta(days=1), range_end + timedelta(days=1),
        ):
            add(_strip(occ), _strip(occ) + duration)
    return busy


def _subtract(windows: list, busy: list) -> list:
    free = sorted(windows)
    for bs, be in sorted(busy):
        nxt = []
        for s, e in free:
            if be <= s or bs >= e:
                nxt.append((s, e))
                continue
            if bs > s:
                nxt.append((s, bs))
            if be < e:
                nxt.append((be, e))
        free = nxt
    return free


def free_windows_for(coach: Coach, people: list, from_day: _date, to_day: _date, *, now: datetime,
                     exclude_request_id=None) -> dict:
    """{date -> [(start_min, end_min)]}: working time minus the coach's calendar
    (classes, blocks, other requests' holds) minus every person's busy time,
    windows >= MIN_FREE_MINUTES, today from the next quarter hour, past days omitted."""
    from padel_app.services.class_request_service import _busy_by_day

    range_start = datetime.combine(from_day, time.min)
    range_end = datetime.combine(to_day, time.max)
    coach_busy = _busy_by_day(coach, range_start, range_end, exclude_request_id=exclude_request_id)
    people_busy = [_person_busy_by_day(p, range_start, range_end) for p in people]
    out = {}
    day = from_day
    while day <= to_day:
        if day >= now.date():
            free = working_windows_for(coach, day)
            free = _subtract(free, coach_busy.get(day.isoformat(), []))
            for pb in people_busy:
                free = _subtract(free, pb.get(day, []))
            if day == now.date():
                floor = ((now.hour * 60 + now.minute + 14) // 15) * 15
                free = [(max(s, floor), e) for s, e in free]
            out[day] = [(s, e) for s, e in free if e - s >= MIN_FREE_MINUTES]
        day += timedelta(days=1)
    return out


def slot_fits(free_by_day: dict, day: _date, start_min: int, end_min: int) -> bool:
    return any(s <= start_min and end_min <= e for s, e in free_by_day.get(day, []))


def availability_for(requester: Player, coach: Coach, from_day: _date, to_day: _date, usernames, *, now=None) -> dict:
    """classes.availability rule 2: the endpoint's payload."""
    from padel_app.services.class_request_service import _now_wall_clock

    now = now or _now_wall_clock()
    if to_day < from_day or (to_day - from_day).days > MAX_RANGE_DAYS:
        abort(400, f"from..to must be at most {MAX_RANGE_DAYS} days")
    resolved = resolve_participants(requester, coach, usernames)
    if any(not item["ok"] for item in resolved):
        refuse(400, "INVALID_PARTICIPANTS", "one or more usernames cannot be invited", participants=resolved)
    invitees = [db.session.get(Player, int(item["playerId"])) for item in resolved]
    free = free_windows_for(coach, [requester, *invitees], from_day, to_day, now=now)
    return {
        "coachId": str(coach.id),
        "from": from_day.isoformat(),
        "to": to_day.isoformat(),
        "workingHours": coach.working_hours,
        "workingHoursSource": "coach" if coach.working_hours is not None else "default",
        "participants": resolved,
        "freeWindows": {
            day.isoformat(): [{"startTime": _hhmm(s), "endTime": _hhmm(e)} for s, e in windows]
            for day, windows in free.items()
        },
    }
