"""PAD-902: the invitation engine's skeleton (phase 1 of PAD-899).

The package has its boundaries, settings, snapshot types and entry points, and no rules yet.
These tests pin what phase 1 promises: settings validate, the store's bookkeeping is exact, the
facade runs every request without deciding anything, and the package stays pure (no database,
no wall clock, no import of today's engine).
"""
import ast
from datetime import datetime, time, timedelta
from pathlib import Path

import pytest

from padel_app.invitation_engine import Engine, EngineSettings, MemoryStore, SettingsError
from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine import requests as rq
from padel_app.invitation_engine.settings import Tier, Timing, TimingPair
from padel_app.invitation_engine.snapshot import SpotType, Student

PACKAGE = Path(__file__).resolve().parents[1] / "invitation_engine"
T0 = datetime(2026, 11, 1, 19, 0)            # naive UTC
START = datetime(2026, 11, 3, 10, 30)        # Lisbon wall-clock


def _student(sid, side="L", level=3, participations=0):
    return Student(sid, level, frozenset({"L", "R"}) if side == "both" else frozenset({side}), participations)


def _store():
    store = MemoryStore()
    store.add_student(_student("W1", "R"))
    store.add_student(_student("H1", "R"), visible=False)
    store.add_session("A", 3, 4, START, [(_student("L-1"), "L"), (_student("R-1", "R"), "R"),
                                         (_student("B-1", "both"), None)], T0)
    return store


# --- settings ---------------------------------------------------------------------------------

def test_default_settings_are_the_plan_alone():
    s = EngineSettings()
    assert (s.invites_per_spot, s.max_at_a_time) == (3, 12)
    assert (s.timing.between_rounds, s.timing.between_groups) == (timedelta(minutes=20), timedelta(minutes=20))
    assert s.quiet_hours == (time(0), time(7))
    # Coach rules the plan is silent on start off (wave brief §2, clause 3).
    assert not (s.auto_entry_before_attendance_request or s.waiting_list_side_choice or s.direct_join)
    assert [t.source for t in s.tiers] == ["coach_list", "students_list", "pool", "pool"]


@pytest.mark.parametrize("changes, message", [
    ({"invites_per_spot": 0}, "invites_per_spot"),
    ({"max_at_a_time": 0}, "max_at_a_time"),
    ({"timing": Timing(between_rounds=timedelta(seconds=30))}, "between_rounds"),
    ({"timing": Timing(per_tier=(TimingPair(),))}, "per_tier"),
    ({"tiers": (Tier("pool"),)}, "level_offset"),
    ({"tiers": (Tier("coach_list", level_offset=0),)}, "level_offset"),
    ({"tiers": ()}, "tiers"),
])
def test_invalid_settings_are_refused_with_the_key_named(changes, message):
    with pytest.raises(SettingsError, match=message):
        EngineSettings().with_changes(**changes)


def test_with_changes_refuses_an_unknown_setting():
    with pytest.raises(SettingsError, match="inactivity"):
        EngineSettings().with_changes(inactivity=timedelta(hours=1))


def test_a_tier_without_its_own_pair_takes_the_fixed_pair():
    own = TimingPair(timedelta(minutes=5), timedelta(minutes=30))
    s = EngineSettings(timing=Timing("per_tier", timedelta(minutes=20), timedelta(hours=1), (own, None)))
    fixed = TimingPair(timedelta(minutes=20), timedelta(hours=1))
    assert [s.timing_for(i) for i in range(4)] == [own, fixed, fixed, fixed]


# --- the store's bookkeeping ------------------------------------------------------------------

def test_a_seeded_session_has_its_regulars_going_and_a_pool_without_hidden_students():
    snap = _store().snapshot("A")
    assert {p.student: p.side for p in snap.going} == {"L-1": "L", "R-1": "R", "B-1": None}
    assert [s.id for s in snap.pool] == ["W1"]          # H1 is hidden until it appears


