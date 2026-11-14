"""notifications.engine-timeline: an invitation's T, fixed at send (PAD-906, wave W1), and quiet
hours pausing it (PAD-907, wave W4).

TIMELINE-2 runs a whole engine (wave W2); the others call the clock's functions. TIMELINE-1 and
TIMELINE-5 are pinned by scenarios P30 and 80 once the planner runs; the tests below pin the clock
they rest on.
"""
from dataclasses import replace
from datetime import datetime, time, timedelta

import pytest

from padel_app.invitation_engine import EngineSettings
from padel_app.invitation_engine.settings import Timing, TimingPair
from padel_app.invitation_engine.snapshot import Invitation, SpotType
from padel_app.invitation_engine.timeline import counting, counts_until, is_quiet, t_at_send

SENT = datetime(2026, 11, 1, 19, 0)


def test_equal_settings_are_the_single_t():
    t = timedelta(minutes=45)
    settings = EngineSettings(timing=Timing("fixed", t, t))
    assert {t_at_send(settings, tier, left) for tier in range(4) for left in (True, False)} == {t}
    assert counts_until(settings, SENT, t) == SENT + t


def test_t_at_send_picks_between_rounds_while_the_tier_has_uninvited_candidates():
    settings = EngineSettings(timing=Timing("per_tier", timedelta(minutes=20), timedelta(hours=1),
                                            (None, TimingPair(timedelta(minutes=5), timedelta(minutes=30)))))
    assert t_at_send(settings, 0, True) == timedelta(minutes=20)
    assert t_at_send(settings, 0, False) == timedelta(hours=1)
    assert t_at_send(settings, 1, True) == timedelta(minutes=5)
    assert t_at_send(settings, 1, False) == timedelta(minutes=30)
    progressive = EngineSettings(timing=Timing("progressive"))
    assert t_at_send(progressive, 2, True, method_b_share=timedelta(hours=3)) == timedelta(hours=3)


def test_t_at_send_follows_the_tier_state():
    from padel_app.invitation_engine import Engine, MemoryStore
    from padel_app.invitation_engine import effects as fx
    from padel_app.invitation_engine.settings import Tier
    from padel_app.invitation_engine.snapshot import Student

    settings = EngineSettings(timing=Timing("fixed", timedelta(minutes=20), timedelta(hours=1)),
                              tiers=(Tier("pool", "same", 0), Tier("pool", "other", 0)))
    store = MemoryStore()
    for i in range(1, 5):
        store.add_student(Student(f"R{i}", 3, frozenset({"R"})))
    store.add_student(Student("L1", 3, frozenset({"L"})))
    store.add_session("A", 3, 8, datetime(2026, 11, 3, 10, 30),
                      [(Student(f"L-{i}", 3, frozenset({"L"})), "L") for i in range(1, 5)]
                      + [(Student(f"R-{i}", 3, frozenset({"R"})), "R") for i in range(1, 4)], SENT)
    engine = Engine(store, settings)

    def sent(at):
        return [(e.student, e.tier, e.counts_until) for e in engine.tick(at) if isinstance(e, fx.Invited)]

    first = sent(SENT)
    assert [(s, t) for s, t, _ in first] == [("R1", 0), ("R2", 0), ("R3", 0)]
    assert {u for *_, u in first} == {SENT + timedelta(minutes=20)}     # the tier still has R4: between_rounds
    assert sent(SENT + timedelta(minutes=19)) == []
    assert sent(SENT + timedelta(minutes=20)) == [("R4", 0, SENT + timedelta(hours=1, minutes=20))]  # tier emptied
    assert sent(SENT + timedelta(hours=1, minutes=19)) == []
    assert [(s, t) for s, t, _ in sent(SENT + timedelta(hours=1, minutes=20))] == [("L1", 1)]     # the next tier


NIGHT = EngineSettings(quiet_hours=(time(22, 0), time(7, 0)))
HOUR = timedelta(hours=1)


