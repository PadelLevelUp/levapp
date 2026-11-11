"""A session's clock (plan §8): the instants, quiet hours and how long an invitation counts.

Owns: ``first_invite_at``, ``attendance_request_at``, ``absence_cutoff_at`` and
``last_invite_at`` from the settings; whether an invitation still counts (T per tier, Methods B
and C as values, quiet hours pausing it, D14, D16); the automatic-entry boundary at the
attendance request; and the duties due at an instant, such as fixing flexible students' sides at
``last_invite_at`` (§8 step 6) and the after-class no-shows (§8 step 7).

``due`` returns nothing until wave W7 (specflow/impl/notifications/_overview.md, "Engine waves").
"""
from __future__ import annotations

from datetime import datetime, timedelta

from padel_app.invitation_engine.effects import Effect
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.snapshot import SessionSnapshot
from padel_app.utils.dates import wall_to_utc_naive as _utc   # Lisbon wall-clock -> naive UTC (R-023)


def first_invite_at(snapshot: SessionSnapshot, settings: EngineSettings) -> datetime:
    """When invitations start (§8 step 2): ``days_before`` the class's day, at the coach's time."""
    fi = settings.first_invite
    day = snapshot.start.date() - timedelta(days=fi.days_before)
    return _utc(datetime.combine(day, fi.at))


def last_invite_at(snapshot: SessionSnapshot, settings: EngineSettings) -> datetime:
    """After it no new invitation goes out (§8 step 6)."""
    return _utc(snapshot.start - settings.last_invite_before)


def may_plan(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime) -> bool:
    """Whether a run may create invitations at ``now`` (engine-planning rule 1): inside the
    invitation window. Quiet hours (D14) join this gate in wave W4."""
    return first_invite_at(snapshot, settings) <= now <= last_invite_at(snapshot, settings)


def useful_time(snapshot: SessionSnapshot, settings: EngineSettings) -> timedelta:
    """Method B's useful time: the invitation window. Quiet hours are taken out of it in wave W7."""
    return last_invite_at(snapshot, settings) - first_invite_at(snapshot, settings)


def t_at_send(settings: EngineSettings, tier: int, tier_has_uninvited: bool,
              method_b_share: timedelta | None = None) -> timedelta:
    """An invitation's T, fixed when it is sent (engine-timeline rule 4).

    ``between_rounds`` when, after the run's sends, the invitation's tier still has uninvited
    candidates for a type in its offer; ``between_groups`` when it has none. Under Method B it is the
    tier's share of the useful time, which the caller computes at send (``constants.method_b_share``).
    """
    if settings.timing.method == "progressive":
        if method_b_share is None:
            raise ValueError("Method B needs the tier's share, computed at send")
        return method_b_share
    pair = settings.timing_for(tier)
    return pair.between_rounds if tier_has_uninvited else pair.between_groups


def counts_until(settings: EngineSettings, sent_at: datetime, t: timedelta) -> datetime:
    """The instant an invitation sent at ``sent_at`` (naive UTC) with T ``t`` stops counting.

    Quiet hours pausing the count (D14, engine-timeline rule 3) land in wave W4; until then T runs
    straight through them.
    """
    return sent_at + t


def due(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime) -> tuple[Effect, ...]:
    """The session's time-driven effects at ``now`` (naive UTC), before the planning run."""
    return ()
