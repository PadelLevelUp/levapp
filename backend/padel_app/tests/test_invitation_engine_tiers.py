"""notifications.engine-tiers (PAD-906, wave W2): who may be asked for each spot type, and in what order.

Each test is one acceptance criterion of specflow/impl/notifications/engine-tiers.spec.md.
"""
from dataclasses import replace
from datetime import datetime, timedelta

import pytest

from padel_app.invitation_engine import Engine, EngineSettings, MemoryStore, SettingsError
from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.planner import plan, spot_counts, tier_for, with_postponed
from padel_app.invitation_engine.settings import Eligibility, Tier
from padel_app.invitation_engine.snapshot import Elsewhere, Invitation, Placement, SessionSnapshot, SpotType, Student

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


def test_only_a_counting_offer_elsewhere_postpones():
    """engine-tiers rule 10 (PAD-911): an offer that day postpones while it counts by planning rules 3
    and 4; not once its session is full, past its counting-until instant, or after sorry."""
    sent, now = datetime(2026, 11, 1, 19, 0), datetime(2026, 11, 1, 19, 10)
    offer = Invitation("x", frozenset({SpotType("R", 3)}), None, 2, sent, counts_until=sent + timedelta(minutes=20))
    open_b = tuple(Placement(f"b{i}", "L" if i < 4 else "R", "regular", sent) for i in range(7))
    full_b = open_b + (Placement("b7", "R", "regular", sent),)
    here = SessionSnapshot("A", 3, 8, START, regulars=(), going=())

    def postponed(invitation, going, at=now):
        return with_postponed(replace(here, elsewhere=(Elsewhere("B", START, invitation, 8, going),)), at).postponed

    assert postponed(offer, open_b) == {"x"}
    assert postponed(offer, full_b) == frozenset()                                   # its session is full
    assert postponed(offer, open_b, sent + timedelta(minutes=20)) == frozenset()     # past counting-until
    assert postponed(replace(offer, sorry_at=now), open_b) == frozenset()             # after sorry
    left_only = tuple(p for p in open_b if p.side == "R") + tuple(
        Placement(f"r{i}", "R", "regular", sent) for i in range(1))                  # only left spots open
    assert postponed(offer, left_only) == frozenset()                               # the offer counts for no type


def _first(ordering, **facts):
    """Who of two right-side students at the class level is invited first for one right spot."""
    store = MemoryStore()
    for sid in ("A", "B"):
        store.add_student(replace(_student(sid, "R"), **facts.get(sid, {})))
    store.add_session("S", 3, 8, START, _regulars(4, 3), T0)                 # one right spot
    settings = EngineSettings(invites_per_spot=1, ordering=ordering, tiers=(Tier("pool", "any", 0),))
    return _invited(plan(store.snapshot("S"), settings, T0).effects)


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIERS-11")
def test_ordering_is_priority_criteria_then_tiebreakers_in_the_coachs_order():
    """engine-tiers rule 8 (PAD-915): ``ordering`` is the coach's enabled priority criteria then
    tiebreakers, in the coach's order; the first criterion that tells two students apart wins."""
    facts = {"A": {"makeups_owed": 3}, "B": {"attendance_rate": 1.0}}
    assert _first(("justified_misses", "attendance"), **facts) == ["A"]
    assert _first(("attendance", "justified_misses"), **facts) == ["B"]
    assert _first(("unjustified_absences", "attendance_rate"), A={"unjustified_absences": 1},
                  B={"attendance_rate": 0.0}) == ["B"]
    with pytest.raises(SettingsError, match="ordering"):
        EngineSettings(ordering=("level", "shoe_size"))


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIERS-12")
def test_each_ordering_id_ranks_in_its_direction():
    """engine-tiers rule 8 (PAD-915): each criterion's direction; then join time on the lists (pinned
    by TIERS-7), then a stable order."""
    assert _first(("participations",)) == ["A"]                                  # a tie: the stable order
    assert _first(("participations",), B={"participations": 4}) == ["B"]         # more first
    assert _first(("justified_misses",), B={"makeups_owed": 2}) == ["B"]         # more owed first
    assert _first(("attendance",), B={"attendance_rate": 0.9}, A={"attendance_rate": 0.5}) == ["B"]
    assert _first(("attendance_rate",), B={"attendance_rate": 0.9}) == ["B"]     # higher first
    assert _first(("subscription_status",), A={"active": False}) == ["B"]       # an active account first
    assert _first(("unjustified_absences",), A={"unjustified_absences": 1}) == ["B"]   # fewer first
    assert _first(("justified_absences",), B={"justified_absences": 3}) == ["B"]       # more first
    # Playing side: the spot's side alone, then both sides, then the rest (today's _side_preference_rank).
    for criterion in ("playing_side", "playing_side_match"):
        assert _first((criterion,), A={"sides": frozenset({"L", "R"})}) == ["B"]
        assert _first((criterion,), A={"sides": frozenset({"L"})}, B={"sides": frozenset({"L", "R"})}) == ["B"]

    # Level, inside a list tier (a pool tier holds one level): the better level first, unknown last.
    def on_list(levels):
        store = MemoryStore()
        for sid, level in levels.items():
            store.add_student(_student(sid, "R", level=level))
        store.add_session("S", 3, 8, START, _regulars(4, 3), T0)
        store.apply([fx.WaitingListJoined("S", T0 - timedelta(hours=1), sid, "students", sides="both")
                     for sid in levels])
        settings = EngineSettings(invites_per_spot=3, ordering=("level",),
                                  eligibility=Eligibility(9, 9), tiers=(Tier("students_list"),))
        return _invited(plan(store.snapshot("S"), settings, T0).effects)

    assert on_list({"A": None, "B": 4, "C": 2}) == ["C", "B", "A"]
