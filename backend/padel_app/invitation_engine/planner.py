"""One planning run for one session (plan §6): spots, tiers, coverage, X and M, D17, offers.

Owns: going counts and spot types (§4, D2, D3, D18, D19); tiers per spot type from the coach's
groups and the waiting lists (§5, D12, Q7); candidates and gates (D8, D13, D15); coverage in
distinct people (D5, D9); top-up to X or 1 (D17, §6.1) under M (D16); offers and named sides
(D20, D11); automatic entry from the waiting list when the setting is on; the coach alert when no
tier can take a spot (§6 step 4).

Waves (specflow/impl/notifications/_overview.md, "Engine waves"): W1 the counts
(``spot_counts``, ``spot_types``, ``side_admits``); W2 the run itself. ``plan`` plans nothing until W2.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from padel_app.invitation_engine.constants import side_quota
from padel_app.invitation_engine.effects import Effect
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.snapshot import SIDES, SessionSnapshot, Side, SpotType


@dataclass(frozen=True)
class SpotCounts:
    """What a session needs, by side (engine-spots rule 6; plan §4).

    ``flexible_unplaced`` are going students with no side yet (a {L, R} regular the coach has not
    placed); ``over_quota[v]`` is how many going students placed on v exceed its quota, each of them a
    flexible going student too (rule 9). ``Σ open(v) = class_empty + flexible_going``.
    """

    class_empty: int
    open: dict[Side, int]
    must: dict[Side, int]
    either: int
    flexible_unplaced: tuple[str, ...]
    over_quota: dict[Side, int]

    @property
    def flexible_going(self) -> int:
        return len(self.flexible_unplaced) + sum(self.over_quota.values())


def spot_counts(snapshot: SessionSnapshot) -> SpotCounts:
    """The session's counts, from scratch (engine-spots rules 2, 4-6, 9)."""
    quota = side_quota(snapshot.capacity)
    placed = {v: sum(1 for p in snapshot.going if p.side == v) for v in SIDES}
    class_empty = max(0, snapshot.capacity - len(snapshot.going))
    open_ = {v: max(0, quota - placed[v]) for v in SIDES}
    must = {v: max(0, class_empty - sum(open_[w] for w in SIDES if w != v)) for v in SIDES}
    return SpotCounts(
        class_empty=class_empty,
        open=open_,
        must=must,
        either=class_empty - sum(must.values()),
        flexible_unplaced=tuple(p.student for p in snapshot.going if p.side is None),
        over_quota={v: max(0, placed[v] - quota) for v in SIDES},
    )


def spot_types(snapshot: SessionSnapshot, counts: SpotCounts | None = None) -> tuple[tuple[SpotType, int], ...]:
    """The session's spot types with how many spots each: the ``must(v)`` types, then ``either``,
    all at the class's level (engine-spots rules 7, 8; D2, D3). Types with no spot are left out."""
    counts = counts or spot_counts(snapshot)
    types = [(SpotType(v, snapshot.level), counts.must[v]) for v in SIDES]
    types.append((SpotType(None, snapshot.level), counts.either))
    return tuple((t, n) for t, n in types if n > 0)


def type_sides(spot_type: SpotType, counts: SpotCounts) -> frozenset[Side]:
    """The category values a spot type stands for: v for ``must(v)``; for ``either``, every v with
    ``open(v) > 0`` (engine-spots rule 7)."""
    if spot_type.side is not None:
        return frozenset({spot_type.side})
    return frozenset(v for v in SIDES if counts.open[v] > 0)


def side_admits(rule: Literal["same", "other", "any"], spot_type: SpotType, sides: frozenset[str],
                counts: SpotCounts) -> bool:
    """Whether a tier's side rule admits a student holding ``sides`` for ``spot_type``
    (engine-spots rule 7, engine-settings rule 6). ``same``: the student fits a value the type stands
    for; ``other``: the type has one value and the student does not fit it (an ``either`` spot admits
    nobody); ``any``: no side rule."""
    if rule == "any":
        return True
    values = type_sides(spot_type, counts)
    if rule == "same":
        return bool(sides & values)
    return spot_type.side is not None and spot_type.side not in sides


@dataclass(frozen=True)
class Plan:
    """What one run decided: ``Invited``, ``Placed`` (automatic entry) and ``CoachAlert`` effects."""

    effects: tuple[Effect, ...] = ()


def plan(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime) -> Plan:
    """Decide the session's new invitations at ``now`` (naive UTC). Never revokes (D4)."""
    return Plan()
