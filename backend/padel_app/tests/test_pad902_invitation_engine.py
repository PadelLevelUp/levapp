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
from padel_app.invitation_engine.settings import Tier, Timing
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
    assert (s.invites_per_spot, s.max_at_a_time, s.timing.inactivity) == (3, 12, timedelta(minutes=20))
    assert s.quiet_hours == (time(0), time(7))
    # Coach rules the plan is silent on start off (wave brief §2, clause 3).
    assert not (s.auto_entry_before_attendance_request or s.waiting_list_side_choice or s.direct_join)
    assert [t.source for t in s.tiers] == ["coach_list", "students_list", "pool", "pool"]


@pytest.mark.parametrize("changes, message", [
    ({"invites_per_spot": 0}, "invites_per_spot"),
    ({"max_at_a_time": 0}, "max_at_a_time"),
    ({"timing": Timing(inactivity=timedelta(seconds=30))}, "inactivity"),
    ({"timing": Timing(per_tier=(timedelta(minutes=5),))}, "per_tier"),
    ({"tiers": (Tier("pool"),)}, "level_offset"),
    ({"tiers": (Tier("coach_list", level_offset=0),)}, "level_offset"),
    ({"tiers": ()}, "tiers"),
])
def test_invalid_settings_are_refused_with_the_key_named(changes, message):
    with pytest.raises(SettingsError, match=message):
        EngineSettings().with_changes(**changes)


def test_with_changes_refuses_an_unknown_setting():
    with pytest.raises(SettingsError, match="between_groups"):
        EngineSettings().with_changes(between_groups=timedelta(hours=1))


def test_inactivity_per_tier_falls_back_to_the_default():
    s = EngineSettings(timing=Timing("per_tier", timedelta(minutes=20), (timedelta(minutes=5), None)))
    assert [s.inactivity_for(i) for i in range(4)] == [timedelta(minutes=5)] + [timedelta(minutes=20)] * 3


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
def test_phase_one_handles_every_request_and_decides_nothing(request_):
    store = _store()
    before = store.snapshot("A")
    assert Engine(store, EngineSettings()).handle("A", request_, T0) == []
    assert store.snapshot("A") == before


def test_phase_one_tick_decides_nothing():
    store = _store()
    engine = Engine(store, EngineSettings())
    for minutes in range(0, 24 * 60, 5):
        assert engine.tick(T0 + timedelta(minutes=minutes)) == []
    assert store.history == []


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
from padel_app.tests.invitation_scenarios.adapters.new import NewAdapter, engine_settings  # noqa: E402
from padel_app.tests.invitation_scenarios.runner import (  # noqa: E402
    BASE_SETTINGS,
    SCENARIOS_DIR,
    load_scenario,
    merge_settings,
    run_scenario,
)

TEMPLATE = SCENARIOS_DIR / "04-grupo-esgota-se-sem-resposta.yaml"


def test_the_base_profile_maps_onto_engine_settings_with_the_between_groups_clock_as_a_gap():
    settings, gaps = engine_settings(BASE_SETTINGS)
    assert (settings.invites_per_spot, settings.max_at_a_time) == (3, 12)
    assert settings.timing == Timing("fixed", timedelta(minutes=20))
    assert [(t.source, t.side, t.level_offset) for t in settings.tiers] == [
        ("coach_list", "same", None), ("students_list", "same", None), ("pool", "same", 1),
        ("pool", "same", 0), ("pool", "other", 1), ("pool", "other", 0)]
    assert settings.auto_entry_before_attendance_request and settings.waiting_list_side_choice
    assert settings.direct_join
    assert gaps == ["timing.between_groups: the plan has no between-groups clock (D9, D16)"]


def test_method_c_maps_between_rounds_per_tier_and_reports_to_next_group():
    harness = merge_settings(BASE_SETTINGS, {"timing": {"method": "C", "per_group": {
        3: {"between_rounds": "5m", "to_next_group": "30m"}, 4: {"between_rounds": "1m"}}}})
    settings, gaps = engine_settings(harness)
    assert settings.timing.per_tier == (None, None, timedelta(minutes=5), timedelta(minutes=1), None, None)
    assert gaps == ["timing.per_group.to_next_group: the plan has no between-groups clock (D9, D16)"]


def test_a_scenario_runs_against_the_skeleton_to_a_clean_failure():
    result = run_scenario(TEMPLATE, NewAdapter())
    assert result.error is None, result.error
    assert result.outcome == "fail" and result.evaluated > 0 and result.skipped == 0
    assert result.first.at == "2026-11-01 19:00" and result.first.key == "invitations"


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
    adapter = NewAdapter()
    sc = load_scenario(TEMPLATE)
    adapter.setup(sc)
    return adapter, sc.first_invite_at()


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
  - at: 2026-11-01 20:00
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
    adapter.store.apply([fx.Invited("A", to_utc(start), "L2R-1", frozenset({SpotType("R", 3)}), None, 2)])
    adapter.tick(start + timedelta(hours=3))           # far past T = 20 min: no longer counting (D16)
    assert adapter.snapshot("A").open_invitations == [("L2R-1", None, start)]


def test_every_engine_message_kind_maps_to_its_normalized_kind():
    kinds = typing.get_args(fx.MessageKind)
    assert {"sorry", "reoffer", "added", "waiting_list_offer", "side_moved"} == set(kinds)
    adapter, _ = _template_adapter()
    for kind in kinds:
        record, = adapter._records([fx.Message("A", T0, "W1", kind)])
        assert (record.kind, record.data["kind"]) == ("message", kind)