def test_effects_are_recorded_as_they_say():
    store = _store()
    offer = frozenset({SpotType("R", 3)})
    at = T0 + timedelta(minutes=5)
    store.apply([
        fx.Left("A", at, "R-1", "regular_no"),
        fx.Invited("A", at, "W1", offer, None, 2),
        fx.WaitingListJoined("A", at, "H1", "coach", side="R"),
    ])
    snap = store.snapshot("A")
    assert snap.absent == {"R-1"} and snap.placement("R-1") is None
    assert [(i.student, i.tier, i.open) for i in snap.open_invitations] == [("W1", 2, True)]
    assert [(w.student, w.list, w.side) for w in snap.waiting_list] == [("H1", "coach", "R")]

    store.apply([
        fx.Answered("A", at, "W1", "yes", "invitation"),
        fx.Placed("A", at, "W1", "R", "invitation"),
        fx.WaitingListLeft("A", at, "H1", "coach"),
        fx.SideAssigned("A", at, "B-1", "L"),
    ])
    snap = store.snapshot("A")
    assert snap.open_invitations == () and snap.invitation("W1").answer == "yes"
    assert {p.student: p.side for p in snap.going} == {"L-1": "L", "B-1": "L", "W1": "R"}
    assert snap.waiting_list == () and "W1" not in {s.id for s in snap.pool}

    store.apply([fx.Answered("A", at, "L-1", "yes", "attendance_request")])
    assert store.snapshot("A").confirmed == {"L-1"}


def test_a_no_closes_the_latest_invitation_and_sets_the_gate():
    store = _store()
    offer = frozenset({SpotType("R", 3)})
    store.apply([fx.Invited("A", T0, "W1", offer, None, 2),
                 fx.Answered("A", T0, "W1", "no", "invitation"),
                 fx.Invited("A", T0 + timedelta(hours=1), "W1", offer, "R", 0)])
    snap = store.snapshot("A")
    assert snap.said_no == {"W1"}
    assert snap.invitation("W1").tier == 0 and snap.invitation("W1").open
    assert len(snap.invitations) == 2


# --- the facade -------------------------------------------------------------------------------

ALL_STUDENT_REQUESTS = [
    rq.Answer("W1", True), rq.Answer("W1", False), rq.DirectJoin("W1"),
    rq.JoinWaitingList("W1", "coach", side="R"), rq.JoinWaitingList("W1", "students", sides="both"),
    rq.LeaveWaitingList("W1", "students"), rq.RegularAbsent("R-1"), rq.RegularReturns("R-1"),
    rq.Cancel("W1"), rq.NoShow("L-1"), rq.ConfirmAttendance("L-1"), rq.ConfirmAttendance(None),
]


def test_every_student_request_type_is_exercised_here():
    assert {type(r) for r in ALL_STUDENT_REQUESTS} == set(rq.STUDENT_REQUESTS)


@pytest.mark.parametrize("request_", ALL_STUDENT_REQUESTS, ids=lambda r: type(r).__name__)
def test_every_request_runs_through_the_facade(request_):
    store = _store()
    effects = Engine(store, EngineSettings()).handle("A", request_, T0)
    assert isinstance(effects, list) and all(isinstance(e, fx.Effect) for e in effects)
    assert store.history == effects


def test_a_coach_exclusion_takes_the_student_out_of_the_session_pool():
    store = _store()
    Engine(store, EngineSettings()).handle("A", rq.CoachExcludes("W1"), T0)
    assert "W1" not in {s.id for s in store.snapshot("A").pool}


def test_session_creation_appearance_and_settings_go_through_the_facade():
    store = _store()
    engine = Engine(store, EngineSettings())
    engine.handle("B", rq.CreateSession(2, 8, START, ((_student("R-9", "R"), "R"),)), T0)
    assert store.sessions() == ("A", "B") and store.snapshot("B").capacity == 8
    engine.handle("A", rq.Appear("H1"), T0)
    assert "H1" in {s.id for s in store.snapshot("A").pool}
    engine.handle("A", rq.UpdateSettings(EngineSettings(direct_join=True)), T0)
    assert engine.settings.direct_join
    with pytest.raises(TypeError):
        engine.handle("A", object(), T0)


