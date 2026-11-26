"""
Student availability blockers.

A student marks windows when they are unavailable so the smart notification
engine will NOT send them AUTOMATIC class invitations during those windows.

Implementation note (PAD-28): rather than a dedicated StudentBlocker table, we
REUSE the existing `CalendarBlock` model (already user-scoped, one-time AND
recurring, with full CRUD + recurrence machinery). Student blockers are
`CalendarBlock` rows with `type="unavailable"` and
`blocks_auto_invitations=True`. This keeps them visible on the shared calendar
feed for free and avoids duplicating recurrence logic.

Timezone (locked decision): datetimes are stored as UTC (naive == UTC, matching
LessonInstance storage). Recurring-occurrence expansion is evaluated against the
club / Lisbon timezone so that "every Monday 18:00-20:00" tracks Lisbon wall
clock, not UTC.
"""

import json
import re
from datetime import date, timedelta, datetime, timezone

from padel_app.models import CalendarBlock
from padel_app.tools.calendar_tools import expand_occurrences, ensure_utc
from padel_app.services.calendar_service import (
    add_event_service,
    edit_event_service,
    remove_block_service,
)

# PAD-144: single shared definition (was one of three identical copies).
from padel_app.utils.dates import CLUB_TZ

# Marker values that identify a student availability blocker.
BLOCKER_TYPE = "unavailable"


# ---------------------------------------------------------------------------
# CRUD (thin wrappers over calendar_service, forcing blocker semantics)
# ---------------------------------------------------------------------------

def list_student_blockers(user_id):
    """Return all availability blockers owned by the user, newest first."""
    return (
        CalendarBlock.query
        .filter(
            CalendarBlock.user_id == user_id,
            CalendarBlock.blocks_auto_invitations.is_(True),
        )
        .order_by(CalendarBlock.start_datetime.desc())
        .all()
    )


def create_student_blocker(user_id, data):
    """
    Create an availability blocker for the student.

    `data` matches the frontend add_event payload:
      { title, date, startTime, endTime, isRecurring, recurrenceRule, endDate }
    We force type="unavailable" and blocks_auto_invitations=True.
    """
    payload = dict(data)
    payload["type"] = BLOCKER_TYPE
    block = add_event_service(user_id, payload)
    block.blocks_auto_invitations = True
    block.type = BLOCKER_TYPE
    block.save()
    return block


def update_student_blocker(block_id, user_id, data):
    """Edit an availability blocker owned by the student."""
    # Ownership is enforced by edit_event_service (filter_by user_id).
    payload = dict(data)
    payload["type"] = BLOCKER_TYPE
    block = edit_event_service(block_id, user_id, payload)
    block.blocks_auto_invitations = True
    block.type = BLOCKER_TYPE
    block.save()
    return block


def delete_student_blocker(block_id, user_id, occ_date=None, scope="all"):
    """Delete an availability blocker (scope-aware for recurring series)."""
    remove_block_service(block_id, user_id, occ_date, scope)


# ---------------------------------------------------------------------------
# Schedules (PAD-839, calendar.student-blockers rule 18): the rows one save of the
# setup guide's schedule editor writes, sharing `schedule_id`, written and deleted whole.
# ---------------------------------------------------------------------------

_SCHEDULE_ID_RE = re.compile(r"^[0-9A-Za-z-]{1,36}$")
_HHMM_RE = re.compile(r"^([01][0-9]|2[0-3]):[0-5][0-9]$")


class ScheduleError(Exception):
    """A schedule write refused before anything is written (400 unless `status` says so)."""

    def __init__(self, message, *, status=400, row=None, field=None):
        super().__init__(message)
        self.message, self.status, self.row, self.field = message, status, row, field


def _schedule_rows(user_id, schedule_id):
    return CalendarBlock.query.filter_by(user_id=user_id, schedule_id=schedule_id).all()


def _check_schedule_id(schedule_id):
    if not schedule_id or not _SCHEDULE_ID_RE.match(schedule_id):
        raise ScheduleError("Invalid schedule id", field="scheduleId")


