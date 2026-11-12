"""notifications.engine-planning (PAD-906, wave W2): the basic run.

Each test is one acceptance criterion of specflow/impl/notifications/engine-planning.spec.md; the
scenario-pinned criteria of W2 (PLANNING-6, -11, -16) run in the scenario suite.
"""
import typing
from datetime import datetime, timedelta

import pytest

from padel_app.invitation_engine import Engine, EngineSettings, MemoryStore
from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.constants import ALERT_NO_CANDIDATE
from padel_app.invitation_engine.planner import evaluate, plan, spot_types
from padel_app.invitation_engine.requests import (
    Answer,
    Appear,
    ApproveGroup,
    DismissGroup,
    RegularAbsent,
    ReopenGroup,
    UpdateSettings,
)
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


# --- wave W5: hardest first, D17, offers, M, the tie rule ------------------------------------

from padel_app.invitation_engine.planner import split_tied  # noqa: E402
from padel_app.invitation_engine.settings import Tier, Timing  # noqa: E402

PLAN_TIERS = (Tier("pool", "same", 0), Tier("pool", "other", 0))   # the plan's group 1 and group 2
HOUR = timedelta(hours=1)


def test_tie_leftover_goes_to_fewer_going_then_fewer_candidates():
    want = {"L": 9, "R": 9}
    # Equal uncovered spots, M = 5: halves of 2, the odd one to the side with fewer going.
    assert split_tied(5, want, {"L": 3, "R": 3}, {"L": 4, "R": 3}, {"L": 6, "R": 6}, 3) == {"L": 2, "R": 3}
    # Going equal too: to the side with fewer candidates in the tier.
    assert split_tied(5, want, {"L": 3, "R": 3}, {"L": 3, "R": 3}, {"L": 5, "R": 6}, 3) == {"L": 3, "R": 2}
    # Rule 13's first step: the more vacant side is served until the sides are equal (PLANNING-21).
    assert split_tied(12, {"L": 6, "R": 18}, {"L": 2, "R": 6}, {"L": 6, "R": 2}, {"L": 10, "R": 30}, 3) == \
        {"L": 0, "R": 12}
    # Halves when equal (PLANNING-19).
    assert split_tied(12, {"L": 12, "R": 12}, {"L": 4, "R": 4}, {"L": 4, "R": 4}, {"L": 20, "R": 20}, 3) == \
        {"L": 6, "R": 6}


def _engine_run(store, settings, at):
    effects = plan(store.snapshot("A"), settings, at).effects
    store.apply(effects)
    return [(e.student, e.side_named, e.tier) for e in effects if isinstance(e, fx.Invited)]


def test_lower_tier_gets_one_per_spot_then_x_once_ideal():
    # S2 / PLANNING-3 with the No applied as a store effect (answers are wave W3).
    settings = EngineSettings(tiers=PLAN_TIERS, timing=Timing("fixed", HOUR, HOUR))
    rights = [_student(f"R{i}", "R") for i in range(1, 4)]
    lefts = [_student(f"L{i}", "L") for i in range(1, 7)]
    store = _store(4, 0, pool=rights + lefts)
    first = _engine_run(store, settings, T0)
    assert sorted(s for s, _, t in first if t == 0) == ["R1", "R2", "R3"]
    assert [(s, named) for s, named, t in first if t == 1] == [("L1", "R")]          # 1 for the 4th spot
    store.apply([fx.Answered("A", T0 + timedelta(minutes=10), "R1", "no", "invitation")])
    assert [s for s, _, _ in _engine_run(store, settings, T0 + timedelta(minutes=10))] == ["L2"]
    # The right-siders stop counting at 20:00: group 2 is ideal and tops up to X per spot.
    later = _engine_run(store, settings, T0 + HOUR)
    assert sorted(s for s, _, _ in later) == ["L3", "L4", "L5", "L6"]
    assert len([i for i in store.snapshot("A").invitations if i.student.startswith("L")]) == 6


