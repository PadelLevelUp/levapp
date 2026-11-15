"""notifications.engine-settings (PAD-906, wave W1): the timing shape, its floor and Method B's parts.

Each test is one acceptance criterion of specflow/impl/notifications/engine-settings.spec.md.
"""
from datetime import datetime, time, timedelta

import pytest

from padel_app.invitation_engine import Engine, EngineSettings, MemoryStore, SettingsError
from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine import requests as rq
from padel_app.invitation_engine.constants import ENGINE_T_FLOOR, method_b_parts, method_b_share
from padel_app.invitation_engine.messages import due
from padel_app.invitation_engine.planner import plan
from padel_app.invitation_engine.settings import AttendanceRequest, FirstInvite, Timing, TimingPair
from padel_app.invitation_engine.snapshot import SessionSnapshot, Student
from padel_app.invitation_engine.timeline import attendance_request_at, first_invite_at
from padel_app.invitation_engine.timeline import method_b_round_t

BELOW = ENGINE_T_FLOOR - timedelta(seconds=1)


@pytest.mark.parametrize("timing, key", [
    (Timing(between_rounds=BELOW), "timing.between_rounds"),
    (Timing(between_groups=BELOW), "timing.between_groups"),
    (Timing("per_tier", per_tier=(None, TimingPair(between_rounds=BELOW))), r"timing.per_tier\[1\].between_rounds"),
    (Timing("per_tier", per_tier=(TimingPair(between_groups=BELOW),)), r"timing.per_tier\[0\].between_groups"),
])
def test_timing_below_the_floor_is_refused(timing, key):
    with pytest.raises(SettingsError, match=key):
        EngineSettings(timing=timing)
    # The floor itself is accepted.
    EngineSettings(timing=Timing("per_tier", ENGINE_T_FLOOR, ENGINE_T_FLOOR,
                                 (TimingPair(ENGINE_T_FLOOR, ENGINE_T_FLOOR),)))


def test_method_b_parts():
    assert method_b_parts(4) == (9, 8, 7, 6)
    assert method_b_parts(3) == (6, 5, 4)
    assert method_b_parts(2) == (3, 2)
    assert method_b_parts(5) == (12, 11, 10, 9, 8)
    useful = timedelta(hours=9, minutes=50)
    assert method_b_share(useful, 1, 0) == useful
    for n in range(2, 7):
        parts = method_b_parts(n)
        shares = [method_b_share(useful, n, i) for i in range(n)]
        assert all(s == useful * (3 * (n - 1) - i) / sum(parts) for i, s in enumerate(shares))
        assert parts[-1] * 3 == parts[0] * 2, "the last tier gets two thirds of the first"
        assert abs(sum(shares, timedelta()) - useful) < timedelta(seconds=1)
    # Scenario 86's figure (constants.md): 6:5:4 of 9 h 50 min gives the first tier 3 h 56 min.
    assert method_b_share(useful, 3, 0) == timedelta(hours=3, minutes=56)
    # Inside one tier (PAD-911): the last round waits the last third of the share, the rounds before it
    # split the rest by the parts for n = rounds - 1. Scenario 84: 3 h in 3 rounds is 72, 48, 60 min.
    share = timedelta(hours=3)
    assert [method_b_round_t(share, 3, i) for i in range(3)] == [timedelta(minutes=m) for m in (72, 48, 60)]
    assert [method_b_round_t(share, 2, i) for i in range(2)] == [timedelta(hours=2), timedelta(hours=1)]
    assert method_b_round_t(share, 1, 0) == share
    four = [method_b_round_t(share, 4, i) for i in range(4)]
    assert four[:3] == [share * 2 / 3 * p / 15 for p in (6, 5, 4)] and four[3] == share / 3
    assert sum(four, timedelta()) == share


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-SETTINGS-19")
def test_settings_are_looked_up_per_session_at_every_call():
    """Ruling D9 (PAD-915): the engine takes a settings lookup, asked per session, so two coaches'
    sessions plan with their own settings in one tick, and a changed setting shows at the next call."""
    t0, start = datetime(2026, 11, 1, 19, 0), datetime(2026, 11, 3, 10, 30)
    store = MemoryStore()
    for i in range(1, 7):
        store.add_student(Student(f"P{i}", 2, frozenset({"R"})))
    for session in ("A", "B"):                     # one right spot each, the same pool at level 2
        store.add_session(session, 3, 4, start, [(Student(f"{session}-{v}{n}", 3, frozenset({v})), v)
                                                 for v, n in (("L", 1), ("L", 2), ("R", 1))], t0)
    per_coach = {"A": EngineSettings(invites_per_spot=1), "B": EngineSettings(invites_per_spot=2)}
    asked = []

    def lookup(session):
        asked.append(session)
        return per_coach[session]

    engine = Engine(store, lookup)
    sent = engine.tick(t0)
    invited = {s: [e.student for e in sent if isinstance(e, fx.Invited) and e.session == s] for s in "AB"}
    assert (len(invited["A"]), len(invited["B"])) == (1, 2)
    assert set(asked) == {"A", "B"}
    # A coach's change is read at the next call; with a lookup UpdateSettings only re-plans, and only
    # the sessions it names (the coach's).
    per_coach["A"] = EngineSettings(invites_per_spot=3)
    asked.clear()
    more = engine.handle("A", rq.UpdateSettings(EngineSettings(), sessions=("A",)), t0)
    assert engine.settings is lookup and asked == ["A"]
    assert len([e for e in more if isinstance(e, fx.Invited) and e.session == "A"]) == 2
    assert {e.session for e in more} == {"A"}
    # Naming none re-plans every session (the harness, one coach).
    asked.clear()
    engine.handle("A", rq.UpdateSettings(EngineSettings()), t0)
    assert set(asked) == {"A", "B"}


