"""What the engine tells people (plan §8 step 3, §6 step 4): attendance requests and coach alerts.

Owns: who gets the attendance request and its repeats (regulars, automatic entrants and direct
joiners; not invitation acceptors), and the coach alert when no tier can fill a spot. The
wording of invitations (D11) is the planner's, through ``Invited.side_named``.

The attendance request (engine-timeline rule 2, notifications.reminders) runs on one schedule per
session: the first at ``attendance_request_at``, then every ``every``, ``max`` slots in all. At each
slot, everyone it is due to who has not answered Yes and was going by then is asked once; someone
who becomes going after a slot waits for the next one. A slot that falls in quiet hours waits for
them to end (D14), a run that comes late sends only the latest slot, and nothing goes out once the
class has started. The coach alert is emitted by the planner (engine-planning rule 11).
"""
from __future__ import annotations

from datetime import datetime

from padel_app.invitation_engine.effects import AttendanceRequested, Effect
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.snapshot import SessionSnapshot
from padel_app.invitation_engine.timeline import attendance_request_at, is_quiet
from padel_app.utils.dates import wall_to_utc_naive

ASKED = ("regular", "regular_returns", "auto_from_waiting_list", "direct")   # never "invitation"


def _current_slot(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime) -> datetime | None:
    """The latest request slot at or before ``now``, or ``None`` before the first one."""
    ar = settings.attendance_request
    first = attendance_request_at(snapshot, settings)
    passed = [first + k * ar.every for k in range(ar.max) if first + k * ar.every <= now]
    return passed[-1] if passed else None


def due(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime) -> tuple[Effect, ...]:
    """The session's messages due at ``now`` (naive UTC): the attendance requests of the current slot."""
    if now >= wall_to_utc_naive(snapshot.start) or is_quiet(settings, now):
        return ()
    slot = _current_slot(snapshot, settings, now)
    if slot is None:
        return ()
    out: list[Effect] = []
    for p in snapshot.going:
        if p.how not in ASKED or p.student in snapshot.absent or p.student in snapshot.confirmed:
            continue
        if p.how != "regular" and p.at > slot:        # going since after this slot: the next one
            continue
        if any(sent >= slot for sent in snapshot.attendance_requested.get(p.student, ())):
            continue
        out.append(AttendanceRequested(snapshot.id, now, p.student))
    return tuple(out)
