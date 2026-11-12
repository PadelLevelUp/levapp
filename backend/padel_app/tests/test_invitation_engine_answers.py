"""notifications.engine-answers (PAD-908, wave W3): a Yes is placed within its offer, a named side
binds, the student's own side comes first, a flexible Yes goes where it is hardest to fill, and an
accept with no open invitation changes nothing.

Scenario pins: ANSWERS-1 is P06, ANSWERS-2 is P15, ANSWERS-3 is P24.
"""
import os
from dataclasses import replace
from datetime import datetime, timedelta

import pytest

from padel_app.invitation_engine import EngineSettings
from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.answers import handle
from padel_app.invitation_engine.effects import (
    Absence,
    Answered,
    InvitationClosed,
    Left,
    Placed,
    Refused,
    WaitingListLeft,
)
from padel_app.invitation_engine.requests import Answer, Cancel, DirectJoin, JoinWaitingList, NoShow, RegularAbsent
from padel_app.invitation_engine.snapshot import (
    Elsewhere,
    Invitation,
    Placement,
    SessionSnapshot,
    SpotType,
    Student,
    WaitingListEntry,
)

START = datetime(2026, 11, 3, 10, 30)                # Lisbon wall-clock; UTC+0 in November
SENT = datetime(2026, 11, 1, 19, 0)
NOW = datetime(2026, 11, 1, 19, 10)
L, R = SpotType("L", 3), SpotType("R", 3)


def _student(sid, sides):
    return Student(sid, 3, frozenset(sides))


def _session(regulars, students=(), invitations=(), waiting_list=(), going_extra=()):
    """``regulars``: (id, side) going; ``students``: (id, sides) in the pool."""
    regs = [_student(sid, side or "LR") for sid, side in regulars]
    pool = [_student(sid, sides) for sid, sides in students]
    going = tuple(Placement(sid, side, "regular", SENT) for sid, side in regulars) + tuple(going_extra)
    return SessionSnapshot("S", 3, 8, START, regulars=tuple(regs), going=going, invitations=tuple(invitations),
                           waiting_list=tuple(waiting_list), pool=tuple(pool),
                           students={s.id: s for s in regs + pool})


def _inv(sid, *offer, named=None, tier=2):
    return Invitation(sid, frozenset(offer), named, tier, SENT, counts_until=SENT + timedelta(minutes=20))


def _placed(effects):
    return [(e.student, e.side, e.how) for e in effects if isinstance(e, Placed)]


def _regs(n_left, n_right):
    return [(f"L{i}", "L") for i in range(1, n_left + 1)] + [(f"R{i}", "R") for i in range(1, n_right + 1)]


def test_accept_without_invitation_is_refused():
    s = _session(_regs(4, 3), [("x", "R")])
    assert handle(s, EngineSettings(), Answer("x", True), NOW).effects == ()
    # Already answered, or after the class has started: the same.
    answered = _session(_regs(4, 3), [("x", "R")], [Invitation("x", frozenset({R}), None, 2, SENT, answer="no")])
    assert handle(answered, EngineSettings(), Answer("x", True), NOW).effects == ()
    late = _session(_regs(4, 3), [("x", "R")], [_inv("x", R)])
    assert handle(late, EngineSettings(), Answer("x", True), datetime(2026, 11, 3, 10, 40)).effects == ()


def test_a_yes_within_the_offer_is_placed_whatever_the_tier():
    # S6: a left-sider told "right" says Yes first and gets the spot; the invitation closes.
    s = _session(_regs(4, 3), [("l", "L"), ("r", "R")], [_inv("r", R, tier=2), _inv("l", R, named="R", tier=3)])
    effects = handle(s, EngineSettings(), Answer("l", True), NOW).effects
    assert _placed(effects) == [("l", "R", "invitation")]
    assert any(isinstance(e, Answered) and e.answer == "yes" for e in effects)


def test_a_named_side_binds():
    # Told "left"; only the right is open: no place on the right (W6 brings the re-offer).
    s = _session(_regs(4, 3), [("r", "R")], [_inv("r", L, named="L")])
    assert _placed(handle(s, EngineSettings(), Answer("r", True), NOW).effects) == []


def test_own_side_first_even_when_the_other_is_harder():
    # S24: a right-sider from the waiting list with an either-side offer; left and right open.
    wl = [WaitingListEntry("w", "students", SENT)]
    s = _session(_regs(3, 3), [("w", "R")], [_inv("w", L, R, tier=1)], wl)
    effects = handle(s, EngineSettings(), Answer("w", True), NOW).effects
    assert _placed(effects) == [("w", "R", "invitation")]
    assert [e.list for e in effects if isinstance(e, WaitingListLeft)] == ["students"]


