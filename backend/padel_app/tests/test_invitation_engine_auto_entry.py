"""notifications.engine-settings rule 3 (PAD-908, wave W8): with ``auto-entry`` on, a waiting-list
member is placed in an open spot they can take before ``attendance_request_at`` and told so; from
then on they are invited as group 0. Scenario pins: SETTINGS-6 is 23, SETTINGS-7 is 26.
"""
from dataclasses import replace
from datetime import datetime

from padel_app.invitation_engine import EngineSettings
from padel_app.invitation_engine.effects import InvitationClosed, Message, Placed, WaitingListLeft
from padel_app.invitation_engine.planner import auto_entries
from padel_app.invitation_engine.snapshot import (
    Elsewhere,
    Invitation,
    Placement,
    SessionSnapshot,
    SpotType,
    Student,
    WaitingListEntry,
)

START = datetime(2026, 11, 3, 10, 30)                # attendance request: 2 Nov 17:00 (UTC+0 in November)
ON = EngineSettings(auto_entry_before_attendance_request=True)


def _session(waiting_list, students):
    regulars = [Student(f"L{i}", 3, frozenset("L")) for i in range(4)] + [Student(f"R{i}", 3, frozenset("R"))
                                                                          for i in range(3)]
    going = tuple(Placement(s.id, next(iter(s.sides)), "regular", START) for s in regulars)
    pool = tuple(students)
    return SessionSnapshot("S", 3, 8, START, regulars=tuple(regulars), going=going, pool=pool,
                           waiting_list=tuple(waiting_list), students={s.id: s for s in regulars + list(pool)})


def test_before_the_attendance_request_a_waiting_list_member_is_placed_and_told():
    w1, w2 = Student("W1", 3, frozenset("R")), Student("W2", 3, frozenset("R"))
    s = _session([WaitingListEntry("W2", "students", datetime(2026, 11, 1, 9, 0), sides="own"),
                  WaitingListEntry("W1", "coach", datetime(2026, 11, 1, 10, 0), side="R")], [w1, w2])
    effects = auto_entries(s, ON, datetime(2026, 11, 2, 16, 59))
    # The coach's list goes first, whatever the join times (Q7).
    assert [(e.student, e.side, e.how) for e in effects if isinstance(e, Placed)] == [("W1", "R", "auto_from_waiting_list")]
    assert [(e.student, e.kind) for e in effects if isinstance(e, Message)] == [("W1", "added")]
    assert [e.student for e in effects if isinstance(e, WaitingListLeft)] == ["W1"]


def test_from_the_attendance_request_on_nobody_is_placed_automatically():
    w1 = Student("W1", 3, frozenset("R"))
    s = _session([WaitingListEntry("W1", "coach", datetime(2026, 11, 1, 10, 0), side="R")], [w1])
    assert auto_entries(s, ON, datetime(2026, 11, 2, 17, 0)) == ()
    assert auto_entries(s, EngineSettings(), datetime(2026, 11, 2, 9, 0)) == ()      # the setting off


def test_a_side_they_cannot_take_places_nobody():
    s1 = Student("S1", 3, frozenset("L"))
    s = _session([WaitingListEntry("S1", "students", datetime(2026, 11, 1, 9, 0), sides="own")], [s1])
    assert auto_entries(s, ON, datetime(2026, 11, 2, 9, 0)) == ()                  # only the right is open
    both = _session([WaitingListEntry("S1", "students", datetime(2026, 11, 1, 9, 0), sides="both")], [s1])
    assert [(e.student, e.side) for e in auto_entries(both, ON, datetime(2026, 11, 2, 9, 0))
            if isinstance(e, Placed)] == [("S1", "R")]


def test_auto_entry_closes_the_same_hour_invitation():
    """engine-answers rule 10, ANSWERS-15: placed by automatic entry, W1's invitation to the session at
    the same start closes."""
    w1 = Student("W1", 3, frozenset("R"))
    offer = Invitation("W1", frozenset({SpotType("R", 3)}), None, 2, datetime(2026, 11, 1, 19, 0))
    s = replace(_session([WaitingListEntry("W1", "coach", datetime(2026, 11, 1, 10, 0), side="R")], [w1]),
                elsewhere=(Elsewhere("B", START, offer, 16, ()),))
    effects = auto_entries(s, ON, datetime(2026, 11, 2, 9, 0))
    assert [e.student for e in effects if isinstance(e, Placed)] == ["W1"]
    assert [(e.session, e.student) for e in effects if isinstance(e, InvitationClosed)] == [("B", "W1")]


def test_auto_entry_skips_a_student_busy_at_that_hour():
    """engine-answers rule 10, ANSWERS-17: going elsewhere at the same start, from either list."""
    w1, w2 = Student("W1", 3, frozenset("R")), Student("W2", 3, frozenset("R"))
    s = _session([WaitingListEntry("W1", "coach", datetime(2026, 11, 1, 10, 0), side="R"),
                  WaitingListEntry("W2", "students", datetime(2026, 11, 1, 9, 0), sides="own")], [w1, w2])
    busy = replace(s, busy_same_time=frozenset({"W1", "W2"}))
    assert auto_entries(busy, ON, datetime(2026, 11, 2, 9, 0)) == ()