# --- purity -----------------------------------------------------------------------------------

FORBIDDEN_MODULES = ("padel_app.services", "padel_app.sql_db", "padel_app.models", "padel_app.model", "flask",
                     "sqlalchemy")
FORBIDDEN_CALLS = ("utcnow", "now", "today")


def _engine_sources():
    files = sorted(PACKAGE.glob("*.py"))
    assert len(files) >= 10, f"expected the engine package's modules under {PACKAGE}, found {files}"
    return files


def test_the_engine_package_imports_nothing_from_the_app_or_the_database():
    offenders = []
    for path in _engine_sources():
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            names = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom):
                names = [node.module or ""]
            offenders += [f"{path.name}: {n}" for n in names if n.startswith(FORBIDDEN_MODULES)]
    assert not offenders, offenders


def test_the_engine_package_never_reads_the_wall_clock():
    offenders = []
    for path in _engine_sources():
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in FORBIDDEN_CALLS:
                offenders.append(f"{path.name}:{node.lineno} .{node.func.attr}()")
    assert not offenders, offenders


def test_the_purity_scans_catch_what_they_look_for():
    tree = ast.parse("from padel_app.services import notification_service\nx = datetime.utcnow()\n")
    imports = [n.module for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)]
    calls = [n.func.attr for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)]
    assert any(m.startswith(FORBIDDEN_MODULES) for m in imports)
    assert any(c in FORBIDDEN_CALLS for c in calls)


# --- the scenario harness's `new` adapter -----------------------------------------------------

from padel_app.tests.invitation_scenarios import validate  # noqa: E402
from padel_app.tests.invitation_scenarios.adapters.new import (  # noqa: E402
    COACH_RULES,
    NewAdapter,
    coach_rules,
    engine_settings,
)
from padel_app.tests.invitation_scenarios.runner import (  # noqa: E402
    BASE_SETTINGS,
    SCENARIOS_DIR,
    load_scenario,
    merge_settings,
    run_scenario,
)

TEMPLATE = SCENARIOS_DIR / "04-grupo-esgota-se-sem-resposta.yaml"


def test_the_base_profile_maps_onto_engine_settings_with_no_gap_and_the_coach_rules_off():
    settings, gaps = engine_settings(BASE_SETTINGS)
    assert (settings.invites_per_spot, settings.max_at_a_time) == (3, 12)
    assert settings.timing == Timing("fixed", timedelta(minutes=20), timedelta(hours=1))
    assert [(t.source, t.side, t.level_offset) for t in settings.tiers] == [
        ("coach_list", "same", None), ("students_list", "same", None), ("pool", "same", 1),
        ("pool", "same", 0), ("pool", "other", 1), ("pool", "other", 0)]
    assert not (settings.auto_entry_before_attendance_request or settings.waiting_list_side_choice
                or settings.direct_join)
    assert gaps == []
    on, _ = engine_settings(BASE_SETTINGS, {"direct_join": True})
    assert on.direct_join and not on.waiting_list_side_choice


def test_method_c_maps_each_group_pair_and_a_missing_half_takes_the_default():
    harness = merge_settings(BASE_SETTINGS, {"timing": {"method": "C", "per_group": {
        3: {"between_rounds": "5m", "to_next_group": "30m"}, 4: {"between_rounds": "1m"}}}})
    settings, gaps = engine_settings(harness)
    twenty = timedelta(minutes=20)
    assert settings.timing.per_tier == (None, None, TimingPair(timedelta(minutes=5), timedelta(minutes=30)),
                                        TimingPair(timedelta(minutes=1), twenty), None, None)
    assert gaps == []


