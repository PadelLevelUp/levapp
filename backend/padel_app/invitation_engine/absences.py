"""Whether leaving a session is an absence, and which kind (plan §8 steps 5 and 7, §7).

Owns: justified before ``absence_cutoff_at``, unjustified after it or on a no-show, and none for
an automatic entrant's No. ``answers`` and ``timeline`` call it when someone leaves.

Phase 1 (PAD-902): the interface only. ``record`` records nothing until the rules land in phase 2.
"""
from __future__ import annotations

from datetime import datetime

from padel_app.invitation_engine.effects import Effect, LeftReason
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.snapshot import SessionSnapshot


def record(snapshot: SessionSnapshot, settings: EngineSettings, student: str, reason: LeftReason,
           now: datetime) -> tuple[Effect, ...]:
    """The ``Absence`` effect for ``student`` leaving for ``reason`` at ``now`` (naive UTC), if any."""
    return ()