def test_a_flexible_yes_goes_to_the_side_with_fewest_candidates_per_spot():
    # S15: left has 3 counting candidates (b and two left-siders), right only b; b goes right.
    s = _session(_regs(3, 3), [("b", "LR"), ("l1", "L"), ("l2", "L")],
                 [_inv("b", L, R), _inv("l1", L), _inv("l2", L)])
    assert _placed(handle(s, EngineSettings(), Answer("b", True), NOW).effects) == [("b", "R", "invitation")]


def test_a_no_is_final_and_closes_the_invitation():
    s = _session(_regs(4, 3), [("r", "R")], [_inv("r", R)])
    effects = handle(s, EngineSettings(), Answer("r", False), NOW).effects
    assert [(e.student, e.answer) for e in effects if isinstance(e, Answered)] == [("r", "no")]
    assert _placed(effects) == []


def test_leaving_records_the_absence_before_the_departure():
    s = _session(_regs(4, 4))
    effects = handle(s, EngineSettings(), RegularAbsent("R1"), datetime(2026, 11, 2, 10, 0)).effects
    assert [type(e) for e in effects] == [Absence, Left]
    assert effects[0].notice == "on_time" and effects[1].reason == "regular_no"
    # An invitee's cancel after the cutoff is late (engine-answers rule 6).
    placed = Placement("x", "R", "invitation", NOW)
    s2 = _session(_regs(4, 3), [("x", "R")], going_extra=[placed])
    effects = handle(s2, EngineSettings(), Cancel("x"), datetime(2026, 11, 3, 9, 0)).effects
    assert effects[0].notice == "late" and effects[1].reason == "cancel"


def test_a_no_show_after_the_class_is_late():
    s = _session(_regs(4, 4))
    effects = handle(s, EngineSettings(), NoShow("R1"), datetime(2026, 11, 3, 10, 30)).effects
    assert [(type(e), e.notice) for e in effects] == [(Absence, "late")]   # no Left: the roster stays


# --- wave W6: "sorry" and the re-offer (engine-answers rules 3, 4, 7) ------------------------------

def test_a_yes_whose_offer_filled_is_reoffered_for_a_side_a_tier_admits():
    # Scenario 1 at 19:08: a left-sider sent for the left, the left now full, the right open, and an
    # other-side tier admitting left-siders for the right: the same invitation is re-offered.
    from dataclasses import replace

    from padel_app.invitation_engine.effects import Message, Reoffered
    from padel_app.invitation_engine.settings import Tier

    settings = EngineSettings(tiers=EngineSettings().tiers + (Tier("pool", "other", 0),))
    s = _session(_regs(4, 3), [("l", "L")], [_inv("l", L)])
    effects = handle(s, settings, Answer("l", True), NOW).effects
    [re] = [e for e in effects if isinstance(e, Reoffered)]
    assert re.offer == frozenset({R}) and re.side_named == "R" and re.tier == 4
    assert [e.kind for e in effects if isinstance(e, Message)] == ["reoffer"]
    assert not any(isinstance(e, (Answered, Placed)) for e in effects)       # not a final answer
    # Without a tier that admits them for the right: "sorry".
    effects = handle(replace(s), EngineSettings(), Answer("l", True), NOW).effects
    assert [e.kind for e in effects if isinstance(e, Message)] == ["sorry"]


def test_a_late_yes_into_a_full_session_gets_sorry_and_stops_counting():
    from padel_app.invitation_engine.effects import Message, Sorry
    from padel_app.invitation_engine.timeline import counting

    s = _session(_regs(4, 4), [("r", "R")], [_inv("r", R)])
    effects = handle(s, EngineSettings(), Answer("r", True), NOW).effects
    assert [type(e) for e in effects] == [Sorry, Message] and effects[1].kind == "sorry"
    told = Invitation("r", frozenset({R}), None, 2, SENT, counts_until=SENT + timedelta(minutes=20), sorry_at=NOW)
    assert told.open and not counting(told, NOW)



def _engine(*regulars_sides, pool=()):
    from padel_app.invitation_engine.engine import Engine
    from padel_app.invitation_engine.store import MemoryStore

    store = MemoryStore()
    regs = [(_student(sid, side), side) for sid, side in regulars_sides]
    for sid, sides in pool:
        store.add_student(_student(sid, sides))
    store.add_session("S", 3, 8, START, regs, SENT)
    return Engine(store, EngineSettings()), store