def _schedule_row(user_id, schedule_id, title, row, i):
    """One row checked like a single blocker create, plus what a schedule row must be: weekly,
    with weekdays, a start before its end and an end date on or after its start date."""
    def refuse(field, message):
        raise ScheduleError(message, row=i, field=field)

    if not isinstance(row, dict):
        refuse("row", "Each blocker must be an object")
    try:
        day = date.fromisoformat(str(row.get("date") or ""))
    except ValueError:
        refuse("date", "date must be YYYY-MM-DD")
    start, end = row.get("startTime"), row.get("endTime")
    if not (isinstance(start, str) and _HHMM_RE.match(start)):
        refuse("startTime", "startTime must be HH:MM")
    if not (isinstance(end, str) and _HHMM_RE.match(end)):
        refuse("endTime", "endTime must be HH:MM")
    if end <= start:
        refuse("endTime", "endTime must be after startTime")
    if row.get("isRecurring") is not True:
        refuse("isRecurring", "A schedule row is weekly")
    rule = row.get("recurrenceRule") or {}
    days = rule.get("daysOfWeek") if isinstance(rule, dict) else None
    if (rule.get("frequency") if isinstance(rule, dict) else None) != "weekly" or not days or not all(
        isinstance(d, int) and not isinstance(d, bool) and 0 <= d <= 6 for d in days
    ):
        refuse("recurrenceRule", "recurrenceRule must be weekly with daysOfWeek in 0..6")
    try:
        end_date = date.fromisoformat(str(row.get("endDate") or ""))
    except ValueError:
        refuse("endDate", "endDate must be YYYY-MM-DD")
    if end_date < day:
        refuse("endDate", "endDate must not be before date")

    return CalendarBlock(
        user_id=user_id,
        type=BLOCKER_TYPE,
        title=title,
        start_datetime=datetime.fromisoformat(f"{day.isoformat()}T{start}"),
        end_datetime=datetime.fromisoformat(f"{day.isoformat()}T{end}"),
        is_recurring=True,
        recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": sorted(set(days))}),
        recurrence_end=end_date,
        blocks_auto_invitations=True,
        schedule_id=schedule_id,
    )


def parse_schedule(user_id, schedule_id, data):
    """The rows a schedule body describes, every one checked like a single create, written nowhere
    (rule 18's check, shared by the PUT and by the covered-classes read, PAD-772 rule 19)."""
    _check_schedule_id(schedule_id)
    if CalendarBlock.query.filter(
        CalendarBlock.schedule_id == schedule_id, CalendarBlock.user_id != user_id
    ).first() is not None:
        raise ScheduleError("Schedule not found", status=404)
    data = data if isinstance(data, dict) else {}
    title = data.get("title")
    if title is not None and not isinstance(title, str):
        raise ScheduleError("title must be text or null", field="title")
    title = (title or "").strip()[:255] or None
    rows = data.get("blockers")
    if not isinstance(rows, list) or not rows:
        raise ScheduleError("blockers must be a non-empty list", field="blockers")
    return [_schedule_row(user_id, schedule_id, title, row, i) for i, row in enumerate(rows)]


def put_student_schedule(user_id, schedule_id, data):
    """Replace (or create) the student's schedule `schedule_id` in one unit of work: every row is
    checked first, then the old rows are deleted and the new ones written, flag included, before
    the one commit. A refused row writes nothing, old or new. Another user's id is 404."""
    from padel_app.sql_db import db

    new_rows = parse_schedule(user_id, schedule_id, data)
    for old in _schedule_rows(user_id, schedule_id):
        db.session.delete(old)
    db.session.add_all(new_rows)
    db.session.commit()
    return new_rows


def delete_student_schedule(user_id, schedule_id):
    """Remove every row of the student's schedule; 404 when they have none under that id."""
    from padel_app.sql_db import db

    _check_schedule_id(schedule_id)
    rows = _schedule_rows(user_id, schedule_id)
    if not rows:
        raise ScheduleError("Schedule not found", status=404)
    for row in rows:
        db.session.delete(row)
    db.session.commit()


# ---------------------------------------------------------------------------
# Eligibility suppression — used by the notification engine
# ---------------------------------------------------------------------------

def _windows_overlap(a_start, a_end, b_start, b_end):
    """Half-open overlap test: [a_start, a_end) intersects [b_start, b_end)."""
    return a_start < b_end and b_start < a_end


def user_is_blocked_for_window(user_id, window_start, window_end):
    """
    True if the user has an availability blocker (blocks_auto_invitations=True)
    whose one-time or recurring occurrence overlaps [window_start, window_end).

    Recurrence occurrences are expanded and compared in the club (Lisbon)
    timezone, per the locked timezone decision.
    """
    if user_id is None:
        return False
    return user_id in blocked_user_ids_for_window([user_id], window_start, window_end)


