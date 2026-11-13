"""notifications.engine-answers rule 15 and engine-tiers rule 4 (PAD-932; the owner's decision 17): the
coach invites a student by hand on a new-engine class. The engine sends a counting invitation of the
coach's-list tier at once, or refuses with a reason, or reopens the student's one row (D1).
"""
from datetime import datetime, time, timedelta

import pytest

from padel_app.invitation_engine import Engine, EngineSettings, MemoryStore
from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine import timeline
from padel_app.invitation_engine.planner import plan
from padel_app.invitation_engine.requests import Answer, CoachInvites
from padel_app.invitation_engine.settings import Eligibility
from padel_app.invitation_engine.snapshot import SpotType, Student

T0 = datetime(2026, 11, 1, 19, 0)
START = datetime(2026, 11, 3, 10, 30)                 # Lisbon wall-clock; UTC+0 in November
QUIET = datetime(2026, 11, 2, 1, 0)                   # inside the default quiet hours (00:00-07:00)


def _student(sid, side, level=3):
    return Student(sid, level, frozenset({"L", "R"}) if side == "both" else frozenset({side}))


def _store(left, right, pool=(), level=3, session="A", start=START):
    store = MemoryStore()
    for st in pool:
        store.add_student(st)
    store.add_session(session, level, 8, start, [(_student(f"{session}L{i}", "L", level), "L") for i in range(1, left + 1)]
                      + [(_student(f"{session}R{i}", "R", level), "R") for i in range(1, right + 1)], T0)
    return store


def _by_type(effects, kind):
    return {e.student: e for e in effects if type(e) is kind}


def _counting(store, now):
    return sorted(i.student for i in store.snapshot("A").invitations if timeline.counting(i, now))


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-ANSWERS-30")
def test_a_coach_invitation_counts_and_is_answered_like_any():
    settings = EngineSettings(max_at_a_time=2)
    left = frozenset({SpotType("L", 3)})
    store = _store(3, 4, pool=[_student("P1", "L"), _student("P2", "L"), _student("P3", "L"),
                               _student("B", "both", level=6)])                  # B is below the bar
    store.apply([fx.Invited("A", T0, sid, left, None, 3, QUIET + timedelta(hours=12)) for sid in ("P1", "P2")])
    engine = Engine(store, settings)
    out = engine.handle("A", CoachInvites(("B",)), QUIET)
    invited = _by_type(out, fx.Invited)
    assert list(invited) == ["B"]                                                  # at once, in quiet hours
    b = invited["B"]
    assert (b.tier, b.manual, b.offer, b.side_named) == (0, True, left, None)       # the coach's list, {left}
    assert b.counts_until == timeline.counts_until(settings, QUIET, settings.timing_for(0).between_groups)
    assert store.snapshot("A").invitation("B").manual
    assert _counting(store, QUIET) == ["B", "P1", "P2"]                            # 3 counting, above M = 2
    # The planner counts it toward the left type's budget: X = 3 is full, P3 is not asked.
    later = datetime(2026, 11, 2, 7, 5)
    assert not [e for e in plan(store.snapshot("A"), settings.with_changes(max_at_a_time=12), later).effects
                if isinstance(e, fx.Invited)]
    yes = engine.handle("A", Answer("B", True), later)
    assert [(e.student, e.side, e.how) for e in yes if isinstance(e, fx.Placed)] == [("B", "L", "invitation")]


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-ANSWERS-31")
def test_a_coach_invitation_refuses_with_a_reason_or_reopens():
    settings = EngineSettings(quiet_hours=None)
    right = frozenset({SpotType("R", 3)})
    pool = [_student(sid, side) for sid, side in
            (("LEFTY", "L"), ("BUSY", "R"), ("HOLD", "R"), ("STALE", "R"), ("NO", "both"))]
    store = _store(4, 3, pool=pool)                                               # one open right spot
    store.add_session("B", 3, 8, START, [(store.snapshot("A").students["BUSY"], "R")], T0)  # placed at the same hour
    store.apply([fx.Invited("A", T0, "HOLD", right, None, 3, T0 + timedelta(hours=3)),
                 fx.Invited("A", T0, "STALE", right, None, 3, T0 + timedelta(minutes=20)),
                 fx.Invited("A", T0, "NO", right, None, 3, T0 + timedelta(hours=3)),
                 fx.Answered("A", T0 + timedelta(minutes=5), "NO", "no", "invitation")])
    now = T0 + timedelta(hours=1)
    out = Engine(store, settings).handle("A", CoachInvites(("LEFTY", "AL1", "BUSY", "HOLD", "STALE", "NO")), now)
    refused = {e.student: (e.action, e.reason) for e in out if isinstance(e, fx.Refused)}
    assert refused == {"LEFTY": ("coach_invite", "no_open_spot"), "AL1": ("coach_invite", "already_in_class"),
                       "BUSY": ("coach_invite", "same_hour"), "HOLD": ("coach_invite", "already_invited")}
    reopened = _by_type(out, fx.Reopened)
    assert sorted(reopened) == ["NO", "STALE"]
    assert {(e.tier, e.manual, e.offer, e.side_named) for e in reopened.values()} == {(0, True, right, None)}
    assert sorted(e.student for e in out if isinstance(e, fx.Message) and e.kind == "invite") == ["NO", "STALE"]
    assert not _by_type(out, fx.Invited)
    snap = store.snapshot("A")
    for sid in ("STALE", "NO"):                                                   # one row each, counting anew
        assert [i.student for i in snap.invitations].count(sid) == 1
        assert snap.invitation(sid).manual and timeline.counting(snap.invitation(sid), now)


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIERS-23")
def test_a_coach_invitation_skips_the_bar_and_offers_what_the_sides_fit():
    settings = EngineSettings(quiet_hours=None, eligibility=Eligibility(levels_above=1))
    store = _store(3, 3, level=4, pool=[_student("FLEX", "both", level=2), _student("RIGHTY", "R", level=2)])
    out = Engine(store, settings).handle("A", CoachInvites(("FLEX", "RIGHTY")), T0)
    invited = _by_type(out, fx.Invited)
    assert {sid: ({o.side for o in e.offer}, e.side_named, e.tier, e.manual) for sid, e in invited.items()} == {
        "FLEX": ({"L", "R"}, None, 0, True), "RIGHTY": ({"R"}, None, 0, True)}


def test_a_coach_invitation_without_a_coach_list_tier_still_sends():
    # Decision (N, PAD-932): a coach whose tiers name no coach's list still invites by hand; the
    # invitation has no tier and takes the fixed pair's between_groups.
    from padel_app.invitation_engine.settings import Tier
    settings = EngineSettings(quiet_hours=None, tiers=(Tier("pool", "same", 0),))
    store = _store(3, 4, pool=[_student("X", "L")])
    out = Engine(store, settings).handle("A", CoachInvites(("X",)), T0)
    x = _by_type(out, fx.Invited)["X"]
    assert (x.tier, x.manual, x.counts_until) == (None, True, T0 + settings.timing.between_groups)


def test_an_unknown_student_is_a_type_error_of_the_caller():
    store = _store(3, 4)
    with pytest.raises(KeyError):
        Engine(store, EngineSettings()).handle("A", CoachInvites(("NOBODY",)), T0)
