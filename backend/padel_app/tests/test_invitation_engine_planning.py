"""notifications.engine-planning (PAD-906, wave W2): the basic run.

Each test is one acceptance criterion of specflow/impl/notifications/engine-planning.spec.md; the
scenario-pinned criteria of W2 (PLANNING-6, -11, -16) run in the scenario suite.
"""
from datetime import datetime, timedelta

from padel_app.invitation_engine import EngineSettings, MemoryStore
from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.planner import plan
from padel_app.invitation_engine.snapshot import SpotType, Student

T0 = datetime(2026, 11, 1, 19, 0)
START = datetime(2026, 11, 3, 10, 30)


def _student(sid, side, level=3):
    return Student(sid, level, frozenset({"L", "R"}) if side == "both" else frozenset({side}))


def _store(left, right, start=START, pool=()):
    store = MemoryStore()
    for st in pool:
        store.add_student(st)
    store.add_session("A", 3, 8, start, [(_student(f"L-{i}", "L"), "L") for i in range(1, left + 1)]
                      + [(_student(f"R-{i}", "R"), "R") for i in range(1, right + 1)], T0)
    return store


def _invited(effects):
    return sorted(e.student for e in effects if isinstance(e, fx.Invited))


def test_one_invitation_per_student_per_session():
    settings = EngineSettings()
    store = _store(3, 4, pool=[_student("FLEX", "both"), _student("RIGHT", "R"), _student("OLD", "L")])
    left = frozenset({SpotType("L", 3)})
    store.apply([fx.Invited("A", T0, "FLEX", left, None, 3, T0 + timedelta(hours=1)),        # counting
                 fx.Invited("A", T0 - timedelta(hours=2), "OLD", left, None, 3, T0 - timedelta(hours=1))])
    store.apply([fx.Left("A", T0, "R-4", "regular_no")])             # a right spot opens too
    snap = store.snapshot("A")
    assert (len(snap.invitations), snap.placement("R-4")) == (2, None)
    effects = plan(snap, settings, T0 + timedelta(minutes=1)).effects
    # FLEX holds an invitation: no second one, and its {left} offer does not count for the right
    # type, so RIGHT is invited for it. OLD stopped counting: neither a holder nor uninvited.
    assert _invited(effects) == ["RIGHT"]
    store.apply(effects)
    assert [i.student for i in store.snapshot("A").invitations].count("FLEX") == 1


def test_no_invitation_outside_the_window():
    settings = EngineSettings()                                       # first 2 days before 19:00, last 2 h before
    store = _store(4, 3, pool=[_student("RIGHT", "R")])
    snap = store.snapshot("A")
    assert _invited(plan(snap, settings, T0 - timedelta(minutes=1)).effects) == []
    assert _invited(plan(snap, settings, T0).effects) == ["RIGHT"]
    last = datetime(2026, 11, 3, 8, 30)
    assert _invited(plan(snap, settings, last).effects) == ["RIGHT"]
    assert _invited(plan(snap, settings, last + timedelta(minutes=1)).effects) == []
    # Summer: the class time is Lisbon wall-clock (UTC+1), the run's instant UTC.
    summer = _store(4, 3, start=datetime(2026, 7, 3, 10, 30), pool=[_student("RIGHT", "R")]).snapshot("A")
    assert _invited(plan(summer, settings, datetime(2026, 7, 1, 17, 59)).effects) == []
    assert _invited(plan(summer, settings, datetime(2026, 7, 1, 18, 0)).effects) == ["RIGHT"]
    assert _invited(plan(summer, settings, datetime(2026, 7, 3, 7, 30)).effects) == ["RIGHT"]
    assert _invited(plan(summer, settings, datetime(2026, 7, 3, 7, 31)).effects) == []