def test_a_flexible_invitation_counts_for_both_types():
    # S10 / PLANNING-12 with the No applied as a store effect.
    settings = EngineSettings(tiers=PLAN_TIERS, timing=Timing("fixed", HOUR, HOUR))
    store = _store(4, 4, pool=[_student("B1", "both")] + [_student(f"L{i}", "L") for i in range(1, 6)])
    store.apply([fx.Left("A", T0, "L-1", "regular_no"), fx.Left("A", T0, "R-1", "regular_no")])
    first = _engine_run(store, settings, T0)
    assert first[0] == ("B1", None, 0)                                              # the right type first
    assert {t.side for t in store.snapshot("A").invitation("B1").offer} == {"L", "R"}
    assert sorted(s for s, _, _ in first) == ["B1", "L1", "L2"] and len(first) == 3   # group 2 not reached
    store.apply([fx.Answered("A", T0 + timedelta(minutes=10), "B1", "no", "invitation")])
    after = _engine_run(store, settings, T0 + timedelta(minutes=10))
    assert sorted(after) == [("L3", "R", 1), ("L4", "R", 1), ("L5", "R", 1)]       # asked to play right


# --- wave W7: the coach alert ------------------------------------------------------------------

@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-27")
def test_coach_alert_once_per_type_until_its_count_changes():
    settings = EngineSettings(tiers=PLAN_TIERS)
    store = _store(4, 3)                                    # one right spot, nobody in the pool
    first = plan(store.snapshot("A"), settings, T0).effects
    alerts = [e for e in first if isinstance(e, fx.CoachAlert)]
    assert [(a.reason, a.spot_type, a.spots) for a in alerts] == [(ALERT_NO_CANDIDATE, SpotType("R", 3), 1)]
    assert ALERT_NO_CANDIDATE == "no_candidate" and ALERT_NO_CANDIDATE in typing.get_args(fx.AlertReason)
    store.apply(first)
    assert [e for e in plan(store.snapshot("A"), settings, T0 + HOUR).effects
            if isinstance(e, fx.CoachAlert)] == []          # already raised for this type and count
    store.apply([fx.Left("A", T0 + HOUR, "R-3", "regular_no")])        # two right spots now
    again = [e for e in plan(store.snapshot("A"), settings, T0 + 2 * HOUR).effects if isinstance(e, fx.CoachAlert)]
    assert [(a.spot_type, a.spots) for a in again] == [(SpotType("R", 3), 2)]


def test_no_coach_alert_while_an_invitation_still_counts():
    settings = EngineSettings(tiers=PLAN_TIERS, timing=Timing("fixed", HOUR, HOUR))
    store = _store(4, 3, pool=[_student("R9", "R")])
    first = plan(store.snapshot("A"), settings, T0).effects
    assert [type(e).__name__ for e in first] == ["Invited"]
    store.apply(first)
    assert plan(store.snapshot("A"), settings, T0 + timedelta(minutes=59)).effects == ()
    late = plan(store.snapshot("A"), settings, T0 + HOUR).effects     # R9 stops counting, nobody else
    assert [type(e).__name__ for e in late] == ["CoachAlert"]


def test_method_b_takes_each_tier_share_of_what_is_left():
    # Scenario 83's file through the adapter, the regular's No applied as a store effect (answers
    # are wave W3): group 3 counts 9/30 of 10 h, then group 4 gets 8/21 of the 7 h left.
    from padel_app.tests.invitation_scenarios.adapters.new import NewAdapter
    from padel_app.tests.invitation_scenarios.runner import SCENARIOS_DIR, load_scenario

    path = next(SCENARIOS_DIR.glob("83-*.yaml"))
    adapter = NewAdapter()
    adapter.setup(load_scenario(path))
    opening = datetime(2026, 11, 2, 15, 30)                  # November: Lisbon wall-clock = UTC
    adapter.store.apply([fx.Left("A", opening, "R-1", "regular_no")])
    adapter.tick(opening)
    group3 = [i for i in adapter.store.snapshot("A").invitations if i.tier == 2]
    assert sorted(i.student for i in group3) == ["L2R-1", "L2R-2", "L2R-3"]
    assert {i.counts_until for i in group3} == {datetime(2026, 11, 2, 18, 30)}
    adapter.tick(datetime(2026, 11, 2, 18, 29))
    assert not [i for i in adapter.store.snapshot("A").invitations if i.tier == 3]
    adapter.tick(datetime(2026, 11, 2, 18, 30))
    group4 = [i for i in adapter.store.snapshot("A").invitations if i.tier == 3]
    assert sorted(i.student for i in group4) == ["L3R-1", "L3R-2", "L3R-3"]
    assert {i.counts_until for i in group4} == {datetime(2026, 11, 2, 21, 10)}


