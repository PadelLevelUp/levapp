"""notifications.engine-tiers (PAD-906, wave W2): who may be asked for each spot type, and in what order.

Each test is one acceptance criterion of specflow/impl/notifications/engine-tiers.spec.md.
"""
from dataclasses import replace
from types import SimpleNamespace
from datetime import datetime, timedelta

import pytest

from padel_app.invitation_engine import Engine, EngineSettings, MemoryStore, SettingsError
from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.planner import evaluate, plan, spot_counts, tier_for, with_postponed
from padel_app.invitation_engine.settings import Eligibility, GroupRule, Tier
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


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIERS-17")
def test_the_stores_postponed_students_stay_postponed():
    """with_postponed adds the students it finds to the ones the store's snapshot already postponed,
    instead of replacing them; a student busy at the same time is still not postponed."""
    sent, now = datetime(2026, 11, 1, 19, 0), datetime(2026, 11, 1, 19, 10)
    offer = Invitation("x", frozenset({SpotType("R", 3)}), None, 2, sent, counts_until=sent + timedelta(minutes=20))
    open_b = tuple(Placement(f"b{i}", "L" if i < 4 else "R", "regular", sent) for i in range(7))
    here = SessionSnapshot("A", 3, 8, START, regulars=(), going=(), postponed=frozenset({"s", "busy"}),
                           busy_same_time=frozenset({"busy"}), elsewhere=(Elsewhere("B", START, offer, 8, open_b),))
    assert with_postponed(here, now).postponed == {"s", "x"}


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
    # Equal on every configured id, the earlier joiner of a list goes first.
    store = MemoryStore()
    for sid in ("EARLY", "LATE"):
        store.add_student(_student(sid, "R", participations=2))
    store.add_session("S", 3, 8, START, _regulars(4, 3), T0)
    store.apply([fx.WaitingListJoined("S", datetime(2026, 11, 1, 11, 0), "EARLY", "students", sides="both"),
                 fx.WaitingListJoined("S", datetime(2026, 11, 1, 12, 0), "LATE", "students", sides="both")])
    lists = EngineSettings(invites_per_spot=1, ordering=("participations", "attendance_rate"),
                           tiers=(Tier("students_list"),))
    assert _invited(plan(store.snapshot("S"), lists, T0).effects) == ["EARLY"]
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


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIERS-13")
def test_dry_run_gives_each_student_a_verdict_per_spot_type():
    """Swap plan §4 (PAD-915, engine-tiers rule 11): ``evaluate`` is ``plan`` with nothing applied,
    plus each student's verdict per open type and the type's queue, for the simulation and the
    approval queue."""
    store = MemoryStore()
    students = {"NO": 3, "HIDDEN": 3, "BUSY": 3, "POST": 3, "LOW": 5, "EARLIER": 3, "P1": 3, "P2": 3, "P3": 3}
    for sid, level in students.items():
        store.add_student(_student(sid, "R", level=level, participations={"P2": 5, "P3": 3}.get(sid, 0)),
                          visible=sid != "HIDDEN")
    store.add_student(_student("LEFTY", "L"))
    store.add_session("A", 3, 4, START, [(_student("L-1", "L"), "L"), (_student("L-2", "L"), "L"),
                                         (_student("R-1", "R"), "R")], T0)           # one right spot
    store.add_session("B", 3, 4, START, [(_student("BUSY", "R"), "R")], T0)          # the same hour
    store.add_session("C", 3, 4, START + timedelta(hours=8), [], T0)                  # later that day
    spot = SpotType("R", 3)
    store.add_student(_student("COACH_OK", "L"))
    store.add_student(_student("COACH_SIDE", "L"))
    store.add_student(_student("CLOSED", "R"))
    store.add_student(_student("GONE", "R"))
    store.apply([fx.GroupApproved("A", T0 - timedelta(hours=1), 0, frozenset({"GONE"})),fx.WaitingListJoined("A", T0 - timedelta(hours=1), "HIDDEN", "students", sides="both"),
                 fx.WaitingListJoined("A", T0 - timedelta(hours=1), "COACH_OK", "coach", side="R"),
                 fx.WaitingListJoined("A", T0 - timedelta(hours=1), "COACH_SIDE", "coach", side="L"),
                 fx.Invited("A", T0 - timedelta(hours=2), "CLOSED", frozenset({spot}), None, 3, T0),
                 fx.InvitationClosed("A", T0 - timedelta(hours=1), "CLOSED"),
                 fx.Answered("A", T0, "NO", "no", "invitation"),
                 fx.Invited("C", T0, "POST", frozenset({spot}), None, 3, T0 + timedelta(minutes=20)),
                 fx.Invited("A", T0, "EARLIER", frozenset({spot}), None, 3, T0 + timedelta(minutes=20))])
    before = store.snapshot("A")
    settings = EngineSettings()
    now = T0 + timedelta(minutes=5)

    run = evaluate(before, settings, now)
    assert store.snapshot("A") == before, "nothing applied"
    assert run.effects == plan(before, settings, now).effects and run.may_plan
    stages = {v.student: (v.stage, v.tier) for v in run.verdicts if v.spot_type == spot}
    assert stages["R-1"] == ("in_session", None)
    assert stages["NO"] == ("said_no", None)
    assert stages["GONE"] == ("removed_by_coach", None)
    assert stages["HIDDEN"] == ("not_in_pool", None)
    assert stages["BUSY"] == ("busy_same_time", None)
    assert stages["POST"] == ("postponed", None)
    assert stages["LOW"] == ("failed_eligibility", None)
    assert stages["LEFTY"] == ("failed_tier_rule", None)
    assert stages["EARLIER"] == ("invited_earlier", 3)
    assert stages["CLOSED"] == ("invited_before", 3), "closed without a No: never a second invitation (D1)"
    # The coach's list skips the pool's gates: only its side rule can fail (rule 6).
    assert stages["COACH_SIDE"] == ("failed_tier_rule", None)
    # The coach's list is the ideal tier (tier 0): it is asked; the pool's tier, not the ideal one, sends
    # only for an uncovered spot (D17), and the spot is covered, so the pool waits in the coach's order.
    assert stages["COACH_OK"] == ("invited", 0)
    assert (stages["P2"], stages["P3"], stages["P1"]) == (("waiting", 3), ("waiting", 3), ("waiting", 3))
    assert [e.student for e in run.effects if isinstance(e, fx.Invited)] == ["COACH_OK"]
    assert run.queues[spot] == ("COACH_OK", "P2", "P3", "EARLIER", "P1")
    assert "CLOSED" not in run.queues[spot] and "GONE" not in run.queues[spot]
    assert {v.spot_type for v in run.verdicts} == {spot}
    # Outside the window the verdicts still explain, and the run sends nothing.
    early = evaluate(before, settings, T0 - timedelta(days=3))
    assert not early.may_plan and not early.effects
    assert {v.student: v.stage for v in early.verdicts}["P2"] == "waiting"
    # In quiet hours (00:00-07:00 Lisbon) too: nothing sent, the verdicts the same.
    quiet = evaluate(before, settings, datetime(2026, 11, 2, 3, 0))
    assert not quiet.may_plan and not quiet.effects
    assert {v.student: v.stage for v in quiet.verdicts}["P2"] == "waiting"


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIERS-13")
def test_dry_run_verdicts_follow_the_offer_per_type():
    """An either spot is covered by an offer of any side; a student this run asks for one type only
    is ``invited_for_other_type`` for the other and out of its queue."""
    store = MemoryStore()
    for sid in ("P1", "P2"):
        store.add_student(_student(sid, "R"))
    store.add_session("E", 3, 4, START, [(_student("L-1", "L"), "L"), (_student("F-1", "both"), None),
                                         (_student("F-2", "both"), None)], T0)            # one either spot
    either = evaluate(store.snapshot("E"), EngineSettings(), T0)
    assert {(v.student, v.spot_type.side, v.stage) for v in either.verdicts if v.student in ("P1", "P2")} == \
        {("P1", None, "invited"), ("P2", None, "invited")}

    store = MemoryStore()
    for sid, side in (("PR", "R"), ("PL", "L"), ("PB", "both")):
        store.add_student(_student(sid, side))
    store.add_session("A", 3, 8, START, _regulars(3, 3), T0)                           # one left, one right
    run = evaluate(store.snapshot("A"), EngineSettings(invites_per_spot=1, tiers=(Tier("pool", "any", 0),)), T0)
    stages = {(v.student, v.spot_type.side): v.stage for v in run.verdicts}
    assert sorted(e.student for e in run.effects if isinstance(e, fx.Invited)) == ["PB", "PL"]
    assert stages[("PB", "L")] == stages[("PB", "R")] == "invited"                     # offered both sides
    assert (stages[("PL", "R")], stages[("PL", "L")]) == ("invited", "invited_for_other_type")
    assert run.queues[SpotType("L", 3)] == ("PB", "PR") and run.queues[SpotType("R", 3)] == ("PB", "PL", "PR")


