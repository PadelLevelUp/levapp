"""What the engine tells people (plan §8 step 3, §6 step 4): attendance requests and coach alerts.

Owns: who gets the attendance request and its repeats (regulars, automatic entrants and direct
joiners; not invitation acceptors), and the coach alert when no tier can fill a spot. The
wording of invitations (D11) is the planner's, through ``Invited.side_named``.

Phase 1 (PAD-902): the interface only. ``due`` returns nothing until the rules land in phase 2.
"""
from __future__ import annotations

from datetime import datetime

from padel_app.invitation_engine.effects import Effect
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.snapshot import SessionSnapshot


def due(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime) -> tuple[Effect, ...]:
    """The session's messages due at ``now`` (naive UTC)."""
    return ()
