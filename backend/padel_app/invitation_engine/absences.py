"""Whether leaving a session is an absence, and the notice given (plan §8 steps 5 and 7, §7).

Owns: on time before ``absence_cutoff_at``, late after it or on a no-show, and none for an
automatic entrant's No. ``answers`` and ``timeline`` call it when someone leaves.

The engine only records the notice by the cutoff (engine-timeline rule 5; owner ruling D4); whether
the absence is justified is the coach's judgement (``attendance.confirm``), outside the engine.
"""
from __future__ import annotations

from datetime import datetime

from padel_app.invitation_engine.effects import Absence, AbsenceNotice, Effect, LeftReason
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.snapshot import SessionSnapshot
from padel_app.utils.dates import wall_to_utc_naive


def absence_cutoff_at(snapshot: SessionSnapshot, settings: EngineSettings) -> datetime:
    """§8 step 5: ``absence_cutoff_before`` in real hours before the class's real start, naive UTC, as
    today's ``presence_response.cancellation_deadline_utc`` (engine-timeline rule 5): never wall-clock
    arithmetic, which is an hour off across a clock change."""
    return wall_to_utc_naive(snapshot.start) - settings.absence_cutoff_before


def notice(snapshot: SessionSnapshot, settings: EngineSettings, student: str, reason: LeftReason,
           now: datetime) -> AbsenceNotice:
    """The notice leaving for ``reason`` at ``now`` gave (engine-timeline rules 5, 7; plan §7).

    A no-show is late. A No before the cutoff is on time, at
    or after it late, for a
    regular and for an invitee alike (§7: the same rules as regulars). An automatic entrant's No is no
    absence (the auto-entry setting's own rule, wave brief §2 clause 3).
    """
    if reason == "no_show":
        return "late"
    placement = snapshot.placement(student)
    if placement is not None and placement.how == "auto_from_waiting_list":
        return "none"
    return "on_time" if now < absence_cutoff_at(snapshot, settings) else "late"


def record(snapshot: SessionSnapshot, settings: EngineSettings, student: str, reason: LeftReason,
           now: datetime) -> tuple[Effect, ...]:
    """The ``Absence`` effect for ``student`` leaving for ``reason`` at ``now`` (naive UTC).

    Call it before the ``Left`` is applied, while the snapshot still shows how the student came in."""
    return (Absence(snapshot.id, now, student, notice(snapshot, settings, student, reason, now)),)
