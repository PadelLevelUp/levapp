"""One planning run for one session (plan §6): spots, tiers, coverage, X and M, D17, offers.

Owns: going counts and spot types (§4, D2, D3, D18, D19); tiers per spot type from the coach's
groups and the waiting lists (§5, D12, Q7); candidates and gates (D8, D13, D15); coverage in
distinct people (D5, D9); top-up to X or 1 (D17, §6.1) under M (D16); offers and named sides
(D20, D11); automatic entry from the waiting list when the setting is on; the coach alert when no
tier can take a spot (§6 step 4).

Phase 1 (PAD-902): the interface only. ``plan`` plans nothing until the rules land in phase 2.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from padel_app.invitation_engine.effects import Effect
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.snapshot import SessionSnapshot


@dataclass(frozen=True)
class Plan:
    """What one run decided: ``Invited``, ``Placed`` (automatic entry) and ``CoachAlert`` effects."""

    effects: tuple[Effect, ...] = ()


def plan(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime) -> Plan:
    """Decide the session's new invitations at ``now`` (naive UTC). Never revokes (D4)."""
    return Plan()
