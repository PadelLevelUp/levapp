"""A session's clock (plan §8): the instants, quiet hours and how long an invitation counts.

Owns: ``first_invite_at``, ``attendance_request_at``, ``absence_cutoff_at`` and
``last_invite_at`` from the settings; whether an invitation still counts (T per tier, Methods B
and C as values, quiet hours pausing it, D14, D16); the automatic-entry boundary at the
attendance request; and the duties due at an instant, such as fixing flexible students' sides at
``last_invite_at`` (§8 step 6) and the after-class no-shows (§8 step 7).

Quiet hours (W4) pause every invitation's count in ``counts_until``, and ``is_quiet`` tells the
planning run to send nothing (D14). ``due`` returns nothing until wave W7
(specflow/impl/notifications/_overview.md, "Engine waves").
"""
from __future__ import annotations

from datetime import datetime, time, timedelta

from padel_app.invitation_engine.effects import Effect
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.snapshot import Invitation, SessionSnapshot
from padel_app.utils.dates import utc_to_wall_naive, wall_to_utc_naive


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


def _in_quiet(wall: datetime, start: time, end: time) -> bool:
    t = wall.time()
    if start < end:
        return start <= t < end
    return t >= start or t < end                      # the window crosses midnight (22:00-07:00)


def _quiet_end(wall: datetime, start: time, end: time) -> datetime:
    """The end of the quiet window that ``wall`` (Lisbon wall-clock, inside it) belongs to."""
    day = wall.date()
    if start >= end and wall.time() >= start:
        day += timedelta(days=1)
    return datetime.combine(day, end)


def _next_quiet_start(wall: datetime, start: time) -> datetime:
    """The next start of quiet hours after ``wall`` (Lisbon wall-clock, outside them)."""
    nxt = datetime.combine(wall.date(), start)
    return nxt if nxt > wall else nxt + timedelta(days=1)


def is_quiet(settings: EngineSettings, now: datetime) -> bool:
    """Whether ``now`` (naive UTC) falls in the coach's quiet hours, read in Lisbon wall-clock.

    While it does, nobody is invited from any tier (D14, engine-timeline rule 3); answers still count.
    """
    qh = settings.quiet_hours
    return bool(qh) and qh[0] != qh[1] and _in_quiet(utc_to_wall_naive(now), *qh)


def counts_until(settings: EngineSettings, sent_at: datetime, t: timedelta) -> datetime:
    """The instant an invitation sent at ``sent_at`` (naive UTC) with T ``t`` stops counting.

    T runs only outside quiet hours: it pauses at their start and resumes at their end (D14,
    engine-timeline rule 3; S30: sent 21:30 with quiet hours 22:00-07:00 and T one hour, it stops
    counting at 07:30). An invitation sent inside quiet hours starts counting at their end.
    """
    qh = settings.quiet_hours
    if not qh or qh[0] == qh[1]:
        return sent_at + t
    start, end = qh
    cur, left = sent_at, t                            # arithmetic in UTC, boundaries read in Lisbon
    while True:
        wall = utc_to_wall_naive(cur)
        if _in_quiet(wall, start, end):
            cur = max(wall_to_utc_naive(_quiet_end(wall, start, end)), cur + timedelta(minutes=1))
            continue
        pause = wall_to_utc_naive(_next_quiet_start(wall, start))
        if cur + left <= pause:
            return cur + left
        left -= pause - cur
        cur = pause


def counting(invitation: Invitation, now: datetime) -> bool:
    """Whether ``invitation`` still counts at ``now`` (naive UTC): open and before its own
    ``counts_until``. Only its own send fixes that instant, so no other invitee's No (or Yes) ever
    changes it (engine-timeline rule 4, TIMELINE-5); once past it, it stays open but stops counting (D4).
    An invitation with no ``counts_until`` counts while open (agreed with the planner, W2)."""
    return invitation.open and (invitation.counts_until is None or now < invitation.counts_until)


def due(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime) -> tuple[Effect, ...]:
    """The session's time-driven effects at ``now`` (naive UTC), before the planning run."""
    return ()