def test_a_scenario_turns_on_only_the_coach_rules_it_uses():
    def rules_of(*steps):
        return coach_rules({"timeline": list(steps)})

    assert rules_of({"at": "x", "events": [{"accepts": "W1"}]}) == {
        "direct_join": False, "waiting_list_side_choice": False, "auto_entry_before_attendance_request": False}
    assert rules_of({"at": "x", "events": [{"other_class": "B", "event": {"joins_directly": "J1"}}]})["direct_join"]
    assert not rules_of({"at": "x", "events": [{"joins_waiting_list": "S1", "sides": "both"}]})[
        "waiting_list_side_choice"]
    assert rules_of({"at": "x", "events": [{"joins_waiting_list": "S1", "sides": "other"}]})[
        "waiting_list_side_choice"]
    assert rules_of({"at": "x", "expect": {"messages": [{"who": "W1", "kind": "added"}]}})[
        "auto_entry_before_attendance_request"]
    assert rules_of({"at": "x", "expect": {"placed": [{"who": "W1", "side": "R", "how": "auto_from_waiting_list"}]}})[
        "auto_entry_before_attendance_request"]
    used = {k for path in sorted(SCENARIOS_DIR.glob("*.yaml"))
            for k, v in coach_rules(load_scenario(path).data).items() if v}
    assert used == set(COACH_RULES), "the suite's scenarios no longer use every coach rule"


def test_a_scenario_runs_against_the_new_engine_without_an_error():
    result = run_scenario(TEMPLATE, NewAdapter())
    assert result.error is None, result.error
    assert result.outcome in ("pass", "fail") and result.evaluated > 0 and result.skipped == 0


def test_every_harness_event_reaches_the_engine():
    assert set(validate.EVENTS) - {"other_class"}, "validate.EVENTS is empty"
    adapter = NewAdapter()
    sc = load_scenario(TEMPLATE)
    adapter.setup(sc)
    now = sc.first_invite_at()
    params = {"joins_waiting_list": {"sides": "both"}, "coach_adds_to_waiting_list": {"side": "R"},
              "coach_sets": {"settings": {"invites_per_spot": 2}}}
    for event in sorted(set(validate.EVENTS) - {"other_class"}):
        who = None if event in ("class_created", "coach_sets") else "L2R-1"
        if event == "class_created":
            adapter.sc.classes["B"] = adapter.sc.classes["A"]
            adapter.apply(event, None, {}, "B", now)
            continue
        adapter.apply(event, who, params.get(event, {}), "A", now)   # raises Unsupported if unmapped
    adapter.apply("confirms", "regulars", {}, "A", now)
    assert adapter.engine.settings.invites_per_spot == 2 and adapter.store.has_session("B")


def test_the_adapter_converts_between_lisbon_wall_clock_and_utc_in_summer():
    adapter = NewAdapter()
    adapter.setup(load_scenario(TEMPLATE))
    sent_utc = datetime(2026, 7, 1, 18, 0)                       # 19:00 in Lisbon (WEST, UTC+1)
    adapter.store.apply([fx.Invited("A", sent_utc, "L2R-1", frozenset({SpotType("R", 3)}), None, 2)])
    assert adapter.snapshot("A").open_invitations == [("L2R-1", None, datetime(2026, 7, 1, 19, 0))]
    record, = adapter._records([fx.Invited("A", sent_utc, "L2R-1", frozenset(), None, 2)])
    assert (record.at, record.data["group"]) == (datetime(2026, 7, 1, 19, 0), 3)
    seen = []
    adapter.engine.tick = lambda now: seen.append(now) or []
    adapter.tick(datetime(2026, 7, 1, 19, 0))
    assert seen == [sent_utc]


# --- adapter requirements from the review of the scenario sheet (PAD-902 follow-up) -----------

import typing  # noqa: E402

