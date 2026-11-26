"""PAD-772 (calendar.student-blockers rules 19-20): the classes a student's availability block covers.

Saving a block answers the student's own classes it overlaps, so web and iOS can ask whether to mark
them "Não vai". This module only READS: nothing here writes a presence, an instance or a message.

A covered occurrence is one on the student's own calendar (what ``GET /api/app/calendar`` builds for
a student, so a recurring class's occurrence with no instance row yet counts, and so does a one-off
class) that overlaps an occurrence of the block with the predicate the invitation engine already uses
(``student_availability_service._windows_overlap``, half-open, class window against block window,
compared the way ``blocked_user_ids_for_window`` compares them), has not started on the club's clock,
is not cancelled, and is ``planned`` or ``coming`` for the student.
"""
from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace

from padel_app.tools.calendar_tools import ensure_utc, expand_occurrences

# specflow/impl/calendar/constants.md: how far ahead, counted from the block's first occurrence, a block is asked about.
BLOCKER_COVERED_HORIZON_DAYS = 92


def snapshot(block):
    """The values of a block that decide what it covers, detached from the row, so the covered set
    from BEFORE an edit can be computed after the edit has been written."""
    return SimpleNamespace(
        start_datetime=block.start_datetime, end_datetime=block.end_datetime,
        recurrence_rule=block.recurrence_rule, recurrence_end=block.recurrence_end,
    )


def _occurrences(block, now_utc):
    """The block's occurrences that can still matter: from a day before now to its horizon
    (the earlier of its recurrence end and its first occurrence's date + the horizon)."""
    first = block.start_datetime.date()
    last = first + timedelta(days=BLOCKER_COVERED_HORIZON_DAYS)
    end = block.recurrence_end
    if isinstance(end, datetime):
        end = end.date()
    if block.recurrence_rule and end is not None:
        last = min(last, end)
    if not block.recurrence_rule:
        last = first
    range_start = max(ensure_utc(block.start_datetime), now_utc - timedelta(days=1))
    range_end = datetime.combine(last + timedelta(days=1), time.min, tzinfo=timezone.utc)
    duration = block.end_datetime - block.start_datetime
    out = []
    for occ in expand_occurrences(
        block.start_datetime, block.recurrence_rule, block.recurrence_end, range_start, range_end
    ):
        occ = ensure_utc(occ)
        if occ.date() <= last:
            out.append((occ, occ + duration))
    return out


def _class_window(event):
    start = datetime.combine(date.fromisoformat(event["date"]), datetime.strptime(event["startTime"], "%H:%M").time())
    end = datetime.combine(start.date(), datetime.strptime(event["endTime"], "%H:%M").time())
    if end <= start:  # a class that ends at 00:00 ends at midnight of its day
        end += timedelta(days=1)
    return start, end


def covered_for_blocks(user, blocks):
    """Rule 19: the student's covered occurrences for ``blocks`` (saved or not), ordered by start."""
    from padel_app.helpers.calendar_helpers import build_player_calendar_events
    from padel_app.models import LessonInstance, Player, Presence
    from padel_app.services.student_availability_service import _windows_overlap
    from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive

    player = Player.query.filter_by(user_id=user.id).first()
    if player is None:
        return []
    now = utcnow_naive()
    now_utc = now.replace(tzinfo=timezone.utc)
    windows = [w for block in blocks for w in _occurrences(block, now_utc)]
    if not windows:
        return []

    lo = min(s for s, _ in windows) - timedelta(days=1)
    hi = max(e for _, e in windows) + timedelta(days=1)
    events = build_player_calendar_events(player.id, user.id, max(lo, now_utc - timedelta(days=1)), hi, include_blocks=False)
    events = [e for e in events if e.get("model") in ("Lesson", "LessonInstance")]

    instance_ids = [e["originalId"] for e in events if e["model"] == "LessonInstance"]
    instances = {i.id: i for i in LessonInstance.query.filter(LessonInstance.id.in_(instance_ids)).all()} if instance_ids else {}
    states = (
        {p.lesson_instance_id: p.attendance_state if not p.validated else "validated"  # a coach-marked row is not ours to answer
         for p in Presence.query.filter(Presence.player_id == player.id, Presence.lesson_instance_id.in_(instance_ids)).all()}
        if instance_ids else {}
    )
    now_wall = utc_to_wall_naive(now)

    out, seen = [], set()
    for event in events:
        key = (event["model"], event["originalId"], event["date"])
        if key in seen:
            continue
        start, end = _class_window(event)
        if start <= now_wall:  # started (or running): the club's clock
            continue
        if event["model"] == "LessonInstance":
            instance = instances.get(event["originalId"])
            if instance is None or instance.status == "cancelled":
                continue
            if states.get(event["originalId"]) not in ("planned", "coming"):
                continue
        if not any(_windows_overlap(ensure_utc(start), ensure_utc(end), s, e) for s, e in windows):
            continue
        seen.add(key)
        out.append({
            "model": event["model"], "originalId": event["originalId"], "date": event["date"],
            "title": event.get("title"), "start": start.isoformat(), "end": end.isoformat(),
        })
    out.sort(key=lambda c: (c["start"], c["originalId"]))
    return out


def newly_covered(after, before):
    """Rule 20: what ``after`` covers that ``before`` did not."""
    known = {(c["model"], c["originalId"], c["date"]) for c in before}
    return [c for c in after if (c["model"], c["originalId"], c["date"]) not in known]
