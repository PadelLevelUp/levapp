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

from padel_app.invitation_engine.constants import KIND_SIDE_MOVED, method_b_parts, side_quota
from padel_app.invitation_engine.effects import Effect, Message, SideAssigned
from padel_app.invitation_engine.settings import EngineSettings
from padel_app.invitation_engine.snapshot import SIDES, Invitation, SessionSnapshot, Side
from padel_app.utils.dates import utc_to_wall_naive, wall_to_utc_naive


def first_invite_at(snapshot: SessionSnapshot, settings: EngineSettings) -> datetime:
    """When invitations start (§8 step 2): ``days_before`` the class's day, at the coach's time.
    Class times are Lisbon wall-clock, the result naive UTC (R-023)."""
    fi = settings.first_invite
    day = snapshot.start.date() - timedelta(days=fi.days_before)
    return wall_to_utc_naive(datetime.combine(day, fi.at))


def attendance_request_at(snapshot: SessionSnapshot, settings: EngineSettings) -> datetime:
    """When regulars are first asked if they are going (§8 step 3), naive UTC; the boundary of
    automatic entry (engine-settings rule 3)."""
    ar = settings.attendance_request
    day = snapshot.start.date() - timedelta(days=ar.days_before)
    return wall_to_utc_naive(datetime.combine(day, ar.at))


def last_invite_at(snapshot: SessionSnapshot, settings: EngineSettings) -> datetime:
    """After it no new invitation goes out (§8 step 6)."""
    return wall_to_utc_naive(snapshot.start - settings.last_invite_before)


def may_plan(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime) -> bool:
    """Whether a run may create invitations at ``now`` (engine-planning rule 1): inside the
    invitation window and outside quiet hours (D14)."""
    return (first_invite_at(snapshot, settings) <= now <= last_invite_at(snapshot, settings)
            and not is_quiet(settings, now))


def useful_time(snapshot: SessionSnapshot, settings: EngineSettings, since: datetime | None = None) -> timedelta:
    """Method B's useful time (engine-settings rule 2, amended): from ``since`` (naive UTC; the
    opening, the run that plans for the spot) to ``last_invite_at``, quiet hours not counted. Without
    ``since`` it runs from ``first_invite_at``. Scenario 83: 15:30 to 08:30 with quiet hours
    00:00-07:00 is 10 hours."""
    start = first_invite_at(snapshot, settings) if since is None else since
    return _active_between(settings, start, last_invite_at(snapshot, settings))


def method_b_t(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime, n: int,
               rank: int) -> timedelta:
    """Method B's T for a send at ``now`` from the tier at ``rank`` (0-based) of the ``n`` tiers in
    the split: what is left of the useful time, in proportion to this tier's part among the parts
    still to run (``constants.method_b_parts``).

    With nothing ending early this is the split fixed at the opening (83, 85, 87: 9:8:7:6 of the
    useful time). A tier that ends before its time (everyone said No, 86) leaves the split: the caller
    counts only tiers that still have candidates or invitations not refused, so what remains is split
    afresh over the tiers left (6:5:4 of 9 h 50 m)."""
    parts = method_b_parts(n)
    return useful_time(snapshot, settings, now) * parts[rank] / sum(parts[rank:])


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


def _active_between(settings: EngineSettings, start: datetime, end: datetime) -> timedelta:
    """The time from ``start`` to ``end`` (naive UTC) that falls outside quiet hours."""
    if end <= start:
        return timedelta(0)
    qh = settings.quiet_hours
    if not qh or qh[0] == qh[1]:
        return end - start
    q_start, q_end = qh
    cur, total = start, timedelta(0)
    while cur < end:
        wall = utc_to_wall_naive(cur)
        if _in_quiet(wall, q_start, q_end):
            cur = max(wall_to_utc_naive(_quiet_end(wall, q_start, q_end)), cur + timedelta(minutes=1))
            continue
        pause = min(wall_to_utc_naive(_next_quiet_start(wall, q_start)), end)
        total += pause - cur
        cur = pause
    return total


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
    return (invitation.open and invitation.sorry_at is None
            and (invitation.counts_until is None or now < invitation.counts_until))


def due(snapshot: SessionSnapshot, settings: EngineSettings, now: datetime) -> tuple[Effect, ...]:
    """The session's time-driven effects at ``now`` (naive UTC), before the planning run.

    From ``last_invite_at`` on (§8 step 6, engine-timeline rule 6): every flexible going student gets
    a final side, and a side over its quota sheds regulars to the other side while it has room. Each
    is a ``SideAssigned`` with a ``side_moved`` message. Once applied nothing is left to do, so later
    runs return nothing until the going students change."""
    if now < last_invite_at(snapshot, settings):
        return ()
    return _final_sides(snapshot, now)


def _final_sides(snapshot: SessionSnapshot, now: datetime) -> tuple[Effect, ...]:
    quota = side_quota(snapshot.capacity)
    side: dict[str, Side | None] = {p.student: p.side for p in snapshot.going}
    count = {v: sum(1 for s in side.values() if s == v) for v in SIDES}
    joined = snapshot.joined_at
    out: list[Effect] = []

    def assign(student: str, value: Side) -> None:
        if side[student] is not None:
            count[side[student]] -= 1
        side[student] = value
        count[value] += 1
        out.append(SideAssigned(snapshot.id, now, student, value))
        out.append(Message(snapshot.id, now, student, KIND_SIDE_MOVED))

    # Unplaced flexible students first (a {L, R} regular), in joining order: the side with more room.
    for p in sorted((p for p in snapshot.going if p.side is None), key=lambda p: (joined.get(p.student, now), p.student)):
        student = snapshot.students.get(p.student)
        options = [v for v in SIDES if student is None or v in student.sides]
        assign(p.student, max(options, key=lambda v: quota - count[v]))

    # Then a side over its quota sheds regulars: the coach's choice is not modelled here; whoever moved
    # least recently (never moved first), ties to the one who joined the class most recently.
    for v in SIDES:
        other = next(w for w in SIDES if w != v)
        while count[v] > quota and count[other] < quota:
            movable = [p.student for p in snapshot.going if p.how == "regular" and side[p.student] == v]
            if not movable:
                break
            never = datetime.min
            movable.sort(key=lambda sid: (snapshot.last_moved_at.get(sid, never),
                                          -(joined.get(sid, never) - never).total_seconds(), sid))
            assign(movable[0], other)
    return tuple(out)