def blocked_user_ids_for_window(user_ids, window_start, window_end):
    """PAD-276 (audit M17): the set of ``user_ids`` with an availability blocker
    (blocks_auto_invitations=True) whose one-time or recurring occurrence
    overlaps [window_start, window_end) — ONE ``calendar_blocks`` query for the
    whole list instead of one per user. Same predicate as
    :func:`user_is_blocked_for_window`, which now delegates here."""
    ids = [uid for uid in (user_ids or []) if uid is not None]
    if not ids:
        return set()

    win_start = ensure_utc(window_start)
    win_end = ensure_utc(window_end)
    if win_start is None or win_end is None:
        return set()

    # Widen the expansion range by a day on each side so a block that starts
    # just before the window (but overlaps it) is still surfaced.
    range_start = win_start - timedelta(days=1)
    range_end = win_end + timedelta(days=1)

    blocks = (
        CalendarBlock.query
        .filter(
            CalendarBlock.user_id.in_(ids),
            CalendarBlock.blocks_auto_invitations.is_(True),
        )
        .all()
    )

    blocked = set()
    for block in blocks:
        if block.user_id in blocked:
            continue
        duration = (block.end_datetime - block.start_datetime)
        occurrences = expand_occurrences(
            block.start_datetime,
            block.recurrence_rule,
            block.recurrence_end,
            range_start,
            range_end,
        )
        for occ_start in occurrences:
            occ_start = ensure_utc(occ_start)
            occ_end = occ_start + duration
            if _windows_overlap(win_start, win_end, occ_start, occ_end):
                blocked.add(block.user_id)
                break

    return blocked


def blocked_player_ids_for_window(player_ids, window_start, window_end):
    """
    PAD-107: subset of ``player_ids`` whose owning User has an availability
    blocker overlapping [window_start, window_end).

    Returns a ``set`` of player ids (ints). Players with no user account can
    never be blocked (they have no way to declare unavailability).
    """
    from padel_app.models import Player

    ids = [int(pid) for pid in (player_ids or [])]
    if not ids:
        return set()
    # PAD-276: one players query and one calendar_blocks query for the list.
    user_by_player = {
        p.id: p.user_id
        for p in Player.query.filter(Player.id.in_(ids)).all()
        if p.user_id is not None
    }
    blocked_users = blocked_user_ids_for_window(
        list(user_by_player.values()), window_start, window_end
    )
    return {pid for pid in ids if user_by_player.get(pid) in blocked_users}


def blocked_players_for_instance(instance, player_ids=None):
    """
    PAD-107: ``[{"playerId": <int>, "name": <str>}]`` for the players who are
    unavailable during ``instance``'s window.

    The class INSTANCE window is what matters — not the moment the notification
    is sent — matching the ticket's "neste horário" (this class slot) and
    ``filter_blocked_coach_players``.

    Only the player id and display name are returned. A coach must never see
    the student's blocker title, description or exact hours: that is the
    student's private calendar.
    """
    from padel_app.models import Player

    if instance is None:
        return []
    if player_ids is None:
        player_ids = sorted(instance.enrolled_player_ids)  # PAD-259

    blocked_ids = blocked_player_ids_for_window(
        player_ids, instance.start_datetime, instance.end_datetime
    )

    out = []
    for player_id in player_ids:
        if int(player_id) not in blocked_ids:
            continue
        player = Player.query.get(player_id)
        name = player.user.name if player and player.user else ""
        # ``cause`` distinguishes this from a PAD-112 preference block once both
        # kinds share one ``blocked`` array on the notify routes. No ``reason``
        # key here, deliberately: the blocker's details are private.
        out.append({"playerId": int(player_id), "name": name, "cause": "unavailable"})
    return out


def instance_window_is_blocked_for_user(user_id, instance):
    """PAD-107 delivery backstop: is ``user_id`` unavailable for this class slot?"""
    if instance is None or user_id is None:
        return False
    return user_is_blocked_for_window(
        user_id, instance.start_datetime, instance.end_datetime
    )


def filter_blocked_coach_players(coach_players, instance):
    """
    Given a list of Association_CoachPlayer candidates for an auto-invitation,
    drop any whose owning User has an availability blocker overlapping the
    instance window. Only affects AUTO invitations (this helper is not called
    on the manual path).
    """
    if not coach_players:
        return coach_players

    window_start = instance.start_datetime
    window_end = instance.end_datetime

    kept = []
    for cp in coach_players:
        player = cp.player
        user_id = player.user_id if player else None
        if user_is_blocked_for_window(user_id, window_start, window_end):
            continue
        kept.append(cp)
    return kept