def _session(start):
    return SessionSnapshot("A", 3, 4, start, regulars=(), going=())


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-SETTINGS-20")
def test_hours_before_counts_real_hours_across_a_clock_change():
    """engine-settings rule 10 (PAD-915): ``hours_before`` is N real hours before the class's real
    start. Lisbon leaves summer time on 2026-10-25 at 02:00: a 10:00 class that Sunday is 10:00 UTC,
    and 24 real hours before is Saturday 10:00 UTC, 11:00 on Saturday's wall clock."""
    settings = EngineSettings(first_invite=FirstInvite(type="hours_before", hours=24),
                              attendance_request=AttendanceRequest(type="hours_before", hours=3))
    from padel_app.scheduler import _fire_time_utc

    sunday = _session(datetime(2026, 10, 25, 10, 0))
    assert first_invite_at(sunday, settings) == datetime(2026, 10, 24, 10, 0)
    assert attendance_request_at(sunday, settings) == datetime(2026, 10, 25, 7, 0)
    assert first_invite_at(sunday, settings) == _fire_time_utc(sunday.start, {"type": "hours_before", "value": 24})
    assert attendance_request_at(sunday, settings) == _fire_time_utc(sunday.start, {"type": "hours_before", "value": 3})
    with pytest.raises(SettingsError, match="first_invite"):
        EngineSettings(first_invite=FirstInvite(type="hours_before", hours=-1))
    with pytest.raises(SettingsError, match="attendance_request.type"):
        EngineSettings(attendance_request=AttendanceRequest(type="weeks_before"))


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-SETTINGS-21")
def test_days_before_at_time_is_the_wall_date_at_lisbon_time():
    """engine-settings rule 10 (PAD-915): the day forms take the class's own wall date minus N days,
    at the coach's Lisbon time; ``days_before`` and ``days_before_at_time`` are the same, as in the
    scheduler. A 00:30 class gets its day-before slot on the calendar day before."""
    from padel_app.scheduler import _fire_time_utc

    for kind in ("days_before", "days_before_at_time"):
        settings = EngineSettings(first_invite=FirstInvite(2, time(19, 0), kind),
                                  attendance_request=AttendanceRequest(1, time(17, 0), type=kind))
        summer = _session(datetime(2026, 7, 10, 0, 30))                   # UTC+1
        assert first_invite_at(summer, settings) == datetime(2026, 7, 8, 18, 0)
        assert attendance_request_at(summer, settings) == datetime(2026, 7, 9, 16, 0)
        winter = _session(datetime(2026, 11, 3, 10, 30))                  # UTC+0
        assert first_invite_at(winter, settings) == datetime(2026, 11, 1, 19, 0)
        late = _session(datetime(2026, 7, 10, 23, 30))                    # the criterion's 23:30 class
        assert attendance_request_at(late, settings) == datetime(2026, 7, 9, 16, 0)
        for session in (summer, winter, late):                             # the scheduler's own instants
            assert first_invite_at(session, settings) == _fire_time_utc(
                session.start, {"type": kind, "days": 2, "time": "19:00"})
            assert attendance_request_at(session, settings) == _fire_time_utc(
                session.start, {"type": kind, "days": 1, "time": "17:00"})


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-SETTINGS-22")
def test_none_starts_invitations_at_creation_and_sends_no_attendance_request():
    """engine-settings rule 10 (PAD-915): ``none`` for the first invitation opens the window from the
    session's creation (the first run plans); for the attendance request, none is ever sent, and
    automatic entry runs until the class starts."""
    start = datetime(2026, 11, 3, 10, 30)
    early = datetime(2026, 10, 20, 9, 0)                                   # two weeks before the class
    store = MemoryStore()
    store.add_student(Student("P1", 3, frozenset({"R"})))
    store.add_session("A", 3, 4, start, [(Student(f"L{i}", 3, frozenset({"L"})), "L") for i in (1, 2)]
                      + [(Student("R1", 3, frozenset({"R"})), "R")], early)
    off = EngineSettings(first_invite=FirstInvite(type="none"), attendance_request=AttendanceRequest(type="none"))
    assert first_invite_at(store.snapshot("A"), off) is None
    assert attendance_request_at(store.snapshot("A"), off) is None
    sent = Engine(store, off).tick(early)
    assert [e.student for e in sent if isinstance(e, fx.Invited)] == ["P1"]
    # Control: the default shape plans nothing two weeks out.
    assert not plan(store.snapshot("A"), EngineSettings(), early).effects
    # No attendance request at any run up to the class's start, the default slot included.
    engine, at = Engine(store, off), early
    while at < datetime(2026, 11, 3, 10, 30):
        assert not [e for e in engine.tick(at) if isinstance(e, fx.AttendanceRequested)], at
        at += timedelta(hours=1)
    assert [e for e in due(store.snapshot("A"), EngineSettings(), datetime(2026, 11, 2, 17, 0))
            if isinstance(e, fx.AttendanceRequested)], "control: the default slot asks the regulars"
    # Automatic entry has no attendance-request boundary: a list member still goes in on the class's day.
    store.apply([fx.WaitingListJoined("A", early, "W1", "students", sides="both")])
    store.add_student(Student("W1", 3, frozenset({"R"})))
    morning = datetime(2026, 11, 3, 9, 0)
    auto = off.with_changes(auto_entry_before_attendance_request=True)
    placed = [e.student for e in plan(store.snapshot("A"), auto, morning).effects if isinstance(e, fx.Placed)]
    assert placed == ["W1"]
    assert not [e for e in plan(store.snapshot("A"), auto.with_changes(attendance_request=AttendanceRequest()),
                                morning).effects if isinstance(e, fx.Placed)], "control: past the default slot"


