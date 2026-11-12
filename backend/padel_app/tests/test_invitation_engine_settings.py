"""notifications.engine-settings (PAD-906, wave W1): the timing shape, its floor and Method B's parts.

Each test is one acceptance criterion of specflow/impl/notifications/engine-settings.spec.md.
"""
from datetime import timedelta

import pytest

from padel_app.invitation_engine import EngineSettings, SettingsError
from padel_app.invitation_engine.constants import ENGINE_T_FLOOR, method_b_parts, method_b_share
from padel_app.invitation_engine.settings import Timing, TimingPair
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
