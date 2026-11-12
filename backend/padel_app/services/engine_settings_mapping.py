"""A coach's stored ``NotificationConfig`` as the new engine's ``EngineSettings`` (notifications.config
rule 19, swap plan §2; PAD-917).

Built at every call from the stored values, never copied (notifications.engine-settings rule 9). The
traps are the engine defaults that would change a coach's behaviour if left in place: the last-invite
cutoff and quiet hours are off unless the coach switched them on (zero and none, never 2 h and
00:00-07:00), the timing shapes are the coach's (never two days before at 19:00), the ordering is the
coach's (never participations alone), and the eligibility bar is wide open because the store applies
the coach's eligibility when it builds ``pool`` (swap decision 6).

What the store gates instead of the engine (``engine_store.TableStore``): ``autoNotifyEnabled`` and the
class switches (not listed), ``maxInvitesPerStudentPerDay`` (``postponed``), ``noSameDayClass``,
``excludedPlayers``, ``excludeUnpaidSubscription`` and ``eligibilityRules`` (``pool``).

Not mapped here yet: ``invitationMode`` (D2), ``cancellationDeadlineHours`` (D4) and
``invitationGroups`` (D5) wait for their criteria on notifications.config rule 19; ``maxTotal`` (D3)
has no counterpart. Those keys take the engine's defaults, as do the keys only the new engine has.
"""
from __future__ import annotations

from datetime import time, timedelta

from padel_app.invitation_engine.settings import (
    ORDERING_CRITERIA,
    AttendanceRequest,
    Eligibility,
    EngineSettings,
    FirstInvite,
    Timing,
)
from padel_app.models.notification_config import NotificationConfig

#: Swap decision 6: the engine's bar admits every level; the store's pool is the coach's eligibility.
OPEN_BAR = Eligibility(levels_above=10**6, levels_below=10**6)


def _clock(value: str | None, default: str) -> time:
    hour, minute = (value or default).split(":")
    return time(int(hour), int(minute))


def _shape(timing: dict) -> dict:
    """A stored timing (``{type, value}`` or ``{type, days, time}``, ``_compose_timing``) as the
    fields ``FirstInvite`` and ``AttendanceRequest`` share (engine-settings rule 10)."""
    kind = timing.get("type")
    if kind == "hours_before":
        return {"type": kind, "hours": int(timing["value"])}
    if kind in ("days_before", "days_before_at_time"):
        return {"type": kind, "days_before": int(timing["days"]), "at": _clock(timing.get("time"), "09:00")}
    return {"type": "none"}


def _ordering(config: NotificationConfig) -> tuple[str, ...]:
    """Engine-tiers rule 8 (CONFIG-55): the enabled priority criteria in the coach's order, then the
    enabled tiebreakers in theirs. A criterion in both lists ranks once, at its first place; an id the
    engine does not know (a retired one in an old row) is left out rather than refusing the coach."""
    out: list[str] = []
    for item in [*config.get_priority_criteria(), *config.get_tiebreakers()]:
        cid = item.get("id") if isinstance(item, dict) else None
        if cid in ORDERING_CRITERIA and item.get("enabled") and cid not in out:
            out.append(cid)
    return tuple(out)


def settings_from_config(config: NotificationConfig) -> EngineSettings:
    """The coach's ``EngineSettings`` (CONFIG-52, CONFIG-55, and the open bar of CONFIG-53)."""
    r = config.get_restrictions()
    min_before, quiet, inactive = r["minTimeBeforeClass"], r["quietHours"], r["maxInactiveTime"]
    # maxSimultaneous and maxInactiveTime: the value whether or not enabled (rule 19; X and T are >= 1).
    t = timedelta(minutes=inactive["value"])
    return EngineSettings(
        invites_per_spot=max(1, int(r["maxSimultaneous"]["value"])),
        timing=Timing(method="fixed", between_rounds=t, between_groups=t),
        first_invite=FirstInvite(**_shape(config.get_invitation_start_timing())),
        last_invite_before=timedelta(minutes=min_before["value"]) if min_before["enabled"] else timedelta(0),
        quiet_hours=((_clock(quiet["start"], "22:00"), _clock(quiet["end"], "07:00"))
                     if quiet["enabled"] else None),
        attendance_request=AttendanceRequest(
            **_shape(config.get_reminder_timing()),
            max=config.get_reminder_count(),
            every=timedelta(hours=config.get_hours_between_reminders()),
        ),
        eligibility=OPEN_BAR,
        ordering=_ordering(config),
        direct_join=bool(config.auto_accept_join_requests),
    )
