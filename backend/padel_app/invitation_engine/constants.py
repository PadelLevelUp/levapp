"""The engine's constants (specflow/impl/notifications/constants.md): facts more than one module uses.

Each name is the spec's ``const:`` name; change a value here and in constants.md together.
"""
from __future__ import annotations

from datetime import timedelta

ENGINE_RUN_EVERY = timedelta(minutes=1)      # the background planning run's period (plan §6)
ENGINE_T_FLOOR = timedelta(minutes=1)        # the smallest timing value (ruling D-E6)
LOWER_TIER_PER_SPOT = 1                      # what a non-ideal tier sends per covered spot (D17)

KIND_SORRY = "sorry"
KIND_REOFFER = "reoffer"
KIND_ADDED = "added"
KIND_WAITING_LIST_INVITE = "waiting_list_invite"
KIND_SIDE_MOVED = "side_moved"
COACH_ALERT = "coach_alert"
ALERT_NO_CANDIDATE = "no_candidate"           # CoachAlert.reason: no tier can take the spots


def side_quota(capacity: int) -> int:
    """SIDE_QUOTA: side's quota per value, capacity / 2 (D19; capacities are even, Q5)."""
    return capacity // 2


def method_b_parts(n: int) -> tuple[int, ...]:
    """METHOD_B_PART: tier i (0-based) of n tiers with candidates gets 3 × (n − 1) − i parts
    (4 tiers 9:8:7:6, 3 tiers 6:5:4, 2 tiers 3:2); one tier takes the whole useful time."""
    if n < 1:
        raise ValueError("Method B needs at least one tier with candidates")
    if n == 1:
        return (1,)
    return tuple(3 * (n - 1) - i for i in range(n))


def method_b_share(useful: timedelta, n: int, i: int) -> timedelta:
    """Tier i's T under Method B: its parts over the sum of the parts, applied to the useful time."""
    parts = method_b_parts(n)
    return useful * parts[i] / sum(parts)