# --- engine-tiers rule 13 (owner ruling D5): a tier carries its stored group's rules --------------------

WIDE = Eligibility(levels_above=4, levels_below=4)       # the level gate out of the way: rule 13 alone


def _group_tiers(store, session, *tiers):
    snap = store.snapshot(session)
    return snap, spot_counts(snap), EngineSettings(tiers=tiers, eligibility=WIDE)


#: (rule, students who pass, students who fail); every student plays right, level 3 unless named.
GROUP_CASES = [
    (GroupRule("level", "same_as_vacancy"), [{}], [{"level": 2}, {"level": None}]),
    (GroupRule("level", "one_above_vacancy"), [{"level": 2}], [{"level": 1}, {}]),
    (GroupRule("level", "one_below_vacancy"), [{"level": 4}], [{"level": 5}, {}]),
    (GroupRule("level", "all_above_vacancy"), [{"level": 1}, {"level": 2}], [{}, {"level": 4}]),
    (GroupRule("level", "all_below_vacancy"), [{"level": 4}, {"level": 5}], [{}, {"level": 2}]),
    (GroupRule("level", "sideways"), [], [{}]),                          # an unknown level operation fails (B-257)
    (GroupRule("level", "same_as_class"), [{}], [{"level": 2}]),         # class-anchored, read as today
    (GroupRule("level", "equal_or_above_class"), [{}, {"level": 1}], [{"level": 4}]),
    (GroupRule("level", "equal_or_below_class"), [{}, {"level": 5}], [{"level": 2}]),
    (GroupRule("level", "one_below_or_above_class"), [{"level": 2}, {"level": 4}], [{"level": 5}]),
    (GroupRule("level", "within_n_of_class", 2), [{"level": 1}, {"level": 5}], []),
    (GroupRule("level", "within_n_above_class", 1), [{"level": 2}, {}], [{"level": 1}, {"level": 4}]),
    (GroupRule("level", "within_n_below_class", "x"), [{}], [{"level": 4}]),   # not a number: 0
    (GroupRule("side", "same_as_vacancy"), [{}, {"sides": "both"}], [{"sides": "L"}]),
    (GroupRule("has_makeups", "is_true"), [{"makeups_owed": 1}], [{}]),
    (GroupRule("unjustified_absences", "less_than", 2), [{"unjustified_absences": 1}], [{"unjustified_absences": 2}]),
    (GroupRule("unjustified_absences", "less_than_or_equal", "2"), [{"unjustified_absences": 2}],
     [{"unjustified_absences": 3}]),
    (GroupRule("unjustified_absences", "equals", 0), [{}], [{"unjustified_absences": 1}]),
    (GroupRule("justified_absences", "greater_than", 1), [{"justified_absences": 2}], [{"justified_absences": 1}]),
    (GroupRule("justified_absences", "greater_than_or_equal", 1), [{"justified_absences": 1}], [{}]),
    (GroupRule("attendance_rate", "greater_than_or_equal", 80), [{"attendance_rate": 0.8}],
     [{"attendance_rate": 0.75}]),
    (GroupRule("subscription_status", "equals", "active"), [{"subscription_status": "active"}],
     [{"subscription_status": "inactive"}, {}]),
    (GroupRule("unjustified_absences", "less_than", "many"), [{"unjustified_absences": 9}], []),  # not a number
    (GroupRule("unjustified_absences", "between", 2), [{"unjustified_absences": 9}], []),         # unknown operation
    (GroupRule("favourite_colour", "equals", "red"), [{}], []),                                  # unknown attribute
]