def test_quiet_hours_pause_counting():
    # S30: sent 21:30 with quiet hours 22:00-07:00 and T one hour; Lisbon is UTC+0 in November.
    assert counts_until(NIGHT, datetime(2026, 11, 1, 21, 30), HOUR) == datetime(2026, 11, 2, 7, 30)
    assert counts_until(NIGHT, datetime(2026, 11, 1, 20, 30), HOUR) == datetime(2026, 11, 1, 21, 30)
    # Sent inside quiet hours (a re-offer to a Yes at night): it starts counting at their end.
    assert counts_until(NIGHT, datetime(2026, 11, 2, 3, 0), HOUR) == datetime(2026, 11, 2, 8, 0)
    # A long T resumes after each night: 1 h before 22:00, 15 h the next day, 1 h after
    # the second night.
    assert counts_until(NIGHT, datetime(2026, 11, 1, 21, 0), timedelta(hours=17)) == datetime(2026, 11, 3, 8, 0)


def test_quiet_hours_are_lisbon_wall_clock():
    # Summer: Lisbon is UTC+1, so 21:30 wall-clock is 20:30 UTC, and 07:30 wall-clock is 06:30 UTC.
    assert counts_until(NIGHT, datetime(2026, 7, 1, 20, 30), HOUR) == datetime(2026, 7, 2, 6, 30)
    assert is_quiet(NIGHT, datetime(2026, 7, 1, 21, 0)) and not is_quiet(NIGHT, datetime(2026, 7, 1, 20, 59))


def test_the_default_window_does_not_cross_midnight():
    settings = EngineSettings()                       # quiet hours 00:00-07:00
    sent = datetime(2026, 11, 2, 23, 50)
    assert counts_until(settings, sent, timedelta(minutes=20)) == datetime(2026, 11, 3, 7, 10)
    assert is_quiet(settings, datetime(2026, 11, 3, 0, 0)) and not is_quiet(settings, datetime(2026, 11, 3, 7, 0))
    none = EngineSettings(quiet_hours=None)
    assert not is_quiet(none, datetime(2026, 11, 3, 3, 0))
    assert counts_until(none, datetime(2026, 11, 3, 3, 0), HOUR) == datetime(2026, 11, 3, 4, 0)


def test_a_no_never_changes_another_invitations_t():
    # TIMELINE-5 at the clock's level: counting reads only the invitation's own counts_until.
    first = Invitation("A", frozenset({SpotType("R", 3)}), None, 0, SENT,
                       counts_until=SENT + timedelta(minutes=20))
    other = replace(first, student="B", answer="no", answered_at=SENT + timedelta(minutes=10))
    assert other.answer == "no"
    assert counting(first, SENT + timedelta(minutes=19))
    assert not counting(first, SENT + timedelta(minutes=20))
    assert first.open and not counting(replace(first, answer="yes"), SENT + timedelta(minutes=5))
    assert counting(replace(first, counts_until=None), SENT + timedelta(days=1))


def test_method_b_useful_time_runs_from_the_opening_without_quiet_hours():
    # Scenario 83 (coordinator ruling): a spot opening at 15:30 the day before a 10:30 class, with
    # last_invite_at 08:30 and quiet hours 00:00-07:00, has 17 h minus 7 h = 10 h of useful time.
    from padel_app.invitation_engine.snapshot import SessionSnapshot
    from padel_app.invitation_engine.timeline import useful_time

    s = SessionSnapshot("S", 3, 16, datetime(2026, 11, 3, 10, 30), regulars=(), going=())
    assert useful_time(s, EngineSettings(), datetime(2026, 11, 2, 15, 30)) == timedelta(hours=10)
    # 87: a spot opening at 07:30 on class day has one hour.
    assert useful_time(s, EngineSettings(), datetime(2026, 11, 3, 7, 30)) == timedelta(hours=1)


def _method_b_schedule(opening: datetime, n: int, ranks: range) -> list[datetime]:
    """When each tier's invitations go out under Method B: the next tier starts when the previous
    tier's T, computed at its send by ``method_b_t`` and paused by quiet hours, runs out."""
    from padel_app.invitation_engine.snapshot import SessionSnapshot
    from padel_app.invitation_engine.timeline import method_b_t

    s = SessionSnapshot("S", 3, 16, datetime(2026, 11, 3, 10, 30), regulars=(), going=())
    settings = EngineSettings(timing=Timing("progressive"))
    out, at = [], opening
    for rank in ranks:
        out.append(at)
        at = counts_until(settings, at, method_b_t(s, settings, at, n, rank))
    out.append(at)
    return out


def _hm(*pairs):
    return [datetime(2026, 11, d, h, m) for d, h, m in pairs]


