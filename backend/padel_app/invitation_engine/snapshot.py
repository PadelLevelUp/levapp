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
    ``tier`` is the index into ``EngineSettings.tiers`` it was sent from."""

    student: str
    offer: frozenset[SpotType]
    side_named: Side | None
    tier: int | None
    sent_at: datetime
    answer: Literal["yes", "no"] | None = None
    answered_at: datetime | None = None

    @property
    def open(self) -> bool:
        return self.answer is None


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
    confirmed: frozenset[str] = frozenset()           # answered Yes to an attendance request
    students: dict[str, Student] = field(default_factory=dict)  # every student the snapshot names

    def placement(self, student: str) -> Placement | None:
        return next((p for p in self.going if p.student == student), None)

    def invitation(self, student: str) -> Invitation | None:
        """The student's latest invitation (a waiting-list re-invitation follows an earlier one)."""
        return next((i for i in reversed(self.invitations) if i.student == student), None)

    @property
    def open_invitations(self) -> tuple[Invitation, ...]:
        return tuple(i for i in self.invitations if i.open)