from padel_app.invitation_engine import answers  # noqa: E402
from padel_app.tests.invitation_scenarios.runner import Applied, to_utc  # noqa: E402


def _template_adapter():
    """The template's adapter and an instant before its invitation window, when nothing is planned."""
    adapter = NewAdapter()
    sc = load_scenario(TEMPLATE)
    adapter.setup(sc)
    return adapter, sc.first_invite_at() - timedelta(hours=9)


@pytest.mark.parametrize("engine_says", ["nothing", "refused"])
def test_an_accept_the_engine_turns_down_is_observed_as_nothing_placed_and_nothing_sent(monkeypatch, engine_says):
    adapter, now = _template_adapter()
    if engine_says == "refused":   # defensive: answers.handle's contract is no effects at all
        monkeypatch.setattr(answers, "handle", lambda snap, s, req, at: answers.Outcome(
            (fx.Refused("A", at, req.student, "direct_join", "no open invitation"),)))
    assert adapter.apply("accepts", "L2R-1", {}, "A", now) == Applied()
    assert adapter.apply("declines", "L2R-1", {}, "A", now) == Applied()
    assert adapter.drain() == []
    if engine_says == "refused":
        assert adapter.apply("joins_directly", "L2R-1", {}, "A", now).refused   # a join's refusal is observed
    # A session that does not exist: an accept is nothing, a join is refused.
    assert adapter.apply("accepts", "L2R-1", {}, "B", now) == Applied()
    assert adapter.apply("joins_waiting_list", "L2R-1", {"sides": "own"}, "B", now).refused


def test_an_accept_with_no_open_invitation_runs_through_the_runner_without_an_error(tmp_path):
    path = tmp_path / "accept-without-invitation.yaml"
    path.write_text("""
id: 1
title: accept with no invitation
source: {section: test, lines: [1, 2]}
what_it_tests: an accept the engine refuses is an observation, never an error
roster:
  regulars: {L: 8, R: 7}
students:
  - {id: W1, level: 3, side: R}
timeline:
  - at: 2026-11-01 10:00
    events: [{accepts: W1}]
    expect: {nothing_sent: true, roster: {L: 8, R: 7}}
final:
  roster: {L: 8, R: 7}
""", encoding="utf-8")
    result = run_scenario(path, NewAdapter())
    assert result.error is None and result.outcome == "pass", result.summary()
    assert result.evaluated >= 3 and not [r for r in result.log if r.kind == "refused"]


def test_an_open_invitation_past_its_inactivity_time_stays_open_with_its_send_time():
    adapter, start = _template_adapter()
    sent = to_utc(start)
    adapter.store.apply([fx.Invited("A", sent, "L2R-1", frozenset({SpotType("R", 3)}), None, 2,
                                    sent + timedelta(minutes=20))])
    adapter.tick(start + timedelta(hours=3))           # far past T = 20 min: no longer counting (D16)
    assert ("L2R-1", None, start) in adapter.snapshot("A").open_invitations


