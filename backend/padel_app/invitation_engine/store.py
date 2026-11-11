"""Where sessions live between runs. The engine reads snapshots from a store and hands it effects.

``SessionStore`` is the boundary the app will implement over its tables when the engine is
swapped in (out of scope for PAD-899). ``MemoryStore`` keeps everything in memory, for the
scenario harness and unit tests. Applying an effect is bookkeeping only: what the effect says
happened is recorded; no rule is evaluated here.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime
from typing import Iterable, Protocol

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.snapshot import (
    Invitation,
    Placement,
    SessionSnapshot,
    Side,
    Student,
    WaitingListEntry,
)


class SessionStore(Protocol):
    def sessions(self) -> tuple[str, ...]: ...
    def snapshot(self, session: str) -> SessionSnapshot: ...
    def add_session(self, session: str, level: int | None, capacity: int, start: datetime,
                    regulars: Iterable[tuple[Student, Side | None]], at: datetime) -> None: ...
    def reveal(self, student: str) -> None: ...
    def exclude(self, session: str, student: str) -> None: ...
    def apply(self, effects: Iterable[fx.Effect]) -> None: ...


@dataclass
class _Session:
    id: str
    level: int | None
    capacity: int
    start: datetime
    regulars: dict[str, Student]
    going: dict[str, Placement]
    invitations: list[Invitation] = field(default_factory=list)
    waiting_list: list[WaitingListEntry] = field(default_factory=list)
    absent: set[str] = field(default_factory=set)
    said_no: set[str] = field(default_factory=set)
    confirmed: set[str] = field(default_factory=set)
    excluded: set[str] = field(default_factory=set)


class MemoryStore:
    def __init__(self) -> None:
        self._sessions: dict[str, _Session] = {}
        self._students: dict[str, Student] = {}
        self._hidden: set[str] = set()
        self.history: list[fx.Effect] = []

    # --- seeding -------------------------------------------------------------------------

    def add_student(self, student: Student, *, visible: bool = True) -> None:
        self._students[student.id] = student
        if not visible:
            self._hidden.add(student.id)

    def reveal(self, student: str) -> None:
        self._hidden.discard(student)

    def exclude(self, session: str, student: str) -> None:
        """A gate the store decides alone (engine-tiers rule 3): the student leaves the pool."""
        self._sessions[session].excluded.add(student)

    def add_session(self, session: str, level: int | None, capacity: int, start: datetime,
                    regulars: Iterable[tuple[Student, Side | None]], at: datetime) -> None:
        if session in self._sessions:
            raise ValueError(f"session {session} already exists")
        regs: dict[str, Student] = {}
        going: dict[str, Placement] = {}
        for student, side in regulars:
            self._students.setdefault(student.id, student)
            regs[student.id] = student
            going[student.id] = Placement(student.id, side, "regular", at)
        self._sessions[session] = _Session(session, level, capacity, start, regs, going)

    # --- reading -------------------------------------------------------------------------

    def sessions(self) -> tuple[str, ...]:
        return tuple(self._sessions)

    def has_session(self, session: str) -> bool:
        return session in self._sessions

    def snapshot(self, session: str) -> SessionSnapshot:
        s = self._sessions[session]
        inside = set(s.going) | set(s.regulars)
        pool = tuple(st for sid, st in self._students.items()
                     if sid not in inside and sid not in self._hidden and sid not in s.excluded)
        named = {st.id for st in pool} | inside | {i.student for i in s.invitations} | {e.student for e in s.waiting_list}
        return SessionSnapshot(
            id=s.id, level=s.level, capacity=s.capacity, start=s.start,
            regulars=tuple(s.regulars.values()), going=tuple(s.going.values()),
            invitations=tuple(s.invitations), waiting_list=tuple(s.waiting_list), pool=pool,
            absent=frozenset(s.absent), said_no=frozenset(s.said_no), confirmed=frozenset(s.confirmed),
            students={sid: self._students[sid] for sid in named if sid in self._students},
        )

    # --- writing -------------------------------------------------------------------------

    def apply(self, effects: Iterable[fx.Effect]) -> None:
        for e in effects:
            self.history.append(e)
            if isinstance(e, fx.CoachAlert):
                continue
            s = self._sessions[e.session]
            if isinstance(e, fx.Invited):
                s.invitations.append(Invitation(e.student, e.offer, e.side_named, e.tier, e.at,
                                                counts_until=e.counts_until))
            elif isinstance(e, fx.Answered) and e.on == "invitation":
                for i in range(len(s.invitations) - 1, -1, -1):
                    if s.invitations[i].student == e.student and s.invitations[i].open:
                        s.invitations[i] = replace(s.invitations[i], answer=e.answer, answered_at=e.at)
                        break
                if e.answer == "no":
                    s.said_no.add(e.student)
            elif isinstance(e, fx.Answered):
                if e.answer == "yes":
                    s.confirmed.add(e.student)
            elif isinstance(e, fx.Placed):
                s.going[e.student] = Placement(e.student, e.side, e.how, e.at)
                s.absent.discard(e.student)
            elif isinstance(e, fx.SideAssigned):
                s.going[e.student] = replace(s.going[e.student], side=e.side)
            elif isinstance(e, fx.Left):
                s.going.pop(e.student, None)
                if e.reason == "regular_no":
                    s.absent.add(e.student)
            elif isinstance(e, fx.WaitingListJoined):
                s.waiting_list.append(WaitingListEntry(e.student, e.list, e.at, e.side, e.sides))
            elif isinstance(e, fx.WaitingListLeft):
                s.waiting_list = [w for w in s.waiting_list if not (w.student == e.student and w.list == e.list)]
            # Message, AttendanceRequested, Absence, Refused: recorded in history only.