def _todays_verdict(monkeypatch, rule, facts):
    """``_group_rule_failures`` for one rule and one student, on a five-level ladder with the vacancy
    (a right spot) at level 3, its database reads replaced by the student's facts."""
    from padel_app.services import notification_service as today

    ladder = [SimpleNamespace(id=100 + i, code=f"N{i}") for i in range(1, 6)]
    level = facts.get("level", 3)
    pid = 1
    monkeypatch.setattr(today, "_attendance_counts_for",
                        lambda ids, coach_id: {pid: (10, 0, facts.get("justified_absences", 0))})
    monkeypatch.setattr(today, "_attendance_stats", lambda player_id, coach_id: (facts.get("attendance_rate", 0.0), 0))
    roster = SimpleNamespace(ladder=lambda: ladder,
                             makeups_owed=lambda player_id: facts.get("makeups_owed", 0),
                             unjustified_absences=lambda player_id: facts.get("unjustified_absences", 0))
    side = {"R": "right", "L": "left", "both": "both"}[facts.get("sides", "R")]
    cp = SimpleNamespace(player_id=pid, level=None if level is None else ladder[level - 1],
                         level_id=None if level is None else 100 + level, side=side,
                         player=SimpleNamespace(user=SimpleNamespace(status=facts.get("subscription_status"))))
    vacancy = SimpleNamespace(level_id=103, level=ladder[2], side="right")
    stored = {"attribute": rule.attribute, "operation": rule.operation, "value": rule.value}
    return not today._group_rule_failures([stored], cp, vacancy, 1, facts=roster)


