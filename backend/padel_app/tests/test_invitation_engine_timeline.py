"""notifications.engine-timeline: an invitation's T, fixed at send (PAD-906, wave W1), and quiet
hours pausing it (PAD-907, wave W4).

TIMELINE-2 (`test_t_at_send_follows_the_tier_state`) needs a planning run and lands with wave W2.
TIMELINE-1 and TIMELINE-5 are pinned by scenarios P30 and 80 once the planner runs; the tests below
pin the clock they rest on.
"""
from dataclasses import replace
from datetime import datetime, time, timedelta

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
