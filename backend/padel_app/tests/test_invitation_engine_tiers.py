"""notifications.engine-tiers (PAD-906, wave W2): who may be asked for each spot type, and in what order.

Each test is one acceptance criterion of specflow/impl/notifications/engine-tiers.spec.md.
"""
from datetime import datetime, timedelta

from padel_app.invitation_engine import Engine, EngineSettings, MemoryStore
from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.planner import plan, spot_counts, tier_for
from padel_app.invitation_engine.settings import Tier
from padel_app.invitation_engine.snapshot import SpotType, Student

T0 = datetime(2026, 11, 1, 19, 0)            # naive UTC, the base profile's first invitation
START = datetime(2026, 11, 3, 10, 30)        # Lisbon wall-clock


def _student(sid, side, level=3, participations=0):
    return Student(sid, level, frozenset({"L", "R"}) if side == "both" else frozenset({side}), participations)


def _regulars(left, right):
    return [(_student(f"L-{i}", "L"), "L") for i in range(1, left + 1)] + \
           [(_student(f"R-{i}", "R"), "R") for i in range(1, right + 1)]


def _invited(effects):
    return [e.student for e in effects if isinstance(e, fx.Invited)]


def test_tier_is_first_tier_passed_per_spot_type():
    settings = EngineSettings(tiers=(Tier("coach_list"), Tier("students_list"), Tier("pool", "same", 0),
                                     Tier("pool", "any", 0)))
    store = MemoryStore()
    student = _student("S", "L")
    store.add_student(student)
    store.add_session("A", 3, 8, START, _regulars(3, 3), T0)          # one left and one right spot
    snap = store.snapshot("A")
    counts = spot_counts(snap)
    assert (counts.must["L"], counts.must["R"]) == (1, 1)
    assert tier_for(student, SpotType("L", 3), counts, snap, settings) == 2
    assert tier_for(student, SpotType("R", 3), counts, snap, settings) == 3


def test_gates_hold_on_automatic_tiers():
    settings = EngineSettings()
    store = MemoryStore()
    for sid in ("EXCLUDED", "BUSY", "SAID_NO"):
        store.add_student(_student(sid, "R"))
    store.add_session("A", 3, 8, START, _regulars(4, 3), T0)          # one right spot
    store.add_session("B", 3, 8, START, [(_student("BUSY", "R"), "R")], T0)   # same time, BUSY going
    engine = Engine(store, settings)
    store.apply([fx.WaitingListJoined("A", T0 - timedelta(hours=1), sid, "students", sides="both")
                 for sid in ("EXCLUDED", "BUSY", "SAID_NO")])
    store.exclude("A", "EXCLUDED")
    store.apply([fx.Answered("A", T0, "SAID_NO", "no", "invitation")])
    snap = store.snapshot("A")
    assert "BUSY" in snap.busy_same_time and "SAID_NO" in snap.said_no
    assert "EXCLUDED" not in {s.id for s in snap.pool}
    assert len(snap.waiting_list) == 3, "the three students are on the students' list"
    # tick runs every session; B is open to them (its gates are its own), A is not.
    assert _invited([e for e in engine.tick(T0) if e.session == "A"]) == []
    # Control: without the gates, the same list is invited.
    store.add_student(_student("FREE", "R"))
    store.apply([fx.WaitingListJoined("A", T0, "FREE", "students", sides="both")])
    assert _invited(plan(store.snapshot("A"), settings, T0).effects) == ["FREE"]


def test_join_time_breaks_only_criteria_ties():
    settings = EngineSettings(invites_per_spot=1)

    def invited(early_participations, late_participations):
        store = MemoryStore()
        store.add_student(_student("EARLY", "R", participations=early_participations))
        store.add_student(_student("LATE", "R", participations=late_participations))
        store.add_session("A", 3, 8, START, _regulars(4, 3), T0)
        store.apply([fx.WaitingListJoined("A", datetime(2026, 11, 1, 11, 0), "LATE", "students", sides="both"),
                     fx.WaitingListJoined("A", datetime(2026, 11, 1, 10, 0), "EARLY", "students", sides="both")])
        return _invited(plan(store.snapshot("A"), settings, T0).effects)

    assert invited(0, 0) == ["EARLY"]          # criteria tie: the earlier join wins
    assert invited(0, 5) == ["LATE"]           # the criteria rank the later joiner higher
