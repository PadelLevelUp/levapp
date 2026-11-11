"""What the engine does, as records (plan §4-§8; harness design §5).

Every rule returns effects; the store applies them and the caller reads them. They are the
engine's whole observable output, so a test or an adapter never reads internal state to learn
what happened. ``at`` is naive UTC (R-023).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from padel_app.invitation_engine.snapshot import PlacedHow, Side, SpotType, WaitingListSides

MessageKind = Literal["sorry", "reoffer", "added", "waiting_list_offer", "side_moved"]
AbsenceKind = Literal["justified", "unjustified", "none"]
LeftReason = Literal["regular_no", "cancel", "no_show"]


@dataclass(frozen=True)
class Effect:
    session: str
    at: datetime


@dataclass(frozen=True)
class Invited(Effect):
    """``counts_until`` is the instant it stops counting, fixed at send (engine-timeline rule 4)."""

    student: str
    offer: frozenset[SpotType]
    side_named: Side | None
    tier: int | None
    counts_until: datetime | None = None


@dataclass(frozen=True)
class Answered(Effect):
    student: str
    answer: Literal["yes", "no"]
    on: Literal["invitation", "attendance_request"]


@dataclass(frozen=True)
class Placed(Effect):
    student: str
    side: Side | None
    how: PlacedHow


@dataclass(frozen=True)
class SideAssigned(Effect):
    """A going student's side is fixed or moved (plan §8 step 6, flexible students)."""

    student: str
    side: Side


@dataclass(frozen=True)
class Left(Effect):
    student: str
    reason: LeftReason


@dataclass(frozen=True)
class Message(Effect):
    """``sorry``: Yes with no room (D4); ``reoffer``: the same invitation offered again, for another
    spot (Q6) or after a "sorry" when a spot reopens; ``added``: automatic entry;
    ``waiting_list_offer``: the waiting-list invitation; ``side_moved``: a going student told their
    side was moved at ``last_invite_at`` (plan §4, §8 step 6)."""

    student: str
    kind: MessageKind


@dataclass(frozen=True)
class AttendanceRequested(Effect):
    """A reminder: the plan's attendance request (§8 step 3) sent to one student."""

    student: str


@dataclass(frozen=True)
class Absence(Effect):
    student: str
    kind: AbsenceKind


@dataclass(frozen=True)
class Refused(Effect):
    student: str
    action: Literal["direct_join", "waiting_list"]
    reason: str


@dataclass(frozen=True)
class WaitingListJoined(Effect):
    student: str
    list: Literal["coach", "students"]
    side: Side | None = None
    sides: WaitingListSides | None = None


@dataclass(frozen=True)
class WaitingListLeft(Effect):
    student: str
    list: Literal["coach", "students"]


@dataclass(frozen=True)
class CoachAlert(Effect):
    """No tier can take an open spot of ``spot_type`` (plan §6 step 4, engine-planning rule 11);
    ``spots`` is how many of that type were uncovered, so the store alerts again only when it changes."""

    reason: str
    spot_type: SpotType | None = None
    spots: int = 0