def test_method_b_t_reproduces_the_pdf_schedules():
    # engine-settings rule 2 (amended) with the coordinator's tier count, against the PDF's own times.
    # 83: four tiers, 10 h from 15:30, 9:8:7:6; the last runs into quiet hours and ends at 08:30.
    assert _method_b_schedule(datetime(2026, 11, 2, 15, 30), 4, range(4)) == _hm(
        (2, 15, 30), (2, 18, 30), (2, 21, 10), (2, 23, 30), (3, 8, 30))
    # 85: three tiers, 6:5:4 of the same 10 h.
    assert _method_b_schedule(datetime(2026, 11, 2, 15, 30), 3, range(3)) == _hm(
        (2, 15, 30), (2, 19, 30), (2, 22, 50), (3, 8, 30))
    # 87: an opening at 07:30 on class day leaves 1 h: 18, 16, 14 and 12 minutes.
    assert _method_b_schedule(datetime(2026, 11, 3, 7, 30), 4, range(4)) == _hm(
        (3, 7, 30), (3, 7, 48), (3, 8, 4), (3, 8, 18), (3, 8, 30))


def test_method_b_t_resplits_after_a_whole_tier_refuses():
    # 86: everyone in group 3 says No at 15:40, so it leaves the split; the 9 h 50 m left go 6:5:4
    # over the three tiers that remain. Group 5's T ends at 22:52:40, so the next minute's run, at
    # 22:53, invites group 6, as the PDF says.
    times = _method_b_schedule(datetime(2026, 11, 2, 15, 40), 3, range(3))
    assert times[:2] == _hm((2, 15, 40), (2, 19, 36))
    assert times[2] == datetime(2026, 11, 2, 22, 52, 40)
    assert times[3] == datetime(2026, 11, 3, 8, 30)


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIMELINE-24")
def test_last_invite_at_is_real_hours_before_the_real_start():
    """engine-timeline rule 6: ``last_invite_before`` in real hours before the class's real start.
    Lisbon's clocks go forward on 29 Mar 2026 at 01:00 (to 02:00)."""
    from padel_app.invitation_engine.snapshot import SessionSnapshot
    from padel_app.invitation_engine.timeline import last_invite_at
    from padel_app.utils.dates import wall_to_utc_naive

    settings = EngineSettings(last_invite_before=timedelta(hours=2))
    for start in (datetime(2026, 3, 29, 1, 30), datetime(2026, 3, 29, 3, 0)):
        s = SessionSnapshot("A", 3, 8, start, regulars=(), going=())
        assert last_invite_at(s, settings) == wall_to_utc_naive(start) - timedelta(hours=2)
    s = SessionSnapshot("A", 3, 8, datetime(2026, 3, 29, 3, 0), regulars=(), going=())
    assert last_invite_at(s, settings) == datetime(2026, 3, 29, 0, 0)            # not 01:00, as wall arithmetic gave


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIMELINE-25")
def test_quiet_hours_whose_start_equals_their_end_are_quiet_all_day():
    """config rule 19 (CONFIG-65, R's mapping): a window whose start equals its end is quiet all day;
    no window at all is never quiet."""
    all_day = EngineSettings(quiet_hours=(time(9, 0), time(9, 0)))
    assert all(is_quiet(all_day, datetime(2026, 11, 1, h, 0)) for h in range(24))
    assert not any(is_quiet(EngineSettings(quiet_hours=None), datetime(2026, 11, 1, h, 0)) for h in range(24))


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-TIMELINE-26")
def test_a_side_the_coach_chose_is_never_moved():
    """engine-timeline rule 6 (PAD-808): at last_invite_at a student the coach placed on a side (firm) never
    moves, a one-sided one on the other side included; the side over quota sheds a both-sides student the
    coach did not place, who alone is told."""
    from dataclasses import replace

    from padel_app.invitation_engine.timeline import due
    from padel_app.tests.test_invitation_engine_last_invite import LAST, _moves, _session

    s = _session(8, [("c1", "LR", "R", "invitation"), ("c2", "L", "R", "invitation"), ("f", "LR", "R", "invitation"),
                     ("R1", "R", "R", "regular"), ("R2", "R", "R", "regular"),
                     ("L1", "L", "L", "regular"), ("L2", "L", "L", "regular")],
                 ["R1", "R2", "L1", "L2", "f", "c1", "c2"])
    s = replace(s, going=tuple(replace(p, firm=p.student in ("c1", "c2")) for p in s.going))
    assert _moves(due(s, EngineSettings(), LAST)) == ({"f": "L"}, {"f"})