def test_sorry_then_reopened_spot_is_reoffered():
    # ANSWERS-7: told "sorry" on a full session; a right regular says No; the same invitation is
    # re-offered, counts again, and the Yes then places them on the right.
    from padel_app.invitation_engine.effects import Invited, Message, Reoffered

    engine, store = _engine(*_regs(4, 3), pool=[("a", "R"), ("b", "R")])
    sent = [e for e in engine.tick(SENT) if isinstance(e, Invited)]
    assert {e.student for e in sent} == {"a", "b"}
    engine.handle("S", Answer("a", True), NOW)                               # a takes the right spot
    told = engine.handle("S", Answer("b", True), NOW + timedelta(minutes=1))
    assert [e.kind for e in told if isinstance(e, Message)] == ["sorry"]
    reopened = engine.handle("S", RegularAbsent("R1"), NOW + timedelta(minutes=5))
    assert [e.student for e in reopened if isinstance(e, Reoffered)] == ["b"]
    assert [e.kind for e in reopened if isinstance(e, Message)] == ["reoffer"]
    assert not [e for e in reopened if isinstance(e, Invited) and e.student == "b"]   # still one invitation
    placed = engine.handle("S", Answer("b", True), NOW + timedelta(minutes=6))
    assert [(e.student, e.side) for e in placed if isinstance(e, Placed)] == [("b", "R")]


def test_two_yes_for_the_last_spot_place_exactly_one():
    # ANSWERS-8 at the engine's level: requests are handled one at a time on a fresh snapshot.
    from padel_app.invitation_engine.effects import Message

    engine, store = _engine(*_regs(4, 3), pool=[("a", "R"), ("b", "R")])
    engine.tick(SENT)
    first = engine.handle("S", Answer("a", True), NOW)
    second = engine.handle("S", Answer("b", True), NOW)
    assert [e.student for e in first + second if isinstance(e, Placed)] == ["a"]
    assert [e.kind for e in second if isinstance(e, Message)] == ["sorry"]
    assert len(store.snapshot("S").going) == 8


# --- never two sessions at the same hour (rule 10, PAD-911) ------------------------------------

def test_a_yes_closes_the_same_hour_invitation():
    """ANSWERS-13's mechanism (the scenario is P34): the Yes closes the invitation to the session at
    the same start, not one later that day."""
    same = Elsewhere("B", START, _inv("x", R), 16, ())
    later = Elsewhere("C", START + timedelta(hours=2), _inv("x", R), 16, ())
    s = replace(_session(_regs(4, 3), [("x", "R")], [_inv("x", R)]), elsewhere=(same, later))
    effects = handle(s, EngineSettings(), Answer("x", True), NOW).effects
    assert _placed(effects) == [("x", "R", "invitation")]
    assert [(e.session, e.student) for e in effects if isinstance(e, InvitationClosed)] == [("B", "x")]


def test_second_same_hour_placement_is_refused():
    s = replace(_session(_regs(4, 3), [("x", "R")], [_inv("x", R)]), busy_same_time=frozenset({"x"}))
    assert handle(s, EngineSettings(), Answer("x", True), NOW).effects == ()


def test_direct_join_at_a_busy_hour_is_refused():
    s = _session(_regs(4, 3), [("x", "R")])
    on = EngineSettings(direct_join=True)
    assert _placed(handle(s, on, DirectJoin("x"), NOW).effects) == [("x", "R", "direct")]
    busy = replace(s, busy_same_time=frozenset({"x"}))
    effects = handle(busy, on, DirectJoin("x"), NOW).effects
    assert [type(e) for e in effects] == [Refused] and not _placed(effects)


@pytest.mark.skipif(os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
                    reason="needs two real connections")
