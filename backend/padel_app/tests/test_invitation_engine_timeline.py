"""notifications.engine-timeline (PAD-906, wave W1): an invitation's T, fixed at send.

TIMELINE-2 (`test_t_at_send_follows_the_tier_state`) needs a planning run and lands with wave W2.
"""
from datetime import datetime, timedelta

from padel_app.invitation_engine import EngineSettings
from padel_app.invitation_engine.settings import Timing, TimingPair
from padel_app.invitation_engine.timeline import counts_until, t_at_send

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
