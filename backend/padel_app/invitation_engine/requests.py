"""What can happen to a session from outside the engine: answers and the coach's actions.

``Engine.handle`` takes one request; ``answers.handle`` decides the student-facing ones. The
names follow the plan (§7, §8); the scenario harness maps its events onto them.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Mapping

from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.snapshot import Side, Student, WaitingListSides


@dataclass(frozen=True)
class Answer:
    """Yes or No to the student's open invitation (plan §7)."""

    student: str
    yes: bool


@dataclass(frozen=True)
class DirectJoin:
    student: str
    side: Side | None = None


@dataclass(frozen=True)
class JoinWaitingList:
    """The coach adds a student with a side (``list="coach"``), or a student joins with their
    own/other/both choice (``list="students"``)."""

    student: str
    list: Literal["coach", "students"]
    side: Side | None = None
    sides: WaitingListSides | None = None


@dataclass(frozen=True)
class LeaveWaitingList:
    student: str
    list: Literal["coach", "students"]


@dataclass(frozen=True)
class RegularAbsent:
    """A regular says they are not going (plan §8 step 4)."""

    student: str


@dataclass(frozen=True)
class RegularReturns:
    student: str


@dataclass(frozen=True)
class Cancel:
    """A placed non-regular is not going after all (plan §7, "cancels after accepting")."""

    student: str


@dataclass(frozen=True)
class NoShow:
    student: str


@dataclass(frozen=True)
class ConfirmAttendance:
    """A Yes to the attendance request; ``student=None`` is every regular still going."""

    student: str | None


@dataclass(frozen=True)
class CreateSession:
    """The session comes into existence now (a class created inside the invitation window)."""

    level: int | None
    capacity: int
    start: datetime                                   # Lisbon wall-clock
    regulars: tuple[tuple[Student, Side | None], ...]
    joined_at: Mapping[str, datetime] | None = None   # per regular, naive UTC; absent: the creation instant
    end: datetime | None = None                       # Lisbon wall-clock; absent: an hour after start


@dataclass(frozen=True)
class CoachExcludes:
    """The coach excludes a student from this session's automatic invitations (a gate, D13;
    engine-tiers rule 3): from now on the student is not in the session's pool."""

    student: str


@dataclass(frozen=True)
class CoachAdded:
    """The coach added the student to this session outside the engine (the app wrote the enrolment):
    their open invitations at the same time close, as for an engine placement (engine-answers rule
    10). The engine writes no placement."""

    student: str


@dataclass(frozen=True)
class Appear:
    """A club student becomes visible and eligible from now (plan D8)."""

    student: str


@dataclass(frozen=True)
class UpdateSettings:
    """A coach changed their settings: the sessions to re-plan are that coach's (``sessions``, the
    app names them); ``None`` re-plans every session (the harness, one coach). With a settings lookup
    the engine only re-plans; with one value it also replaces it (engine-settings rule 9)."""

    settings: EngineSettings
    sessions: tuple[str, ...] | None = None


@dataclass(frozen=True)
class ApproveGroup:
    """The coach approves the group of approval request ``request`` (its id), without ``removed``
    (engine-planning rule 14). An answer to a request that is no longer pending decides nothing."""

    request: str
    removed: frozenset[str] = frozenset()


@dataclass(frozen=True)
class DismissGroup:
    """The coach dismisses the group of approval request ``request`` ("Ignorar", engine-planning rule 14)."""

    request: str


@dataclass(frozen=True)
class ReopenGroup:
    """The coach reopens dismissed group ``tier`` from the class (engine-planning rule 14)."""

    tier: int


COACH_QUEUE_REQUESTS = (ApproveGroup, DismissGroup, ReopenGroup)

Request = (Answer | DirectJoin | JoinWaitingList | LeaveWaitingList | RegularAbsent | RegularReturns | Cancel
           | NoShow | ConfirmAttendance | CreateSession | CoachExcludes | CoachAdded | Appear | UpdateSettings
           | ApproveGroup | DismissGroup | ReopenGroup)
STUDENT_REQUESTS = (Answer, DirectJoin, JoinWaitingList, LeaveWaitingList, RegularAbsent, RegularReturns, Cancel,
                    NoShow, ConfirmAttendance)