def _engine_verdict(rule, facts):
    """Whether the engine puts the student in the one tier carrying ``rule``, for the right spot."""
    facts = dict(facts)
    sides = facts.pop("sides", "R")
    student = replace(_student("S", sides, level=facts.pop("level", 3)), **facts)
    store = MemoryStore()
    store.add_student(student)
    store.add_session("A", 3, 8, START, _regulars(4, 3), T0)                 # one right spot
    snap, counts, settings = _group_tiers(store, "A", Tier("pool", "any", None, rules=(rule,)))
    return tier_for(student, SpotType("R", 3), counts, snap, settings) == 0


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIERS-14")
def test_group_rules_give_todays_verdict_for_every_rule_kind(monkeypatch):
    for rule, passing, failing in GROUP_CASES:
        for facts, expected in [(f, True) for f in passing] + [(f, False) for f in failing]:
            today = _todays_verdict(monkeypatch, rule, facts)
            assert (rule, facts, _engine_verdict(rule, facts)) == (rule, facts, today)
            assert (rule, facts, today) == (rule, facts, expected)


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIERS-15")
def test_a_group_with_no_rules_admits_every_pool_student():
    store = MemoryStore()
    far = _student("FAR", "L", level=5)                                      # two levels off a level-3 class
    store.add_student(far)
    store.add_session("A", 3, 8, START, _regulars(3, 3), T0)                 # a left and a right spot
    level, side = GroupRule("level", "same_as_vacancy"), GroupRule("side", "same_as_vacancy")
    snap, counts, settings = _group_tiers(store, "A", Tier("pool", "any", None, rules=(level, side)),
                                          Tier("pool", "any", None, rules=(level,)), Tier("pool", "any", None))
    assert [tier_for(far, SpotType(s, 3), counts, snap, settings) for s in ("L", "R")] == [2, 2]


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIERS-16")
def test_level_ranges_admit_every_level_on_their_side_of_the_class():
    store = MemoryStore()
    students = {name: _student(name, "R", level=level)
                for name, level in (("ONE", 1), ("TWO", 2), ("THREE", 3), ("FOUR", 4), ("NONE", None))}
    for student in students.values():
        store.add_student(student)
    store.add_session("A", 3, 8, START, _regulars(4, 3), T0)                 # one right spot, class level 3
    snap, counts, settings = _group_tiers(store, "A",
                                          Tier("pool", "any", None, rules=(GroupRule("level", "all_above_vacancy"),)))
    admitted = {name for name, s in students.items() if tier_for(s, SpotType("R", 3), counts, snap, settings) == 0}
    assert admitted == {"ONE", "TWO"}


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIERS-18")
def test_a_class_with_no_level_applies_no_group_level_rule():
    """engine-spots rule 8 (D3) over today's fail-closed: with no class level, a group's level rules
    admit everyone, a student with no level included; its other rules still hold."""
    store = MemoryStore()
    students = [_student("ANY", "R", level=5), _student("NONE", "R", level=None), _student("LEFT", "L", level=5)]
    for student in students:
        store.add_student(student)
    store.add_session("A", None, 8, START, _regulars(4, 3), T0)              # one right spot, no level
    rules = (GroupRule("level", "same_as_vacancy"), GroupRule("level", "one_above_vacancy"),
             GroupRule("side", "same_as_vacancy"))
    snap, counts, settings = _group_tiers(store, "A", Tier("pool", "any", None, rules=rules))
    admitted = {s.id for s in students if tier_for(s, SpotType("R", None), counts, snap, settings) == 0}
    assert admitted == {"ANY", "NONE"}


