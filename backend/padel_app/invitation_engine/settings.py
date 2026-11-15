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

from padel_app.invitation_engine.constants import ENGINE_T_FLOOR

TierSource = Literal["coach_list", "students_list", "pool"]
TierSide = Literal["same", "other", "any"]
TimingMethod = Literal["fixed", "progressive", "per_tier"]
InvitationMode = Literal["automatic", "semi_automatic"]
WaitingList = Literal["coach", "students"]
#: The config's timing shapes (``reminderTiming``, PAD-915): N real hours before the class, the class's
#: wall date minus N days at a Lisbon time (both day forms are the same, as in the scheduler), or none.
TimingType = Literal["hours_before", "days_before", "days_before_at_time", "none"]

#: The ordering criteria (engine-tiers rule 8): today's priority criteria and tiebreakers by their
#: stored ids, and ``participations``. Each ranks a tier, lower first; see ``planner._criterion``.
ORDERING_CRITERIA = frozenset({
    "level", "justified_misses", "attendance", "playing_side", "subscription_status",
    "unjustified_absences", "justified_absences", "attendance_rate", "playing_side_match",
    "participations",
})


class SettingsError(ValueError):
    """A settings mapping the engine cannot accept; the message names the key."""


@dataclass(frozen=True)
class GroupRule:
    """One rule of a coach's stored group (engine-tiers rule 13), as stored: ``{attribute, operation,
    value}``. Read as today's vacancy-anchored group rules; see ``planner.group_rule_passes``."""

    attribute: str
    operation: str
    value: object = None


@dataclass(frozen=True)
class Tier:
    """One step of the order after the waiting list (plan §5): who is asked, for which side.

    ``source`` is the coach's list, the students' list, or the club's pool of eligible students.
    ``level_offset`` (pool only) is relative to the class: 0 the class level, +1 one level better
    (the level number minus one, since 1 is the best); ``None`` sets no level. ``side`` relates the
    student's natural side to the spot's: ``same``, ``other`` (the "lado diferente" groups) or
    ``any``. ``rules`` (pool only) are the stored group's rules (engine-tiers rule 13, owner ruling
    D5); none admits every pool student.
    """

    source: TierSource
    side: TierSide = "same"
    level_offset: int | None = None
    rules: tuple[GroupRule, ...] = ()


@dataclass(frozen=True)
class TimingPair:
    """The two values an invitation's T is chosen from at send (engine-timeline rule 4):
    ``between_rounds`` while its tier still has uninvited candidates, ``between_groups`` once not."""

    between_rounds: timedelta = timedelta(minutes=20)
    between_groups: timedelta = timedelta(minutes=20)


@dataclass(frozen=True)
class Timing:
    """How long an invitation counts (plan's T, D16; engine-settings rule 2, ruling D-E6).

    ``fixed`` (Method A, the default): one pair for every tier; both 20 minutes is the plan's single
    T. ``per_tier`` (Method C): ``per_tier[i]`` is tier i's pair, ``None`` for a tier using the fixed
    pair. ``progressive`` (Method B): T is the tier's share of the useful time, computed at send
    (``constants.method_b_share``); the pair is not read.
    """

    method: TimingMethod = "fixed"
    between_rounds: timedelta = timedelta(minutes=20)
    between_groups: timedelta = timedelta(minutes=20)
    per_tier: tuple[TimingPair | None, ...] = ()


@dataclass(frozen=True)
class FirstInvite:
    """When invitations start (``timeline.first_invite_at``): ``days_before`` the class's day at
    ``at`` (the default), ``hours`` real hours before the class (``hours_before``), or, with
    ``none``, from the session's creation."""

    days_before: int = 2
    at: time = time(19, 0)
    type: TimingType = "days_before_at_time"
    hours: int = 24


@dataclass(frozen=True)
class AttendanceRequest:
    """The plan's ``attendance_request_at`` (§8 step 3), repeated as the coach sets it. The first
    request takes the shapes of ``FirstInvite``; with ``none`` it is never sent."""

    days_before: int = 1
    at: time = time(17, 0)
    every: timedelta = timedelta(hours=2)
    max: int = 3
    type: TimingType = "days_before_at_time"
    hours: int = 48


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
    quiet_hours: tuple[time, time] | None = (time(0, 0), time(7, 0))   # start == end: quiet all day; None: never
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
    # Off: only spots a going student freed are filled, never spots no one held (engine-settings
    # rule 11; today's invitation start "none").
    fill_never_held: bool = True
    # Semi-automatic mode holds the engine's sends for the coach (engine-planning rule 14, ruling D2).
    invitation_mode: InvitationMode = "automatic"

    def __post_init__(self) -> None:
        if self.invites_per_spot < 1:
            raise SettingsError("invites_per_spot must be at least 1")
        if self.max_at_a_time < 1:
            raise SettingsError("max_at_a_time must be at least 1")
        values = [("timing.between_rounds", self.timing.between_rounds),
                  ("timing.between_groups", self.timing.between_groups)]
        for i, pair in enumerate(self.timing.per_tier):
            if pair is not None:
                values += [(f"timing.per_tier[{i}].between_rounds", pair.between_rounds),
                           (f"timing.per_tier[{i}].between_groups", pair.between_groups)]
        for name, value in values:
            if value < ENGINE_T_FLOOR:
                raise SettingsError(f"{name} must be at least {ENGINE_T_FLOOR}")
        if self.timing.method != "per_tier" and self.timing.per_tier:
            raise SettingsError("timing.per_tier needs method per_tier")
        if len(self.timing.per_tier) > len(self.tiers):
            raise SettingsError("timing.per_tier has more entries than there are tiers")
        if not self.tiers:
            raise SettingsError("tiers must not be empty")
        if self.invitation_mode not in ("automatic", "semi_automatic"):
            raise SettingsError(f"invitation_mode: unknown {self.invitation_mode!r}")
        for i, tier in enumerate(self.tiers):
            if tier.source != "pool" and tier.level_offset is not None:
                raise SettingsError(f"tiers[{i}]: only a pool tier takes level_offset")
            if tier.source != "pool" and tier.rules:
                raise SettingsError(f"tiers[{i}]: only a pool tier takes group rules")
        unknown = [name for name in self.ordering if name not in ORDERING_CRITERIA]
        if unknown:
            raise SettingsError(f"ordering: unknown criteria {unknown}")
        for name, shape in (("first_invite", self.first_invite), ("attendance_request", self.attendance_request)):
            if shape.type not in ("hours_before", "days_before", "days_before_at_time", "none"):
                raise SettingsError(f"{name}.type: unknown {shape.type!r}")
            if shape.days_before < 0 or shape.hours < 0:
                raise SettingsError(f"{name}: days_before and hours must not be negative")
        if self.attendance_request.max < 0 or self.eligibility.levels_above < 0 or self.eligibility.levels_below < 0:
            raise SettingsError("counts must not be negative")

    def with_changes(self, **changes: Any) -> "EngineSettings":
        """A copy with some fields replaced; validated like a new value."""
        unknown = set(changes) - {f.name for f in dataclasses.fields(self)}
        if unknown:
            raise SettingsError(f"unknown settings: {sorted(unknown)}")
        return dataclasses.replace(self, **changes)

    def timing_for(self, tier: int) -> TimingPair:
        """The pair an invitation from ``tier`` (index into ``tiers``) takes its T from."""
        per = self.timing.per_tier
        if self.timing.method == "per_tier" and tier < len(per) and per[tier] is not None:
            return per[tier]
        return TimingPair(self.timing.between_rounds, self.timing.between_groups)
