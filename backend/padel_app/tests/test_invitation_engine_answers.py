"""notifications.engine-answers (PAD-908, wave W3): a Yes is placed within its offer, a named side
binds, the student's own side comes first, a flexible Yes goes where it is hardest to fill, and an
accept with no open invitation changes nothing.

Scenario pins: ANSWERS-1 is P06, ANSWERS-2 is P15, ANSWERS-3 is P24.
"""
from datetime import datetime, timedelta

from padel_app.invitation_engine import EngineSettings
from padel_app.invitation_engine.answers import handle
from padel_app.invitation_engine.effects import Absence, Answered, Left, Placed, WaitingListLeft
from padel_app.invitation_engine.requests import Answer, Cancel, NoShow, RegularAbsent
from padel_app.invitation_engine.snapshot import (
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
    assert effects[0].kind == "justified" and effects[1].reason == "regular_no"
    # An invitee's cancel after the cutoff is unjustified (engine-answers rule 6).
    placed = Placement("x", "R", "invitation", NOW)
    s2 = _session(_regs(4, 3), [("x", "R")], going_extra=[placed])
    effects = handle(s2, EngineSettings(), Cancel("x"), datetime(2026, 11, 3, 9, 0)).effects
    assert effects[0].kind == "unjustified" and effects[1].reason == "cancel"


def test_a_no_show_after_the_class_is_unjustified():
    s = _session(_regs(4, 4))
    effects = handle(s, EngineSettings(), NoShow("R1"), datetime(2026, 11, 3, 10, 30)).effects
    assert [(type(e), getattr(e, "kind", None)) for e in effects][:1] == [(Absence, "unjustified")]