def test_every_engine_message_kind_maps_to_its_normalized_kind():
    kinds = typing.get_args(fx.MessageKind)
    assert {"sorry", "reoffer", "added", "waiting_list_invite", "side_moved"} == set(kinds)
    adapter, _ = _template_adapter()
    for kind in kinds:
        record, = adapter._records([fx.Message("A", T0, "W1", kind)])
        # The engine's "sorry" is the scenario format's "aviso" (constants.md KIND_SORRY); its
        # "waiting_list_invite" is the format's "waiting_list_offer" (KIND_WAITING_LIST_INVITE).
        expected = {"sorry": "aviso", "waiting_list_invite": "waiting_list_offer"}.get(kind, kind)
        assert (record.kind, record.data["kind"]) == ("message", expected)


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-ANSWERS-19")
def test_every_engine_write_is_inside_one_session_unit_at_a_time():
    """PAD-915 (agreed with PAD-916's table store): the engine works one session per unit, so a table
    store can lock that session alone; every effect is applied inside a unit, and none nests."""
    from contextlib import contextmanager

    class Recording(MemoryStore):
        def __init__(self):
            super().__init__()
            self.open, self.units, self.outside, self.students = [], [], 0, []

        @contextmanager
        def unit(self, sessions, students=()):
            assert not self.open, f"unit {sessions} opened inside {self.open}"
            self.open.append(sessions)
            self.units.append(sessions)
            self.students.append(students)
            try:
                yield
            finally:
                self.open.pop()

        def apply(self, effects):
            effects = list(effects)
            if effects and not self.open:
                self.outside += 1
            super().apply(effects)

    store = Recording()
    store.add_student(_student("W1", "R"))
    store.add_session("A", 3, 4, START, [(_student("L-1"), "L"), (_student("R-1", "R"), "R"),
                                         (_student("L-2"), "L")], T0)
    store.add_session("B", 3, 4, START, [(_student("L-3"), "L"), (_student("R-3", "R"), "R"),
                                         (_student("L-4"), "L")], T0)
    engine = Engine(store, EngineSettings())
    sent = engine.tick(T0)
    assert [(e.session, e.student) for e in sent if isinstance(e, fx.Invited)] == [("A", "W1")]
    assert store.units == [("A",), ("B",)]
    store.apply([fx.Invited("B", T0, "W1", frozenset({SpotType("R", 3)}), None, 2, T0 + timedelta(minutes=20))])
    store.units.clear()
    store.students.clear()
    store.outside = 0                                   # the seeding above is the test's, not the engine's
    out = engine.handle("A", rq.Answer("W1", True), T0 + timedelta(minutes=1))
    assert any(isinstance(e, fx.Placed) for e in out) and any(e.session == "B" for e in out)
    assert store.units == [("A",), ("B",)], "B's same-hour close replans in its own unit, after A's"
    assert store.students == [("W1",), ()], "the answer locks its student; the re-plan locks none"
    for request in (rq.Appear("W1"), rq.UpdateSettings(EngineSettings())):
        store.units.clear()
        engine.handle("A", request, T0)
        assert store.units == [("A",), ("B",)]
    assert store.outside == 0


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-ANSWERS-20")
def test_a_unit_the_store_refuses_is_dropped_and_the_rest_runs():
    """PAD-915/916: a store that finds the state moved under a unit (a same-hour placement elsewhere)
    raises UnitConflict and rolls back; the engine drops that unit's effects, runs the other sessions,
    and the next run re-plans."""
    from contextlib import contextmanager

    from padel_app.invitation_engine.store import UnitConflict

    class Refusing(MemoryStore):
        """Writes of a refused unit are never kept: a rollback."""

        refuse = {"A"}
        current: tuple = ()

        @contextmanager
        def unit(self, sessions, students=()):
            self.current = sessions
            try:
                yield
            finally:
                self.current = ()
            if set(sessions) & self.refuse:
                raise UnitConflict(sessions)

        def apply(self, effects):
            if not set(self.current) & self.refuse:
                super().apply(effects)

    store = Refusing()
    store.add_student(_student("W1", "R"))
    store.add_student(_student("W2", "R"))
    for session in ("A", "B"):
        store.add_session(session, 3, 4, START + (timedelta(hours=2) if session == "B" else timedelta()),
                          [(_student(f"{session}-L1"), "L"), (_student(f"{session}-L2"), "L"),
                           (_student(f"{session}-R1", "R"), "R")], T0)
    engine = Engine(store, EngineSettings())
    sent = engine.tick(T0)
    assert sent and {e.session for e in sent} == {"B"}, "A's unit was refused; B's still ran"
    assert engine.handle("A", rq.UpdateSettings(EngineSettings(), sessions=("A",)), T0) == []
    Refusing.refuse = set()
    assert {e.session for e in engine.tick(T0 + timedelta(minutes=1))} >= {"A"}, "the next run re-plans A"
