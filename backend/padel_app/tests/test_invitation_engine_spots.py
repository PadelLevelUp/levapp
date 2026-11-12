"""notifications.engine-spots (PAD-906, wave W1): what a session needs, counted from scratch.

Each test is one acceptance criterion of specflow/impl/notifications/engine-spots.spec.md.
"""
from datetime import datetime

import pytest

from padel_app.invitation_engine.planner import side_admits, spot_counts, spot_types
from padel_app.invitation_engine.snapshot import Placement, SessionSnapshot, SpotType, Student

AT = datetime(2026, 11, 1, 19, 0)


def _snapshot(left=0, right=0, both=0, capacity=8, level=3):
    going = ([Placement(f"L-{i}", "L", "regular", AT) for i in range(1, left + 1)]
             + [Placement(f"R-{i}", "R", "regular", AT) for i in range(1, right + 1)]
             + [Placement(f"B-{i}", None, "regular", AT) for i in range(1, both + 1)])
    return SessionSnapshot("A", level, capacity, datetime(2026, 11, 3, 10, 30), regulars=(), going=tuple(going))


def _counts(**kw):
    c = spot_counts(_snapshot(**kw))
    return c, (c.class_empty, c.open["L"], c.open["R"], c.must["L"], c.must["R"], c.either)


def test_one_side_full_makes_every_spot_must_of_the_other():
    c, numbers = _counts(left=4)
    assert numbers == (4, 0, 4, 0, 4, 0)
    assert spot_types(_snapshot(left=4)) == ((SpotType("R", 3), 4),)


def test_unplaced_flexible_regular_makes_one_either_spot():
    c, numbers = _counts(left=2, right=3, both=1)
    assert numbers == (2, 2, 1, 1, 0, 1)
    assert c.flexible_unplaced == ("B-1",)
    assert spot_types(_snapshot(left=2, right=3, both=1)) == ((SpotType("L", 3), 1), (SpotType(None, 3), 1))


def test_open_sum_is_class_empty_plus_flexible():
    c, numbers = _counts(left=2, right=2, both=3)
    assert (numbers[0], numbers[1], numbers[2], numbers[5]) == (1, 2, 2, 1)
    assert c.open["L"] + c.open["R"] == c.class_empty + 3 == c.class_empty + c.flexible_going


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-SPOTS-4")
def test_side_over_quota_keeps_the_extra_regular_on_their_side():
    """engine-spots rules 6 and 9 (the owner's decisions 12, 13): a one-sided regular above their side's
    quota is counted under it, never flexible."""
    c, numbers = _counts(left=1, right=5)
    assert (numbers[3], numbers[2], numbers[5]) == (2, 0, 0)          # must(L) 2, open(R) 0, either 0
    assert c.over_quota == {"L": 0, "R": 1} and c.flexible_going == 0
    assert c.open["L"] + c.open["R"] == c.class_empty + c.flexible_going + sum(c.over_quota.values())


def test_either_spot_side_rules():
    c = spot_counts(_snapshot(left=2, right=2, both=3))
    either = SpotType(None, 3)
    assert c.either == 1 and spot_types(_snapshot(left=2, right=2, both=3)) == ((either, 1),)
    left, right, flexible = (Student("l", 3, frozenset({"L"})), Student("r", 3, frozenset({"R"})),
                             Student("b", 3, frozenset({"L", "R"})))
    for student in (left, right, flexible):
        assert side_admits("same", either, student.sides, c), student.id
        assert not side_admits("other", either, student.sides, c), student.id
    # A must(R) spot, for contrast: "other" admits exactly the subset that lacks R.
    must_r = SpotType("R", 3)
    assert [side_admits("other", must_r, s.sides, c) for s in (left, right, flexible)] == [True, False, False]