def test_the_students_own_blocks_hold_on_every_tier():
    """engine-tiers rule 4: a student whose own settings refuse automatic invitations here (the store's
    ``blocked``) is not invited even from the coach's list, and the dry run says ``not_in_pool``."""
    store = MemoryStore()
    store.add_student(_student("C", "R"))
    store.add_session("A", 3, 8, START, _regulars(4, 3), T0)                 # one right spot
    store.apply([fx.WaitingListJoined("A", T0 - timedelta(hours=1), "C", "coach", side="R")])
    snap = replace(store.snapshot("A"), blocked=frozenset({"C"}))
    run = evaluate(snap, EngineSettings(), T0)
    assert _invited(run.effects) == [] and {v.student: v.stage for v in run.verdicts}["C"] == "not_in_pool"
    assert _invited(evaluate(store.snapshot("A"), EngineSettings(), T0).effects) == ["C"]


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIERS-20")
def test_any_overlap_with_the_same_coachs_class_is_busy():
    """engine-tiers rule 3 (owner decision 11): another session of the same coach whose interval
    overlaps at all makes a student busy; one ending as this starts, or another coach's, does not."""
    store = MemoryStore()
    for sid in ("EARLY", "LATER", "OTHER"):
        store.add_student(_student(sid, "R"))
    at = datetime(2026, 11, 3, 19, 0)
    store.add_session("S", 3, 8, at, _regulars(4, 3), T0, end=at + timedelta(hours=1))          # one right spot
    store.add_session("A", 3, 8, at - timedelta(hours=1), [(_student("EARLY", "R"), "R")], T0,
                      end=at + timedelta(minutes=30))                                            # 18:00-19:30
    store.add_session("B", 3, 8, at + timedelta(hours=1), [(_student("LATER", "R"), "R")], T0,
                      end=at + timedelta(hours=2))                                               # 20:00-21:00
    store.add_session("C", 3, 8, at, [(_student("OTHER", "R"), "R")], T0, coach="another")
    stages = {v.student: v.stage for v in evaluate(store.snapshot("S"), EngineSettings(), T0).verdicts}
    assert stages["EARLY"] == "busy_same_time"
    assert stages["LATER"] != "busy_same_time" and stages["OTHER"] != "busy_same_time"


def test_a_side_chosen_for_the_waiting_list_binds_whatever_wl_sides_says():
    """engine-settings rule 4, engine-tiers rule 6 (amended, R): ``wl-sides`` only decides whether the
    choice is offered; a side the student sent is always kept. A right-sider who chose the other side
    is a candidate for the left only, and the invitation names it, with the setting off."""
    store = MemoryStore()
    store.add_student(_student("W", "R"))
    store.add_session("A", 3, 8, START, _regulars(3, 3), T0)                  # a left and a right spot
    store.apply([fx.WaitingListJoined("A", T0 - timedelta(hours=1), "W", "students", sides="other")])
    settings = EngineSettings(tiers=(Tier("students_list"),))
    assert not settings.waiting_list_side_choice
    snap = store.snapshot("A")
    counts = spot_counts(snap)
    assert tier_for(snap.students["W"], SpotType("L", 3), counts, snap, settings) == 0
    assert tier_for(snap.students["W"], SpotType("R", 3), counts, snap, settings) is None
    [invited] = [e for e in plan(snap, settings, T0).effects if isinstance(e, fx.Invited)]
    assert invited.offer == frozenset({SpotType("L", 3)}) and invited.side_named == "L"
