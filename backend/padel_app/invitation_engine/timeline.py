"""A session's clock (plan §8): the instants, quiet hours and how long an invitation counts.

Owns: ``first_invite_at``, ``attendance_request_at``, ``absence_cutoff_at`` and
``last_invite_at`` from the settings; whether an invitation still counts (T per tier, Methods B
and C as values, quiet hours pausing it, D14, D16); the automatic-entry boundary at the
attendance request; and the duties due at an instant, such as fixing flexible students' sides at
``last_invite_at`` (§8 step 6) and the after-class no-shows (§8 step 7).

Phase 1 (PAD-902): the interface only. ``due`` returns nothing until the rules land in phase 2.
"""
from __future__ import annotations

from datetime import datetime

from padel_app.invitation_engine.effects import Effect
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.snapshot import SessionSnapshot


def due(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime) -> tuple[Effect, ...]:
    """The session's time-driven effects at ``now`` (naive UTC), before the planning run."""
    return ()