@pytest.mark.parametrize("locked", [True, False], ids=["with_the_lock", "control_without_it"])
def test_last_spot_claimed_once_on_postgres(app, monkeypatch, locked):
    """ANSWERS-10 (rule 7), PAD-916: one spot left (the right side of a class of 2 whose regular plays
    left), two invitees answer Yes on two connections at once. Each thread's apply is held at its
    first ``engine_effects`` insert until the other reaches its own: with the session lock the
    second never gets there while the first is open, so it plans on the committed placement and is
    told "sorry"; the control drops the lock and must place both, or this test proves nothing."""
    import threading

    from sqlalchemy import event

    from padel_app.invitation_engine import Engine
    from padel_app.invitation_engine import requests as rq
    from padel_app.services import engine_store
    from padel_app.sql_db import db
    from padel_app.tests.test_pad916_engine_store import NOW, _seed

    with app.app_context():
        store, (a,), (reg, x, y) = _seed(app, side="right", capacity=2)
        offer = frozenset({SpotType("R", 3)})
        with store.unit((a,)):
            store.apply([fx.Invited(a, NOW, s, offer, "R", 0, NOW + timedelta(hours=1)) for s in (x, y)])
        db.session.remove()
    if not locked:
        monkeypatch.setattr(engine_store.TableStore, "_lock_student", staticmethod(lambda pid: None))
        real = engine_store.TableStore.unit

        def unlocked(self, sessions, students=()):
            return real(self, (), ())
        monkeypatch.setattr(engine_store.TableStore, "unit", unlocked)

    gate = threading.Barrier(2)

    def _hold(conn, cursor, statement, *_a, **_k):
        if statement.lstrip().upper().startswith("INSERT INTO ENGINE_EFFECTS"):
            try:
                gate.wait(timeout=3)
            except threading.BrokenBarrierError:
                pass

    errors = []

    def answer(student):
        try:
            with app.app_context():
                Engine(engine_store.TableStore(clock=lambda: NOW), EngineSettings()).handle(
                    a, rq.Answer(student, True), NOW + timedelta(minutes=1))
                db.session.remove()
        except BaseException as exc:  # noqa: BLE001 — surfaced below
            errors.append(exc)

    with app.app_context():
        engine = db.engine
    event.listen(engine, "before_cursor_execute", _hold)
    try:
        threads = [threading.Thread(target=answer, args=(s,)) for s in (x, y)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=60)
    finally:
        event.remove(engine, "before_cursor_execute", _hold)
    assert not any(t.is_alive() for t in threads) and not errors, errors

    with app.app_context():
        going = {p.student for p in engine_store.TableStore(clock=lambda: NOW).snapshot(a).going}
    if locked:
        assert going == {reg, x} or going == {reg, y}
    else:
        assert going == {reg, x, y}


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-ANSWERS-21")
def test_joining_the_other_list_is_refused_already_waiting():
    """engine-answers rule 12: one waiting-list entry per student per session, on either list. (The
    store's own refusal of a second entry, ``StoreConflict``, is the table store's test.)"""
    coach = WaitingListEntry("C", "coach", SENT, side="R")
    student = WaitingListEntry("W", "students", SENT, sides="own")
    s = _session(_regs(4, 3), [("C", "R"), ("W", "R")], waiting_list=[coach, student])
    refused = Refused("S", NOW, "C", "waiting_list", "already_on_list")
    assert handle(s, EngineSettings(), JoinWaitingList("C", "students", sides="both"), NOW).effects == (refused,)
    assert handle(s, EngineSettings(), JoinWaitingList("C", "coach", side="L"), NOW).effects == (refused,)
    assert handle(s, EngineSettings(), JoinWaitingList("W", "coach", side="R"), NOW).effects == \
        (Refused("S", NOW, "W", "waiting_list", "already_on_list"),)


def test_joins_are_refused_with_a_code():
    """classes.join-requests NJ1 (#960): a refused join carries a code the route answers as 409, never
    text; direct join being off is no refusal (the app's request waits for the coach)."""
    on = EngineSettings(direct_join=True)
    s = _session(_regs(3, 4), [("x", "R"), ("low", "R")])                      # the right side is full
    s = replace(s, students={**s.students, "low": Student("low", 6, frozenset("R"))})

    def code(snapshot, request, settings=on, now=NOW):
        [refused] = handle(snapshot, settings, request, now).effects
        return refused.reason, refused.sides

    assert handle(s, EngineSettings(), DirectJoin("x"), NOW).effects == ()
    assert code(s, DirectJoin("x")) == ("side_full", frozenset({"L"}))
    assert code(s, DirectJoin("L1")) == ("already_enrolled", frozenset())
    assert code(replace(s, busy_same_time=frozenset({"x"})), DirectJoin("x")) == ("busy_same_hour", frozenset())
    assert code(s, DirectJoin("low")) == ("ineligible", frozenset())
    assert code(s, DirectJoin("x"), now=datetime(2026, 11, 3, 10, 30)) == ("class_closed", frozenset())
    assert code(s, JoinWaitingList("low", "students", sides="own")) == ("ineligible", frozenset())
    assert code(s, JoinWaitingList("L1", "coach", side="R")) == ("already_enrolled", frozenset())
