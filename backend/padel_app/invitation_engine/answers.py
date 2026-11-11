"""What happens when someone acts on a session (plan §7, §8 step 4): Yes and No, the waiting
lists, direct join, regulars' absences and returns, cancellations, attendance confirmations.

Owns: placement on Yes within the offer (D20, D7, D6), the last spot claimed once (S32), "sorry"
and the re-offer (D4, Q6), the said-No gate (§3), joining and leaving the two lists with the
student's side choice, direct join when the setting is on, and the refusals of each.

Phase 1 (PAD-902): the interface only. ``handle`` changes nothing until the rules land in phase 2.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from padel_app.invitation_engine.effects import Effect
from padel_app.invitation_engine.requests import Request
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.snapshot import SessionSnapshot


@dataclass(frozen=True)
class Outcome:
    effects: tuple[Effect, ...] = ()


def handle(snapshot: SessionSnapshot, settings: EngineSettings, request: Request, now: datetime) -> Outcome:
    """Decide the effects of one student-facing request at ``now`` (naive UTC).

    A request the session cannot take is refused, never raised: an ``Answer`` with no open
    invitation (none sent, already answered, or the class has started) has no effects; a refused
    join returns a ``Refused`` effect. The scenario harness relies on this (design §12; 65, 72, 79).
    """
    return Outcome()
