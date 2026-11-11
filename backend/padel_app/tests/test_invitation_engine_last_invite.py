"""notifications.engine-timeline rule 6 (PAD-907, wave W7): at ``last_invite_at`` flexible going
students get their final side and are told it; a side over its quota sheds the regular who moved
least recently, ties to the one who joined the class most recently (coordinator ruling (2)).

Scenario pins: TIMELINE-8 to TIMELINE-14 are P18a, P18b, P19, P11a, P13, P12 and P21.
Snapshot fields ``joined_at`` and ``last_moved_at``: proposed to N (W2's owner of snapshot.py).
"""
from datetime import datetime, timedelta

from padel_app.invitation_engine import EngineSettings
from padel_app.invitation_engine.effects import Message, SideAssigned
from padel_app.invitation_engine.snapshot import Placement, SessionSnapshot, Student
from padel_app.invitation_engine.timeline import due

START = datetime(2026, 11, 3, 10, 30)               # Lisbon wall-clock; UTC+0 in November
LAST = datetime(2026, 11, 3, 8, 30)                 # last_invite_at, 2 h before, naive UTC
JOIN = datetime(2026, 9, 1, 12, 0)


def _session(capacity, going, joined_order, moved=None):
    """``going``: (id, sides, placed side, how). Regulars joined in ``joined_order``, a day apart."""
    students = {sid: Student(sid, 3, frozenset(sides)) for sid, sides, _, _ in going}
    regulars = tuple(students[sid] for sid, _, _, how in going if how == "regular")
    return SessionSnapshot(
        "S", 3, capacity, START, regulars=regulars,
        going=tuple(Placement(sid, side, how, JOIN) for sid, _, side, how in going),
        students=students,
        joined_at={sid: JOIN + timedelta(days=i) for i, sid in enumerate(joined_order)},
        last_moved_at=moved or {},
    )


def _moves(effects):
    sides = {e.student: e.side for e in effects if isinstance(e, SideAssigned)}
    told = {e.student for e in effects if isinstance(e, Message) and e.kind == "side_moved"}
    return sides, told


def test_nothing_is_due_before_last_invite_at():
    s = _session(8, [("L1", "L", "L", "regular")] + [(f"R{i}", "R", "R", "regular") for i in range(1, 6)]
                 + [("x", "L", "L", "invitation"), ("y", "L", "L", "invitation")],
                 ["L1", "R1", "R2", "R3", "R4", "R5"])
    assert due(s, EngineSettings(), LAST - timedelta(minutes=1)) == ()


def test_the_regular_who_joined_most_recently_moves_on_a_tie():
    # S18 / TIMELINE-8: 1 L and 5 R regulars, 2 left-siders placed; nobody ever moved; R5 joined last.
    s = _session(8, [("L1", "L", "L", "regular")] + [(f"R{i}", "R", "R", "regular") for i in range(1, 6)]
                 + [("x", "L", "L", "invitation"), ("y", "L", "L", "invitation")],
                 ["L1", "R1", "R2", "R3", "R4", "R5"])
    assert _moves(due(s, EngineSettings(), LAST)) == ({"R5": "L"}, {"R5"})


def test_the_regular_who_moved_least_recently_goes_first():
    s = _session(8, [("L1", "L", "L", "regular")] + [(f"R{i}", "R", "R", "regular") for i in range(1, 6)]
                 + [("x", "L", "L", "invitation"), ("y", "L", "L", "invitation")],
                 ["L1", "R1", "R2", "R3", "R4", "R5"],
                 moved={"R5": datetime(2026, 10, 27, 8, 30), "R4": datetime(2026, 10, 20, 8, 30)})
    # R1-R3 never moved, so they come before R4 and R5; among them R3 joined most recently.
    assert _moves(due(s, EngineSettings(), LAST)) == ({"R3": "L"}, {"R3"})


def test_nobody_moves_when_no_side_is_over_quota():
    # S18 branch b / TIMELINE-9: a right regular said No, so 1 L and 4 R remain.
    s = _session(8, [("L1", "L", "L", "regular")] + [(f"R{i}", "R", "R", "regular") for i in range(2, 6)],
                 ["L1", "R2", "R3", "R4", "R5"])
    assert due(s, EngineSettings(), LAST) == ()


def test_flexible_regulars_and_an_over_quota_regular_balance_the_sides():
    # S19 / TIMELINE-10: 1 L, 5 R and 1 {L, R} regular, one left-sider placed: B and R5 play left.
    s = _session(8, [("L1", "L", "L", "regular"), ("B1", "LR", None, "regular")]
                 + [(f"R{i}", "R", "R", "regular") for i in range(1, 6)] + [("x", "L", "L", "invitation")],
                 ["L1", "B1", "R1", "R2", "R3", "R4", "R5"])
    assert _moves(due(s, EngineSettings(), LAST)) == ({"B1": "L", "R5": "L"}, {"B1", "R5"})


def test_a_both_regular_takes_the_side_left_open():
    # S11 / TIMELINE-11: 3 L, 3 R and 1 {L, R} regular, one right-sider placed: B plays left.
    s = _session(8, [(f"L{i}", "L", "L", "regular") for i in range(1, 4)]
                 + [(f"R{i}", "R", "R", "regular") for i in range(1, 4)]
                 + [("B1", "LR", None, "regular"), ("r", "R", "R", "invitation")],
                 ["L1", "L2", "L3", "R1", "R2", "R3", "B1"])
    assert _moves(due(s, EngineSettings(), LAST)) == ({"B1": "L"}, {"B1"})


def test_several_both_regulars_split_to_fill_both_sides():
    # S12 / TIMELINE-13: 2 L, 2 R, 3 {L, R} and a left-sider placed: 1 B left, 2 B right, all told.
    s = _session(8, [("L1", "L", "L", "regular"), ("L2", "L", "L", "regular"),
                     ("R1", "R", "R", "regular"), ("R2", "R", "R", "regular"),
                     ("B1", "LR", None, "regular"), ("B2", "LR", None, "regular"), ("B3", "LR", None, "regular"),
                     ("l", "L", "L", "invitation")],
                 ["L1", "L2", "R1", "R2", "B1", "B2", "B3"])
    sides, told = _moves(due(s, EngineSettings(), LAST))
    assert sorted(sides.values()) == ["L", "R", "R"] and told == {"B1", "B2", "B3"}


def test_last_invite_at_is_done_once():
    # Applying the moves leaves nothing over quota and nobody unplaced, so a later tick is quiet.
    s = _session(8, [("L1", "L", "L", "regular"), ("R5", "R", "L", "regular")]
                 + [(f"R{i}", "R", "R", "regular") for i in range(1, 5)]
                 + [("x", "L", "L", "invitation"), ("y", "L", "L", "invitation")],
                 ["L1", "R1", "R2", "R3", "R4", "R5"], moved={"R5": LAST})
    assert due(s, EngineSettings(), LAST + timedelta(minutes=1)) == ()
