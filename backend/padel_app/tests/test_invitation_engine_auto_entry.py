"""notifications.engine-settings rule 3 (PAD-908, wave W8): with ``auto-entry`` on, a waiting-list
member is placed in an open spot they can take before ``attendance_request_at`` and told so; from
then on they are invited as group 0. Scenario pins: SETTINGS-6 is 23, SETTINGS-7 is 26.
"""
from datetime import datetime

from padel_app.invitation_engine import EngineSettings
from padel_app.invitation_engine.effects import Message, Placed, WaitingListLeft
from padel_app.invitation_engine.planner import auto_entries
from padel_app.invitation_engine.snapshot import Placement, SessionSnapshot, Student, WaitingListEntry

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