# --- a "sorry" invitation comes back only from the waiting list (rules 5.1, 5.3; the owner's decision 1) --

@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-26")
def test_sorry_invitation_is_reopened_only_from_the_waiting_list():
    from padel_app.invitation_engine.timeline import counting

    settings = EngineSettings(tiers=(Tier("students_list"),) + PLAN_TIERS, timing=Timing("fixed", HOUR, HOUR))
    store = _store(4, 3, pool=[_student(sid, "R") for sid in ("R1", "R2", "R3")])
    store.apply(plan(store.snapshot("A"), settings, T0).effects)              # all three invited, 1 spot
    yes_at = T0 + timedelta(minutes=5)
    store.apply([fx.Answered("A", yes_at, "R2", "yes", "invitation"), fx.Placed("A", yes_at, "R2", "R", "invitation")]
                + [e for sid in ("R1", "R3") for e in (fx.Sorry("A", yes_at, sid), fx.Message("A", yes_at, sid, "sorry"))]
                + [fx.WaitingListJoined("A", yes_at, "R3", "students", sides="own")])   # only R3 joins the list
    reopen = datetime(2026, 11, 2, 18, 0)                                    # after the reminder hour
    store.apply([fx.Left("A", reopen, "R2", "cancel")])                     # the right spot reopens
    effects = plan(store.snapshot("A"), settings, reopen).effects
    assert [type(e).__name__ for e in effects] == ["Reopened", "Message"]
    reopened, message = effects
    assert (reopened.student, message.kind) == ("R3", "waiting_list_invite")
    assert reopened.offer == frozenset({SpotType("R", 3)})
    store.apply(effects)
    snap = store.snapshot("A")
    assert [i.student for i in snap.invitations].count("R3") == 1                  # never a second one (D1)
    again = snap.invitation("R3")
    assert again.sorry_at is None and again.counts_until == reopen + HOUR and counting(again, reopen)
    assert snap.invitation("R1").sorry_at is not None                              # R1 is not a candidate


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-44")
def test_a_sorry_student_on_the_list_is_a_candidate_of_that_lists_tier_only():
    """engine-planning rule 5.1: a "sorry" holder on the waiting list comes back only through that
    list's tier. A right-sider who chose their own side is not reopened for a left spot, even though
    a later "other side" group would admit them."""
    settings = EngineSettings(tiers=(Tier("students_list"), Tier("pool", "other", 0)), timing=Timing("fixed", HOUR, HOUR))
    store = _store(4, 3, pool=[_student("W", "R")])
    store.apply([fx.Invited("A", T0, "W", frozenset({SpotType("R", 3)}), None, 1, T0 + HOUR),
                 fx.Sorry("A", T0 + HOUR, "W"),
                 fx.WaitingListJoined("A", T0 + HOUR, "W", "students", sides="own"),
                 fx.Placed("A", T0 + HOUR, "Z", "R", "direct"),                 # the right side fills
                 fx.Left("A", T0 + HOUR, "L-1", "regular_no")])                 # a left spot opens
    effects = plan(store.snapshot("A"), settings, datetime(2026, 11, 2, 18, 0)).effects
    assert not [e for e in effects if isinstance(e, (fx.Reopened, fx.Invited))]


