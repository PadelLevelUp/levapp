"""notifications.engine-planning rule 15 (PLANNING-48): a plan's pool reads grow at most linearly with the pool.

The engine review found ``passes`` asking "is this student in the pool?" by scanning the whole pool, once per
student, tier and spot type: a run's work grew with the square of the roster. This counts the students read
from the pool during one plan (not wall time, so it cannot flake) at two pool sizes.
"""
from dataclasses import replace
from datetime import datetime

import pytest

from padel_app.invitation_engine import EngineSettings, MemoryStore
from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.planner import plan
from padel_app.invitation_engine.snapshot import Student

T0 = datetime(2026, 11, 1, 19, 0)
START = datetime(2026, 11, 3, 10, 30)


class _CountingPool(tuple):
    """The snapshot's pool, counting every student read from it."""

    reads = 0

    def __iter__(self):
        for student in super().__iter__():
            type(self).reads += 1
            yield student


def _snapshot(size):
    sides = (frozenset({"L"}), frozenset({"R"}), frozenset({"L", "R"}))
    store = MemoryStore()
    for n in range(size):
        store.add_student(Student(f"P-{n:03d}", 2 + (n // 3) % 3, sides[n % 3]))
    store.add_session("A", 3, 8, START, [(Student(f"L-{i}", 3, frozenset({"L"})), "L") for i in (1, 2)]
                      + [(Student(f"R-{i}", 3, frozenset({"R"})), "R") for i in (1, 2)], T0)
    return store.snapshot("A")


def _plan(size):
    snap = _snapshot(size)
    _CountingPool.reads = 0
    effects = plan(replace(snap, pool=_CountingPool(snap.pool)), EngineSettings(), T0).effects
    return _CountingPool.reads, sorted(e.student for e in effects if isinstance(e, fx.Invited))


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-48")
def test_a_plans_pool_reads_grow_linearly_with_the_pool():
    small, invited_small = _plan(50)
    large, invited_large = _plan(200)
    assert large <= 6 * small, (small, large)           # linear is 4x; the old scan was ~16x
    # Behaviour unchanged: the plan before the change invited exactly these (recorded on origin/staging).
    assert (invited_small, invited_large) == (INVITED_50, INVITED_200)


INVITED_50 = ['P-000', 'P-001', 'P-002', 'P-009', 'P-010', 'P-011', 'P-018', 'P-019', 'P-020', 'P-028', 'P-029', 'P-037']
INVITED_200 = INVITED_50
