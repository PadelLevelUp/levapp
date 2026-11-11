"""The coach's invitation settings, as one validated, immutable value (plan §5.1, §8).

Every number the engine reads comes from here; nothing else holds a setting. Where the plan is
silent and a coach rule exists (wave brief §2, clause 3), the rule is a setting with an "off"
default, so an engine built from defaults behaves as the plan alone says.

Durations are ``timedelta``; times of day are ``datetime.time`` in Lisbon wall-clock (R-023):
first invitation, quiet hours and the attendance request are times a coach types.
"""
from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from datetime import time, timedelta
from typing import Any, Literal

TierSource = Literal["coach_list", "students_list", "pool"]
TierSide = Literal["same", "other", "any"]
TimingMethod = Literal["fixed", "progressive", "per_tier"]
WaitingList = Literal["coach", "students"]

#: The plan's floor between two sends of the same tier (wave brief §2, clause 3).
MIN_BETWEEN_SENDS = timedelta(minutes=1)


class SettingsError(ValueError):
    """A settings mapping the engine cannot accept; the message names the key."""


@dataclass(frozen=True)
class Tier:
    """One step of the order after the waiting list (plan §5): who is asked, for which side.

    ``source`` is the coach's list, the students' list, or the club's pool of eligible students.
    ``level_offset`` (pool only) is relative to the class: 0 the class level, +1 one level better
    (the level number minus one, since 1 is the best). ``side`` relates the student's natural side
    to the spot's: ``same``, ``other`` (the "lado diferente" groups) or ``any``.
    """

    source: TierSource
    side: TierSide = "same"
    level_offset: int | None = None


@dataclass(frozen=True)
class Timing:
    """How long an invitation counts (plan's T, D16), per method.

    ``fixed``: one T for every tier. ``progressive`` (Method B) and ``per_tier`` (Method C) are
    values of T per tier; ``per_tier[i]`` is tier i's T, ``None`` when unset (then ``inactivity``).
    """

    method: TimingMethod = "fixed"
    inactivity: timedelta = timedelta(minutes=20)
    per_tier: tuple[timedelta | None, ...] = ()


@dataclass(frozen=True)
class FirstInvite:
    days_before: int = 2
    at: time = time(19, 0)


@dataclass(frozen=True)
class AttendanceRequest:
    """The plan's ``attendance_request_at`` (§8 step 3), repeated as the coach sets it."""

    days_before: int = 1
    at: time = time(17, 0)
    every: timedelta = timedelta(hours=2)
    max: int = 3


@dataclass(frozen=True)
class Eligibility:
    """The level gate (plan §3, D13): how many levels better or worse than the class may join."""

    levels_above: int = 2
    levels_below: int = 0


@dataclass(frozen=True)
class EngineSettings:
    invites_per_spot: int = 3                       # X
    max_at_a_time: int = 12                         # M (D16)
    timing: Timing = field(default_factory=Timing)
    first_invite: FirstInvite = field(default_factory=FirstInvite)
    last_invite_before: timedelta = timedelta(hours=2)
    quiet_hours: tuple[time, time] | None = (time(0, 0), time(7, 0))
    attendance_request: AttendanceRequest = field(default_factory=AttendanceRequest)
    absence_cutoff_before: timedelta = timedelta(hours=12)
    eligibility: Eligibility = field(default_factory=Eligibility)
    tiers: tuple[Tier, ...] = (
        Tier("coach_list"),
        Tier("students_list"),
        Tier("pool", "same", 1),
        Tier("pool", "same", 0),
    )
    ordering: tuple[str, ...] = ("participations",)
    # Coach rules the plan is silent on (wave brief §2, clause 3); off unless the coach turns them on.
    auto_entry_before_attendance_request: bool = False
    waiting_list_side_choice: bool = False
    direct_join: bool = False

    def __post_init__(self) -> None:
        if self.invites_per_spot < 1:
            raise SettingsError("invites_per_spot must be at least 1")
        if self.max_at_a_time < 1:
            raise SettingsError("max_at_a_time must be at least 1")
        if self.timing.inactivity < MIN_BETWEEN_SENDS:
            raise SettingsError(f"timing.inactivity must be at least {MIN_BETWEEN_SENDS}")
        if any(t is not None and t < MIN_BETWEEN_SENDS for t in self.timing.per_tier):
            raise SettingsError(f"timing.per_tier values must be at least {MIN_BETWEEN_SENDS}")
        if self.timing.method == "fixed" and self.timing.per_tier:
            raise SettingsError("timing.per_tier needs method progressive or per_tier")
        if len(self.timing.per_tier) > len(self.tiers):
            raise SettingsError("timing.per_tier has more entries than there are tiers")
        if not self.tiers:
            raise SettingsError("tiers must not be empty")
        for i, tier in enumerate(self.tiers):
            if tier.source == "pool" and tier.level_offset is None:
                raise SettingsError(f"tiers[{i}]: a pool tier needs level_offset")
            if tier.source != "pool" and tier.level_offset is not None:
                raise SettingsError(f"tiers[{i}]: only a pool tier takes level_offset")
        if self.attendance_request.max < 0 or self.eligibility.levels_above < 0 or self.eligibility.levels_below < 0:
            raise SettingsError("counts must not be negative")

    def with_changes(self, **changes: Any) -> "EngineSettings":
        """A copy with some fields replaced; validated like a new value."""
        unknown = set(changes) - {f.name for f in dataclasses.fields(self)}
        if unknown:
            raise SettingsError(f"unknown settings: {sorted(unknown)}")
        return dataclasses.replace(self, **changes)

    def inactivity_for(self, tier: int) -> timedelta:
        """T for an invitation sent from ``tier`` (index into ``tiers``)."""
        per = self.timing.per_tier
        if tier < len(per) and per[tier] is not None:
            return per[tier]
        return self.timing.inactivity