def test_the_adapter_logs_a_reopened_invitation_as_invited():
    from padel_app.tests.invitation_scenarios.adapters.new import NewAdapter

    records = NewAdapter._records(NewAdapter(), [
        fx.Sorry("A", T0, "R1"), fx.Message("A", T0, "R1", "sorry"),
        fx.Reopened("A", T0, "R1", frozenset({SpotType("R", 3)}), None, 1, T0 + HOUR),
        fx.Message("A", T0, "R1", "waiting_list_invite")])
    assert [(r.kind, r.data.get("kind"), r.data.get("group")) for r in records] == [
        ("message", "aviso", None), ("invited", None, 2), ("message", "waiting_list_offer", None)]


# --- engine-planning rule 14: semi-automatic mode asks before each group (owner decisions 5 and 10) -----

G0, G1 = Tier("pool", "same", 0), Tier("pool", "same", 1)            # group 0: level 3; group 1: level 2
SEMI = EngineSettings(invitation_mode="semi_automatic", tiers=(G0,))
TWO = SEMI.with_changes(tiers=(G0, G1))


def _requests(effects):
    return [e for e in effects if isinstance(e, fx.ApprovalRequest)]


def _semi(left, right, pool, settings=SEMI):
    """``pool``: (id, side) or (id, side, level)."""
    store = _store(left, right, pool=[_student(*p) for p in pool])
    return store, Engine(store, settings)


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-28")
def test_semi_automatic_run_asks_before_the_first_group():
    settings = SEMI.with_changes(tiers=(Tier("coach_list"), G0))
    store, engine = _semi(4, 3, [("K", "R"), ("P", "R")], settings)            # one right spot
    store.apply([fx.WaitingListJoined("A", T0 - timedelta(hours=1), "K", "coach", side="R")])
    snap = store.snapshot("A")
    effects = engine.tick(T0)
    [request] = _requests(effects)
    assert _invited(effects) == [] and request.tier == 0
    assert dict(request.queues) == {SpotType("R", 3): evaluate(snap, settings, T0).queues[SpotType("R", 3)][:1]} \
        == {SpotType("R", 3): ("K",)}
    assert engine.tick(T0 + timedelta(minutes=1)) == []                       # nothing changed: nothing


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-29")
def test_approving_a_group_sends_from_it_without_the_removed():
    store, engine = _semi(4, 3, [("A", "R"), ("B", "R"), ("C", "R")])          # one right spot, X = 3
    [request] = _requests(engine.tick(T0))
    assert dict(request.queues) == {SpotType("R", 3): ("A", "B", "C")}
    approved_at = T0 + timedelta(minutes=10)
    effects = engine.handle("A", ApproveGroup(request.request, frozenset({"B"})), approved_at)
    sent = [e for e in effects if isinstance(e, fx.Invited)]
    assert [e.student for e in sent] == ["A", "C"] and not _requests(effects)
    assert {e.counts_until for e in sent} == {approved_at + timedelta(minutes=20)}   # T from the real send
    snap = store.snapshot("A")
    assert "B" not in snap.said_no and snap.approval.removed == {"B"} and snap.approval.approved_groups == {0}
    assert "B" not in _invited(engine.tick(approved_at + timedelta(minutes=40)))


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-30")
def test_rounds_inside_an_approved_group_run_alone_and_the_next_group_asks():
    settings = TWO.with_changes(invites_per_spot=2)
    store, engine = _semi(4, 3, [("A", "R"), ("C", "R"), ("D", "R"), ("E", "R", 2)], settings)   # one right spot
    [request] = _requests(engine.tick(T0))
    assert request.tier == 0
    assert _invited(engine.handle("A", ApproveGroup(request.request), T0 + timedelta(minutes=1))) == ["A", "C"]
    topped = engine.handle("A", Answer("A", False), T0 + timedelta(minutes=2))
    assert _invited(topped) == ["D"] and not _requests(topped)               # inside group 0: unasked
    engine.handle("A", Answer("C", False), T0 + timedelta(minutes=3))
    spent = engine.handle("A", Answer("D", False), T0 + timedelta(minutes=4))  # group 0 spent, the spot uncovered
    [again] = _requests(spent)
    assert _invited(spent) == [] and again.tier == 1 and dict(again.queues)[SpotType("R", 3)] == ("E",)


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-31")
def test_a_pending_request_is_withdrawn_when_nothing_is_left_or_the_mode_turns_automatic():
    store, engine = _semi(4, 3, [("A", "R")])                                 # one right spot
    [request] = _requests(engine.tick(T0))
    store.apply([fx.Placed("A", T0, "Z", "R", "direct")])                     # the session fills
    effects = engine.tick(T0 + timedelta(minutes=1))
    assert effects == [fx.ApprovalWithdrawn("A", T0 + timedelta(minutes=1), 0, request.request)]
    assert store.snapshot("A").approval.pending == ()

    store, engine = _semi(4, 3, [("A", "R")])
    assert _requests(engine.tick(T0))
    effects = engine.handle("A", UpdateSettings(SEMI.with_changes(invitation_mode="automatic")),
                            T0 + timedelta(minutes=1))
    assert isinstance(effects[0], fx.ApprovalWithdrawn) and _invited(effects) == ["A"]


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-33")
def test_a_dismissed_group_is_skipped_until_a_change_or_a_reopen():
    store, engine = _semi(4, 3, [("A", "R"), ("E", "R", 2)], TWO)             # one right spot
    [r0] = _requests(engine.tick(T0))
    dismissed = engine.handle("A", DismissGroup(r0.request), T0 + timedelta(minutes=1))
    assert isinstance(dismissed[0], fx.GroupDismissed) and _invited(dismissed) == []
    assert [r.tier for r in _requests(dismissed)] == [1]                     # group 0 skipped: group 1 is asked for
    changed = engine.handle("A", RegularAbsent("L-1"), T0 + timedelta(minutes=2))   # the spot count changes
    assert fx.GroupReopened("A", T0 + timedelta(minutes=2), 0) in changed
    assert 0 in [r.tier for r in _requests(changed)] and "A" not in _invited(changed)

    [again] = [r for r in _requests(changed) if r.tier == 0]
    engine.handle("A", DismissGroup(again.request), T0 + timedelta(minutes=3))
    reopened = engine.handle("A", ReopenGroup(0), T0 + timedelta(minutes=4))
    assert reopened[0] == fx.GroupReopened("A", T0 + timedelta(minutes=4), 0)
    assert 0 in [r.tier for r in _requests(reopened)] and "A" not in _invited(reopened)


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-34")
def test_an_answer_to_a_replaced_request_decides_nothing_and_removed_students_stay_out():
    store, engine = _semi(4, 3, [("A", "R"), ("B", "R"), ("C", "R"), ("E", "R", 2)], TWO)   # one right spot, X = 3
    [r1] = _requests(engine.tick(T0))
    assert dict(r1.queues)[SpotType("R", 3)] == ("A", "B", "C")
    engine.handle("A", ApproveGroup(r1.request, frozenset({"B"})), T0 + timedelta(minutes=1))   # A and C go
    engine.handle("A", Answer("A", False), T0 + timedelta(minutes=2))
    [r2] = _requests(engine.handle("A", Answer("C", False), T0 + timedelta(minutes=3)))   # group 1 now
    assert r2.tier == 1 and dict(r2.queues)[SpotType("R", 3)] == ("E",)       # B, removed, is in no later request
    store.add_student(_student("F", "R", 2))
    [r3] = _requests(engine.tick(T0 + timedelta(minutes=4)))                 # F changes group 1's queue
    assert r3.tier == 1 and r3.request != r2.request
    assert engine.handle("A", ApproveGroup(r2.request), T0 + timedelta(minutes=5)) == []   # stale: nothing
    approval = store.snapshot("A").approval
    assert [p.request for p in approval.pending] == [r3.request] and approval.approved_groups == {0}


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-35")
def test_a_dismissed_group_survives_a_switch_to_automatic():
    store, engine = _semi(4, 3, [("A", "R"), ("E", "R", 2)], TWO)             # one right spot
    [r0] = _requests(engine.tick(T0))
    engine.handle("A", DismissGroup(r0.request), T0 + timedelta(minutes=1))
    automatic = TWO.with_changes(invitation_mode="automatic")
    switched = engine.handle("A", UpdateSettings(automatic), T0 + timedelta(minutes=2))
    assert _invited(switched) == ["E"]                                        # group 0 sends nothing, group 1 sends
    assert _invited(engine.tick(T0 + timedelta(minutes=3))) == []
    changed = engine.handle("A", RegularAbsent("L-1"), T0 + timedelta(minutes=4))   # the spot count changes
    assert "A" in _invited(changed)                                           # group 0 sends again


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-36")
def test_switching_to_automatic_empties_the_approved_groups():
    settings = SEMI.with_changes(invites_per_spot=1)
    store, engine = _semi(4, 3, [("A", "R"), ("B", "R")], settings)           # one right spot, X = 1
    [request] = _requests(engine.tick(T0))
    assert _invited(engine.handle("A", ApproveGroup(request.request), T0 + timedelta(minutes=1))) == ["A"]
    engine.handle("A", UpdateSettings(settings.with_changes(invitation_mode="automatic")), T0 + timedelta(minutes=2))
    assert store.snapshot("A").approval.approved_groups == frozenset()
    engine.handle("A", UpdateSettings(settings), T0 + timedelta(minutes=3))
    effects = engine.handle("A", Answer("A", False), T0 + timedelta(minutes=4))
    assert _invited(effects) == [] and [r.tier for r in _requests(effects)] == [0]   # group 0 asked again


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-37")
def test_quiet_hours_keep_a_pending_request():
    store, engine = _semi(4, 3, [("A", "R")])
    assert _requests(engine.tick(T0))
    assert engine.tick(datetime(2026, 11, 2, 3, 0)) == []                     # 03:00 Lisbon, quiet
    assert len(store.snapshot("A").approval.pending) == 1


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-38")
def test_a_dismissal_or_reopening_out_of_turn_does_nothing():
    store, engine = _semi(4, 3, [("A", "R")])
    assert engine.handle("A", DismissGroup("no-such-request"), T0) == []      # no pending request
    assert engine.handle("A", ReopenGroup(0), T0) == []                       # not dismissed: no GroupReopened
    assert store.snapshot("A").approval.dismissed_groups == ()


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-41")
def test_an_approved_group_stays_approved_for_the_session():
    settings = SEMI.with_changes(invites_per_spot=1, tiers=(Tier("coach_list"), G0, G1))
    store, engine = _semi(4, 3, [("K1", "R"), ("E", "R", 2)], settings)       # one right spot
    store.add_student(_student("K2", "R"), visible=False)                      # only ever on the coach's list
    store.add_session("B", 3, 8, START + timedelta(hours=3), [], T0)
    store.add_student(_student("K3", "R"), visible=False)
    store.apply([fx.WaitingListJoined("A", T0 - timedelta(hours=1), "K1", "coach", side="R"),
                 fx.WaitingListJoined("B", T0 - timedelta(hours=1), "K3", "coach", side="R")])
    first = engine.tick(T0)
    [r0] = [r for r in _requests(first) if r.session == "A"]
    engine.handle("A", ApproveGroup(r0.request), T0 + timedelta(minutes=1))   # K1 invited from group 0
    past = engine.handle("A", Answer("K1", False), T0 + timedelta(minutes=2))
    assert [r.tier for r in _requests(past)] == [2]                           # past group 0, asking for group 2
    store.apply([fx.WaitingListJoined("A", T0 + timedelta(minutes=3), "K2", "coach", side="R")])   # a late add
    late = engine.tick(T0 + timedelta(minutes=3))
    assert ("A", "K2") in [(e.session, e.student) for e in late if isinstance(e, fx.Invited)]
    assert not [r for r in _requests(late) if r.session == "A" and r.tier == 0]
    assert 0 in [r.tier for r in _requests(first) if r.session == "B"]       # another session asks afresh
    assert store.snapshot("B").approval.approved_groups == frozenset()


