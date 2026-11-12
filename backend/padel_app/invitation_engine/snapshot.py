"""What the engine knows about one session at an instant (plan §2, §4): the input of every rule.

A snapshot is immutable and complete: a rule reads the snapshot, the settings and ``now``, and
nothing else (no database, no wall clock). The store builds snapshots; the engine never mutates
them.

Clocks (R-023): ``SessionSnapshot.start`` is Lisbon wall-clock, as the app stores a class time;
every event instant (``sent_at``, ``placed_at``, ``joined_at``, a rule's ``now``) is naive UTC.
Sides are ``"L"`` and ``"R"``; a student holds a non-empty subset of them (D18).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

Side = Literal["L", "R"]
SIDES: tuple[Side, Side] = ("L", "R")
PlacedHow = Literal["regular", "invitation", "direct", "auto_from_waiting_list", "regular_returns"]
WaitingListSides = Literal["own", "other", "both"]


@dataclass(frozen=True)
class Student:
    """A club student as the engine sees them: level (1 the best; ``None`` unknown), the sides
    they play (D18), and the coach's ordering data."""

    id: str
    level: int | None
    sides: frozenset[str]
    participations: int = 0
    # The coach's ordering data (engine-tiers rule 8), this coach's figures; the store fills them.
    makeups_owed: int = 0
    attendance_rate: float = 0.0
    unjustified_absences: int = 0
    justified_absences: int = 0
    active: bool = True
    # The account's subscription status (``User.status``), read by a group's ``subscription_status``
    # rule (engine-tiers rule 13).
    subscription_status: str | None = None

    def __post_init__(self) -> None:
        if not self.sides or not self.sides <= set(SIDES):
            raise ValueError(f"{self.id}: sides must be a non-empty subset of {SIDES}")


@dataclass(frozen=True)
class SpotType:
    """What an open spot needs (D2): a side, or ``None`` for an either-side spot, at the class's
    level (D3; ``None`` when the class has no level)."""

    side: Side | None
    level: int | None


@dataclass(frozen=True)
class Placement:
    """A student going to the session. ``side`` is ``None`` while a flexible student is unplaced
    (plan §4: a {L, R} regular counts under neither side until ``last_invite_at``)."""

    student: str
    side: Side | None
    how: PlacedHow
    at: datetime


@dataclass(frozen=True)
class Invitation:
    """One invitation per student per session (D1). ``offer`` is the spot types it was sent for
    (D20); ``side_named`` is the side the message names, ``None`` when it names none (D11);
    ``tier`` is the index into ``EngineSettings.tiers`` it was sent from; ``counts_until`` is the
    instant it stops counting (fixed at send, engine-timeline rule 4), after which it stays open (D4)."""

    student: str
    offer: frozenset[SpotType]
    side_named: Side | None
    tier: int | None
    sent_at: datetime
    answer: Literal["yes", "no"] | None = None
    answered_at: datetime | None = None
    counts_until: datetime | None = None
    sorry_at: datetime | None = None                  # a Yes got "sorry": open, not counting, re-offerable
    closed_at: datetime | None = None                 # closed by a same-hour placement (engine-answers rule 10)

    @property
    def open(self) -> bool:
        return self.answer is None and self.closed_at is None


@dataclass(frozen=True)
class Elsewhere:
    """An open invitation the student holds for another session the same club day, as the store
    sees it: that session's start, capacity and who is going there. The planner decides from it who is
    postponed (engine-tiers rule 10) and the answers which invitations a placement closes
    (engine-answers rule 10)."""

    session: str
    start: datetime                                   # Lisbon wall-clock
    invitation: Invitation
    capacity: int
    going: tuple[Placement, ...]


@dataclass(frozen=True)
class WaitingListEntry:
    """A student on one of the session's two lists (plan §5 group 0, Q7: coach's list first).

    The coach's list carries the side the coach chose (``side``); the students' list carries the
    student's choice relative to their own side (``sides``)."""

    student: str
    list: Literal["coach", "students"]
    joined_at: datetime
    side: Side | None = None
    sides: WaitingListSides | None = None


@dataclass(frozen=True)
class SessionSnapshot:
    id: str
    level: int | None
    capacity: int
    start: datetime                                   # Lisbon wall-clock
    regulars: tuple[Student, ...]                     # enrolled students, going or not
    going: tuple[Placement, ...]                      # everyone going now, regulars included
    invitations: tuple[Invitation, ...] = ()
    waiting_list: tuple[WaitingListEntry, ...] = ()
    pool: tuple[Student, ...] = ()                    # visible club students not in the session
    absent: frozenset[str] = frozenset()              # regulars who said they are not going
    said_no: frozenset[str] = frozenset()             # answered No for this session (a gate, plan §3)
    busy_same_time: frozenset[str] = frozenset()      # going to another session at the same time (a gate)
    postponed: frozenset[str] = frozenset()           # holding a counting offer elsewhere that day (D15): set per run
    elsewhere: tuple[Elsewhere, ...] = ()             # open invitations for other sessions the same club day
    confirmed: frozenset[str] = frozenset()           # answered Yes to an attendance request
    alerted: dict[SpotType, int] = field(default_factory=dict)  # coach alerts raised: type -> its spots then
    students: dict[str, Student] = field(default_factory=dict)  # every student the snapshot names
    # Per regular, naive UTC (engine-timeline rule 6, ruling (2)): when they joined the class, and the
    # last time the engine moved their side; a missing key in ``last_moved_at`` means never moved.
    joined_at: dict[str, datetime] = field(default_factory=dict)
    last_moved_at: dict[str, datetime] = field(default_factory=dict)
    # Per student, naive UTC: when each attendance request went out (engine-timeline rule 2), so
    # ``messages.due`` sends each one once.
    attendance_requested: dict[str, tuple[datetime, ...]] = field(default_factory=dict)

    def placement(self, student: str) -> Placement | None:
        return next((p for p in self.going if p.student == student), None)

    def invitation(self, student: str) -> Invitation | None:
        """The student's latest invitation (a waiting-list re-invitation follows an earlier one)."""
        return next((i for i in reversed(self.invitations) if i.student == student), None)

    @property
    def open_invitations(self) -> tuple[Invitation, ...]:
        return tuple(i for i in self.invitations if i.open)
