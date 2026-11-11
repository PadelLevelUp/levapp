"""Whether leaving a session is an absence, and which kind (plan §8 steps 5 and 7, §7).

Owns: justified before ``absence_cutoff_at``, unjustified after it or on a no-show, and none for
an automatic entrant's No. ``answers`` and ``timeline`` call it when someone leaves.

The engine decides by the cutoff (engine-timeline rule 5); the coach can still correct the kind
afterwards (``attendance.confirm``), outside the engine.
"""
from __future__ import annotations

from datetime import datetime

from padel_app.invitation_engine.effects import Absence, AbsenceKind, Effect, LeftReason
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.snapshot import SessionSnapshot
from padel_app.utils.dates import wall_to_utc_naive


def absence_cutoff_at(snapshot: SessionSnapshot, settings: EngineSettings) -> datetime:
    """§8 step 5: ``absence_cutoff_before`` ahead of the class (Lisbon wall-clock), as naive UTC."""
    return wall_to_utc_naive(snapshot.start - settings.absence_cutoff_before)


def kind(snapshot: SessionSnapshot, settings: EngineSettings, student: str, reason: LeftReason,
         now: datetime) -> AbsenceKind:
    """Which absence leaving for ``reason`` at ``now`` is (engine-timeline rules 5, 7; plan §7).

    A no-show is unjustified. A No before the cutoff is justified, at or after it unjustified, for a
    regular and for an invitee alike (§7: the same rules as regulars). An automatic entrant's No is no
    absence (the auto-entry setting's own rule, wave brief §2 clause 3).
    """
    if reason == "no_show":
        return "unjustified"
    placement = snapshot.placement(student)
    if placement is not None and placement.how == "auto_from_waiting_list":
        return "none"
    return "justified" if now < absence_cutoff_at(snapshot, settings) else "unjustified"


def record(snapshot: SessionSnapshot, settings: EngineSettings, student: str, reason: LeftReason,
           now: datetime) -> tuple[Effect, ...]:
    """The ``Absence`` effect for ``student`` leaving for ``reason`` at ``now`` (naive UTC).

    Call it before the ``Left`` is applied, while the snapshot still shows how the student came in."""
    return (Absence(snapshot.id, now, student, kind(snapshot, settings, student, reason, now)),)