FOUR = SEMI.with_changes(tiers=(Tier("coach_list"), G0, G1, Tier("pool", "any", None)))   # groups 0-3


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-42")
def test_two_groups_about_to_start_each_get_their_request():
    store, engine = _semi(3, 3, [("LA", "L"), ("RX", "R", 1)], FOUR)          # a left and a right spot
    effects = engine.tick(T0)                                                 # left: group 1; right: group 3
    requests = {r.tier: r for r in _requests(effects)}
    assert set(requests) == {1, 3} and _invited(effects) == []
    approved = engine.handle("A", ApproveGroup(requests[3].request), T0 + timedelta(minutes=1))
    assert _invited(approved) == ["RX"]                                       # without waiting for group 1


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-43")
def test_a_dismissed_groups_student_is_reached_from_a_later_group():
    store, engine = _semi(4, 3, [("S", "R")], FOUR)                           # S: group 1 and "everyone" group 3
    [r1] = _requests(engine.tick(T0))
    assert r1.tier == 1
    reached = engine.handle("A", DismissGroup(r1.request), T0 + timedelta(minutes=1))   # group 2 is empty
    [r3] = _requests(reached)
    assert r3.tier == 3 and dict(r3.queues)[SpotType("R", 3)] == ("S",)


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-39")
def test_engine_plan_runs_one_session():
    """``Engine.plan``: the app's "recompute from the class" plans exactly the session it names."""
    store, engine = _semi(4, 3, [("A", "R")])
    store.add_session("B", 3, 8, START, [], T0)
    effects = engine.plan("A", T0)
    assert {e.session for e in effects} == {"A"} and _requests(effects)
    assert engine.plan("A", T0 + timedelta(minutes=1)) == []                  # the same queue: nothing new


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-40")
def test_an_alert_is_cleared_once_its_type_has_a_candidate():
    store = _store(4, 3)                                                       # one right spot, nobody to ask
    store.add_student(_student("LATE", "R"), visible=False)
    engine = Engine(store, EngineSettings())
    [alert] = [e for e in engine.tick(T0) if isinstance(e, fx.CoachAlert)]
    assert store.snapshot("A").alerted == {alert.spot_type: 1}
    effects = engine.handle("A", Appear("LATE"), T0 + timedelta(minutes=5))   # a right-sider can be asked now
    assert _invited(effects) == ["LATE"]
    assert [e.spot_type for e in effects if isinstance(e, fx.AlertCleared)] == [alert.spot_type]
    assert store.snapshot("A").alerted == {}


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-45")
def test_a_flexible_invitation_fills_one_types_budget():
    """engine-planning rules 4 and 5.3 as amended (staging rehearsal, instance 783): a counting
    invitation fills the budget of one type only, the type it covers; a flexible holder not yet
    assigned counts for the next type it fits. Capacity 4, a {L, R} regular unplaced and a right
    regular; six {L, R} students invited for the two spots; the right regular leaves, so three spots
    (left, right, either) at the ideal tier with X = 3 take nine counting invitations: three more now."""
    settings = EngineSettings(tiers=(Tier("pool", "any", None),), timing=Timing("fixed", HOUR, HOUR))
    store = MemoryStore()
    for i in range(1, 10):
        store.add_student(_student(f"P{i}", "both"))
    store.add_session("A", 3, 4, START, [(_student("F", "both"), None), (_student("R1", "R"), "R")], T0)
    first = plan(store.snapshot("A"), settings, T0).effects
    assert len(_invited(first)) == 6
    assert {frozenset(o.side for o in e.offer) for e in first if isinstance(e, fx.Invited)} == {frozenset("LR")}
    store.apply(first)
    store.apply([fx.Left("A", T0 + timedelta(minutes=2), "R1", "regular_no")])   # a third spot opens
    assert len(spot_types(store.snapshot("A"))) == 3
    again = plan(store.snapshot("A"), settings, T0 + timedelta(minutes=5)).effects
    assert len(_invited(again)) == 3                                          # nine counting for three spots
