"""What the engine tells people (plan §8 step 3, §6 step 4): attendance requests and coach alerts.

Owns: who gets the attendance request and its repeats (every going student; an invitation acceptor
only when placed by the first send, PAD-820), and the coach alert when no tier can fill a spot. The
wording of invitations (D11) is the planner's, through ``Invited.side_named``.

The attendance request (engine-timeline rule 2, notifications.reminders) runs on one schedule per
session: the first at ``attendance_request_at``, then every ``every``, ``max`` slots in all. At each
slot, everyone it is due to who has not answered Yes and was going by then is asked once; someone
who becomes going after a slot waits for the next one. A slot that falls in quiet hours waits for
them to end (D14), a run that comes late sends only the latest slot, and nothing goes out once the
class has started. No student is asked more than ``max`` times in all for the session, the coach's asks
included (the cap, counted as notifications.reminders rule 19: ``SessionSnapshot.asks``). The coach
alert is emitted by the planner (engine-planning rule 11).

The coach's ask (engine-timeline rule 8, ``coach_ask``) goes at once, outside the schedule, to every
going student the schedule asks, and names every going student it does not ask with one reason.
"""
from __future__ import annotations

from datetime import datetime
from typing import Mapping

from padel_app.invitation_engine.effects import AttendanceRequested, Effect, NotAsked
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.snapshot import SessionSnapshot
from padel_app.invitation_engine.timeline import attendance_request_at, is_quiet
from padel_app.utils.dates import wall_to_utc_naive

ASKED = ("regular", "regular_returns", "returns", "auto_from_waiting_list", "direct", "invitation")


def _current_slot(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime) -> datetime | None:
    """The latest request slot at or before ``now``, or ``None`` before the first one."""
    ar = settings.attendance_request
    first = attendance_request_at(snapshot, settings)
    if first is None:                                    # ``none``: never asked
        return None
    passed = [first + k * ar.every for k in range(ar.max) if first + k * ar.every <= now]
    return passed[-1] if passed else None


def due(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime) -> tuple[Effect, ...]:
    """The session's messages due at ``now`` (naive UTC): the attendance requests of the current slot."""
    if now >= wall_to_utc_naive(snapshot.start) or is_quiet(settings, now):
        return ()
    slot = _current_slot(snapshot, settings, now)
    if slot is None:
        return ()
    first = attendance_request_at(snapshot, settings)
    out: list[Effect] = []
    for p in snapshot.going:
        if p.how not in ASKED or p.student in snapshot.absent or p.student in snapshot.confirmed:
            continue
        student = snapshot.students.get(p.student)
        if student is not None and student.blocks_all:   # blocked all notifications (engine-timeline rule 2)
            continue
        if p.how != "regular" and p.at > slot:        # going since after this slot: the next one
            continue
        if p.how == "invitation" and p.at > first:    # PAD-820: said yes after the first send, not asked
            continue
        if any(sent >= slot for sent in snapshot.attendance_requested.get(p.student, ())):
            continue
        if snapshot.asks(p.student) >= settings.attendance_request.max:   # the cap, the coach's asks included
            continue
        out.append(AttendanceRequested(snapshot.id, now, p.student))
    return tuple(out)


def coach_ask(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime,
              skipped: Mapping[str, str] | None = None) -> tuple[Effect, ...]:
    """The coach asks now (engine-timeline rule 8): an ``AttendanceRequested`` at ``now`` to every going
    student the schedule asks, whatever the quiet hours, the session's switch or the request type; one
    ``NotAsked`` for every other going student (an absent regular included), with the first reason that
    holds, in this order: ``not_coming``, ``already_confirmed``, ``preference``, ``reminder_limit``, the
    reason ``skipped`` gives. Nothing once the class has started."""
    if now >= wall_to_utc_naive(snapshot.start):
        return ()
    skipped = skipped or {}
    first = attendance_request_at(snapshot, settings)
    going = {p.student: p for p in snapshot.going}
    absent = [s for s in sorted(snapshot.absent) if s not in going]
    out: list[Effect] = []
    for student in [*going, *absent]:
        p = going.get(student)
        info = snapshot.students.get(student)
        if p is None or student in snapshot.absent:
            reason = "not_coming"
        elif student in snapshot.confirmed or (p.how == "invitation" and first is not None and p.at > first):
            reason = "already_confirmed"                 # answered, or PAD-820: just said yes after the first send
        elif info is not None and info.blocks_all:
            reason = "preference"
        elif snapshot.asks(student) >= settings.attendance_request.max:
            reason = "reminder_limit"
        elif student in skipped:
            reason = skipped[student]
        else:
            out.append(AttendanceRequested(snapshot.id, now, student))
            continue
        out.append(NotAsked(snapshot.id, now, student, reason))
    return tuple(out)
