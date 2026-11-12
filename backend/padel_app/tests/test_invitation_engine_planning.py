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
from padel_app.invitation_engine.planner import evaluate, plan
from padel_app.invitation_engine.requests import (
    Answer,
    Appear,
    ApproveQueue,
    DismissQueue,
    RegularAbsent,
    ReopenQueue,
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


# --- the re-offer (W7's planner half of PLANNING-26; the seam with answers.py, coordinator ruling) --

def test_sorry_invitation_is_reoffered_not_duplicated():
    from padel_app.invitation_engine.timeline import counting

    settings = EngineSettings(tiers=PLAN_TIERS, timing=Timing("fixed", HOUR, HOUR))
    store = _store(4, 3, pool=[_student("R1", "R"), _student("R2", "R")])
    store.apply(plan(store.snapshot("A"), settings, T0).effects)              # R1 and R2 invited, 1 spot
    yes_at = T0 + timedelta(minutes=5)
    store.apply([fx.Answered("A", yes_at, "R2", "yes", "invitation"), fx.Placed("A", yes_at, "R2", "R", "invitation"),
                 fx.Sorry("A", yes_at + timedelta(minutes=1), "R1"), fx.Message("A", yes_at, "R1", "sorry")])
    sorry = store.snapshot("A").invitation("R1")
    assert sorry.open and sorry.sorry_at is not None and not counting(sorry, yes_at + timedelta(minutes=2))
    reopen = T0 + timedelta(hours=3)
    store.apply([fx.Left("A", reopen, "R2", "cancel")])                     # the right spot reopens
    effects = plan(store.snapshot("A"), settings, reopen).effects
    assert [type(e).__name__ for e in effects] == ["Reoffered", "Message"]
    reoffer, message = effects
    assert (reoffer.student, message.kind) == ("R1", "reoffer") and reoffer.offer == frozenset({SpotType("R", 3)})
    store.apply(effects)
    snap = store.snapshot("A")
    assert [i.student for i in snap.invitations].count("R1") == 1                  # never a second one (D1)
    again = snap.invitation("R1")
    assert again.sorry_at is None and again.counts_until == reopen + HOUR
    assert counting(again, reopen + timedelta(minutes=59)) and not counting(again, reopen + HOUR)


def test_the_adapter_logs_a_reoffer_as_its_message_only():
    from padel_app.tests.invitation_scenarios.adapters.new import NewAdapter

    records = NewAdapter._records(NewAdapter(), [
        fx.Sorry("A", T0, "R1"), fx.Message("A", T0, "R1", "sorry"),
        fx.Reoffered("A", T0, "R1", frozenset({SpotType("R", 3)}), None, 2, T0 + HOUR),
        fx.Message("A", T0, "R1", "reoffer")])
    assert [(r.kind, r.data.get("kind")) for r in records] == [("message", "aviso"), ("message", "reoffer")]


# --- engine-planning rule 14 (owner ruling D2): semi-automatic mode holds the sends for the coach --------

SEMI = EngineSettings(invitation_mode="semi_automatic", tiers=(Tier("pool", "same", 0),))


def _requests(effects):
    return [e for e in effects if isinstance(e, fx.ApprovalRequest)]


def _semi(left, right, pool, settings=SEMI):
    store = _store(left, right, pool=[_student(sid, side) for sid, side in pool])
    return store, Engine(store, settings)


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-28")
def test_semi_automatic_run_asks_instead_of_sending():
    store, engine = _semi(3, 3, [("LA", "L"), ("LB", "L"), ("RA", "R")])       # a left and a right spot
    snap = store.snapshot("A")
    assert _invited(plan(snap, SEMI, T0).effects) == ["LA", "LB", "RA"]        # what automatic would send
    effects = engine.tick(T0)
    [request] = _requests(effects)
    assert _invited(effects) == []
    assert dict(request.queues) == evaluate(snap, SEMI, T0).queues
    assert dict(request.queues) == {SpotType("L", 3): ("LA", "LB"), SpotType("R", 3): ("RA",)}
    assert engine.tick(T0 + timedelta(minutes=1)) == []                       # nothing changed: nothing


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-29")
def test_approval_sends_the_queue_without_the_removed_and_t_starts_at_the_send():
    store, engine = _semi(4, 3, [("A", "R"), ("B", "R"), ("C", "R")])          # one right spot, X = 3
    [request] = _requests(engine.tick(T0))
    assert dict(request.queues) == {SpotType("R", 3): ("A", "B", "C")}
    approved_at = T0 + timedelta(minutes=10)
    effects = engine.handle("A", ApproveQueue(request.request, frozenset({"B"})), approved_at)
    sent = [e for e in effects if isinstance(e, fx.Invited)]
    assert [e.student for e in sent] == ["A", "C"] and not _requests(effects)
    assert {e.counts_until for e in sent} == {approved_at + timedelta(minutes=20)}   # T from the real send
    snap = store.snapshot("A")
    assert "B" not in snap.said_no and snap.approval.removed == {"B"}
    later = engine.tick(approved_at + timedelta(minutes=40))                  # A and C stopped counting
    assert "B" not in _invited(later)


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-30")
def test_rounds_inside_the_approved_queue_need_no_new_approval():
    settings = SEMI.with_changes(invites_per_spot=2)
    store, engine = _semi(4, 3, [("A", "R"), ("C", "R"), ("D", "R")], settings)   # one right spot, X = 2
    store.add_student(_student("E", "R"), visible=False)
    [request] = _requests(engine.tick(T0))
    assert dict(request.queues) == {SpotType("R", 3): ("A", "C", "D")}
    assert _invited(engine.handle("A", ApproveQueue(request.request), T0 + timedelta(minutes=1))) == ["A", "C"]
    topped = engine.handle("A", Answer("A", False), T0 + timedelta(minutes=2))
    assert _invited(topped) == ["D"] and not _requests(topped)                # inside the queue: unasked
    assert engine.handle("A", Appear("E"), T0 + timedelta(minutes=3)) == []   # C and D still count
    spent = engine.handle("A", Answer("C", False), T0 + timedelta(minutes=4))
    [again] = _requests(spent)
    assert _invited(spent) == [] and "E" in dict(again.queues)[SpotType("R", 3)]


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-31")
def test_a_pending_request_is_withdrawn_when_nothing_is_left_or_the_mode_turns_automatic():
    store, engine = _semi(4, 3, [("A", "R")])                                 # one right spot
    assert _requests(engine.tick(T0))
    store.apply([fx.Placed("A", T0, "Z", "R", "direct")])                     # the session fills
    effects = engine.tick(T0 + timedelta(minutes=1))
    assert [type(e) for e in effects] == [fx.ApprovalWithdrawn] and store.snapshot("A").approval.pending is None

    store, engine = _semi(4, 3, [("A", "R")])
    assert _requests(engine.tick(T0))
    effects = engine.handle("A", UpdateSettings(SEMI.with_changes(invitation_mode="automatic")),
                            T0 + timedelta(minutes=1))
    assert isinstance(effects[0], fx.ApprovalWithdrawn) and _invited(effects) == ["A"]


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-33")
def test_a_dismissed_session_asks_again_only_when_its_spots_change_or_the_coach_reopens_it():
    store, engine = _semi(4, 3, [("A", "R"), ("LA", "L")])                    # one right spot
    assert _requests(engine.tick(T0))
    dismissed = engine.handle("A", DismissQueue(), T0 + timedelta(minutes=1))
    assert [type(e) for e in dismissed] == [fx.QueueDismissed]
    assert engine.tick(T0 + timedelta(minutes=2)) == []                       # nothing sent, nothing asked
    changed = engine.handle("A", RegularAbsent("L-1"), T0 + timedelta(minutes=3))   # a left spot opens
    assert _invited(changed) == [] and fx.QueueReopened in [type(e) for e in changed]
    [request] = _requests(changed)
    assert set(dict(request.queues)) == {SpotType("L", 3), SpotType("R", 3)}

    engine.handle("A", DismissQueue(), T0 + timedelta(minutes=4))
    assert engine.tick(T0 + timedelta(minutes=5)) == []
    reopened = engine.handle("A", ReopenQueue(), T0 + timedelta(minutes=6))
    assert _invited(reopened) == [] and len(_requests(reopened)) == 1


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-34")
def test_an_answer_to_a_replaced_request_decides_nothing_and_removed_students_stay_out():
    store, engine = _semi(4, 3, [("A", "R"), ("B", "R"), ("C", "R"), ("D", "R")])   # one right spot, X = 3
    [r1] = _requests(engine.tick(T0))
    assert dict(r1.queues)[SpotType("R", 3)] == ("A", "B", "C", "D")
    engine.handle("A", ApproveQueue(r1.request, frozenset({"B"})), T0 + timedelta(minutes=1))   # A, C and D go
    store.add_student(_student("E", "R"))
    store.apply([fx.Answered("A", T0 + timedelta(minutes=2), "A", "no", "invitation")])
    [r2] = _requests(engine.tick(T0 + timedelta(minutes=3)))                 # E is outside the queue
    assert "B" not in dict(r2.queues)[SpotType("R", 3)] and "E" in dict(r2.queues)[SpotType("R", 3)]
    store.add_student(_student("F", "R"))
    [r3] = _requests(engine.tick(T0 + timedelta(minutes=4)))                 # F changes the queue: R3 replaces R2
    assert r3.request != r2.request
    assert engine.handle("A", ApproveQueue(r2.request), T0 + timedelta(minutes=5)) == []   # stale: nothing
    approval = store.snapshot("A").approval
    assert approval.pending_request == r3.request and approval.approved == {"A", "C", "D"}


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-35")
def test_a_dismissal_survives_a_switch_to_automatic():
    store, engine = _semi(4, 3, [("A", "R"), ("LA", "L")])                    # one right spot
    assert _requests(engine.tick(T0))
    engine.handle("A", DismissQueue(), T0 + timedelta(minutes=1))
    automatic = SEMI.with_changes(invitation_mode="automatic")
    assert _invited(engine.handle("A", UpdateSettings(automatic), T0 + timedelta(minutes=2))) == []
    assert _invited(engine.tick(T0 + timedelta(minutes=3))) == []             # nothing changed: still dismissed
    changed = engine.handle("A", RegularAbsent("L-1"), T0 + timedelta(minutes=4))   # a left spot opens
    assert _invited(changed) == ["A", "LA"] and not _requests(changed)       # sends as an automatic session


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-36")
def test_switching_to_automatic_empties_the_approved_queue():
    """engine-planning rule 14: switching back to semi-automatic holds the next send outside the
    (empty) approved queue, so a student approved before the switch is asked for again."""
    settings = SEMI.with_changes(invites_per_spot=1)
    store, engine = _semi(4, 3, [("A", "R"), ("B", "R")], settings)           # one right spot, X = 1
    [request] = _requests(engine.tick(T0))
    assert _invited(engine.handle("A", ApproveQueue(request.request), T0 + timedelta(minutes=1))) == ["A"]
    engine.handle("A", UpdateSettings(settings.with_changes(invitation_mode="automatic", max_at_a_time=1)),
                  T0 + timedelta(minutes=2))
    assert store.snapshot("A").approval.approved == frozenset()
    engine.handle("A", UpdateSettings(settings), T0 + timedelta(minutes=3))
    store.apply([fx.Answered("A", T0 + timedelta(minutes=4), "A", "no", "invitation")])
    effects = engine.tick(T0 + timedelta(minutes=5))
    assert _invited(effects) == [] and _requests(effects)                     # B was approved before: asked again


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-37")
def test_quiet_hours_keep_a_pending_request():
    """engine-planning rule 14: quiet hours pause the sends, so the pending request is not withdrawn."""
    store, engine = _semi(4, 3, [("A", "R")])
    assert _requests(engine.tick(T0))
    assert engine.tick(datetime(2026, 11, 2, 3, 0)) == []                     # 03:00 Lisbon, quiet
    assert store.snapshot("A").approval.pending is not None


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-38")
def test_a_dismissal_or_reopening_out_of_turn_does_nothing():
    """engine-planning rule 14: a DismissQueue with no pending request and a ReopenQueue on a session
    that is not dismissed record nothing, so an approved queue keeps sending."""
    store, engine = _semi(4, 3, [("A", "R")])
    assert engine.handle("A", ReopenQueue(), T0) == []                        # not dismissed: no QueueReopened
    [request] = _requests(engine.tick(T0))
    engine.handle("A", ApproveQueue(request.request), T0 + timedelta(minutes=1))
    assert engine.handle("A", DismissQueue(), T0 + timedelta(minutes=2)) == []   # nothing pending
    assert store.snapshot("A").approval.dismissed is None


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-PLANNING-39")
def test_engine_plan_runs_one_session():
    """``Engine.plan``: the app's "recompute from the class" plans exactly the session it names."""
    store, engine = _semi(4, 3, [("A", "R")])
    store.add_session("B", 3, 8, START, [], T0)
    effects = engine.plan("A", T0)
    assert {e.session for e in effects} == {"A"} and _requests(effects)
    assert engine.plan("A", T0 + timedelta(minutes=1)) == []                  # the same queue: nothing new