def _freed_session(**settings):
    """Capacity 8, six regulars (three a side), the class on 3 Nov; R-3 says No: one right spot freed,
    two never held."""
    store = MemoryStore()
    for sid, side in (("PL1", "L"), ("PL2", "L"), ("PR1", "R"), ("PR2", "R"), ("PR3", "R")):
        store.add_student(Student(sid, 3, frozenset({side})))
    store.add_session("A", 3, 8, datetime(2026, 11, 3, 10, 30),
                      [(Student(f"{v}-{i}", 3, frozenset({v})), v) for v in "LR" for i in (1, 2, 3)],
                      datetime(2026, 11, 1, 18, 0))
    engine = Engine(store, EngineSettings(invites_per_spot=1, **settings))
    engine.handle("A", rq.RegularAbsent("R-3"), datetime(2026, 11, 1, 18, 30))
    return store, engine


def _invited_types(effects):
    return sorted(next(iter(e.offer)).side or "-" for e in effects if isinstance(e, fx.Invited))


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-SETTINGS-23")
def test_fill_never_held_off_invites_only_for_freed_spots():
    """engine-settings rule 11: with ``fill_never_held`` off the planner invites for the spot R-3 freed
    only; on, for all three open spots."""
    t0 = datetime(2026, 11, 1, 19, 0)
    _, off = _freed_session(fill_never_held=False)
    assert _invited_types(off.tick(t0)) == ["R"]
    _, on = _freed_session()
    assert len(_invited_types(on.tick(t0))) == 3


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-SETTINGS-24")
def test_fill_never_held_off_limits_direct_join_and_automatic_entry():
    """engine-settings rule 11: direct join and automatic entry fill freed spots only. A {L, R}
    regular frees an either spot; each going non-regular takes back one, its own side first."""
    from padel_app.invitation_engine.planner import freed_spots
    from padel_app.invitation_engine.snapshot import Placement

    regs = [Student(f"L-{i}", 3, frozenset({"L"})) for i in (1, 2, 3)] + \
        [Student("R-1", 3, frozenset({"R"})), Student("R-2", 3, frozenset({"R"})), Student("B-1", 3, frozenset({"L", "R"}))]
    at = datetime(2026, 11, 1, 18, 0)
    going = tuple(Placement(st.id, next(iter(st.sides)), "regular", at) for st in regs[:4]) + \
        (Placement("ACC", "R", "invitation", at),)                              # R-2 and B-1 absent, a right acceptor
    snap = SessionSnapshot("A", 3, 8, datetime(2026, 11, 3, 10, 30), regulars=tuple(regs), going=going,
                           absent=frozenset({"R-2", "B-1"}))
    assert freed_spots(snap) == ({"L": 0, "R": 0}, 1)                            # exactly one either spot

    t = datetime(2026, 11, 1, 18, 40)
    store, engine = _freed_session(fill_never_held=False, direct_join=True)
    [refused] = engine.handle("A", rq.DirectJoin("PL1"), t)                      # the left spots were never held
    assert (refused.reason, refused.sides) == ("side_full", frozenset({"R"}))       # only the freed side
    assert [e.how for e in engine.handle("A", rq.DirectJoin("PR1"), t) if isinstance(e, fx.Placed)] == ["direct"]
    assert [e.reason for e in engine.handle("A", rq.DirectJoin("PR2"), t)
            if isinstance(e, fx.Refused)] == ["side_full"]                       # the freed spot is taken

    store, engine = _freed_session(fill_never_held=False, auto_entry_before_attendance_request=True)
    store.apply([fx.WaitingListJoined("A", t, sid, "coach") for sid in ("PL1", "PR1", "PR2")])
    placed = [e.student for e in engine.handle("A", rq.Appear("PL1"), t) if isinstance(e, fx.Placed)]
    assert len(placed) == 1                                                      # one freed spot, one entry


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-SETTINGS-26")
def test_a_regular_the_coach_removed_frees_their_spot():
    """engine-settings rule 11 with engine-answers rule 14: with ``fill_never_held`` off, a full class
    whose coach removes a right regular from this one session gets that one right spot invited."""
    store = MemoryStore()
    for sid, side in (("PL", "L"), ("PR", "R")):
        store.add_student(Student(sid, 3, frozenset({side})))
    store.add_session("A", 3, 8, datetime(2026, 11, 3, 10, 30),
                      [(Student(f"{v}-{i}", 3, frozenset({v})), v) for v in "LR" for i in (1, 2, 3, 4)],
                      datetime(2026, 11, 1, 18, 0))
    engine = Engine(store, EngineSettings(invites_per_spot=1, fill_never_held=False))
    t0 = datetime(2026, 11, 1, 19, 0)
    assert engine.tick(t0) == []                                              # full, nothing never held
    removed = engine.handle("A", rq.CoachExcludes("R-4"), t0 + timedelta(minutes=1))
    assert _invited_types(removed) == ["R"]
    assert store.snapshot("A").coach_removed == {"R-4"}
