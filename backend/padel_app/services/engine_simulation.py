"""The invite simulation on the new engine (PAD-919, swap plan §4, §8 step 7).

For a session the new engine runs (an ``engine_sessions`` row; ``notifications.config`` rule 18) the
"Understand invites" tutorial and its "why not this student" answer come from the engine's own dry run
(``planner.evaluate``, engine-tiers rules 11-12, TIERS-9) on a hypothetical snapshot: the session as the
store reads it, with the departing student no longer going. Nothing is written. Old-engine sessions keep
``invite_simulation_service`` as it is (notifications.invite-simulation, new-engine section).

Public API
----------
- is_new_engine_session(instance) -> bool
- simulate(instance, coach_id, departing_player_id, *, now=None) -> dict
- explain(instance, coach_id, departing_player_id, player_id, *, now=None) -> dict | None

Every code in the payload (gate ``code``, verdict ``stage``, pool ``reasons``) is structured data; the
locale belongs to the client (eligibility.enforcement rule 7a).
"""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from padel_app.services.engine_outbox import people, spot_type_wire
from padel_app.utils.dates import utcnow_naive, wall_to_utc_naive


def is_new_engine_session(instance) -> bool:
    """Whether the new engine runs this occurrence (it has a session row, ``notifications.config``
    rule 18)."""
    from padel_app.services.engine_store import TableStore

    return instance is not None and instance.id is not None and TableStore().has_session(str(instance.id))


def hypothetical_snapshot(store, session: str, departing: str | None):
    """The session as the store reads it, with ``departing`` no longer going: a regular counts as
    absent, as a regular's No would leave them; anyone else simply leaves. Built without writing."""
    snapshot = store.snapshot(session)
    if departing is None or snapshot.placement(departing) is None:
        return snapshot
    going = tuple(p for p in snapshot.going if p.student != departing)
    absent = snapshot.absent | ({departing} if any(r.id == departing for r in snapshot.regulars) else set())
    return replace(snapshot, going=going, absent=frozenset(absent))


def _gates(instance, coach_id: int, snapshot, settings, now: datetime) -> list[dict]:
    """The checks before a run sends, in today's gate shape (``{code, blocked, …}``,
    notifications.invite-simulation N4): the store's listing (CONFIG-54: the coach's or the class's
    switch), a class already started, and the dry run's "may plan now": the invitation window (with
    ``opensAt``), quiet hours (with ``until``), ``last_invite_before`` (with ``minutes``). No
    ``max_total_reached`` (swap decision 3)."""
    from padel_app.invitation_engine import timeline
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.notification_service import effective_auto_invites

    config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
    over = now >= wall_to_utc_naive(snapshot.start)
    first = timeline.first_invite_at(snapshot, settings)
    quiet = settings.quiet_hours
    return [
        {"code": "auto_notify_disabled", "blocked": config is None or not config.auto_notify_enabled},
        {"code": "class_notifications_disabled", "blocked": not instance.notifications_enabled},
        {"code": "class_auto_invites_off", "blocked": not effective_auto_invites(instance)},
        {"code": "class_over", "blocked": over},
        {"code": "invitation_window", "blocked": not over and first is not None and now < first,
         "opensAt": first.isoformat() if first is not None else None},
        {"code": "quiet_hours", "blocked": not over and timeline.is_quiet(settings, now), "enabled": quiet is not None,
         "until": quiet[1].strftime("%H:%M") if quiet is not None else None},
        {"code": "last_invite_before", "blocked": not over and now > timeline.last_invite_at(snapshot, settings),
         "minutes": int(settings.last_invite_before.total_seconds() // 60)},
    ]


def simulate(instance, coach_id: int, departing_player_id, *, now: datetime | None = None) -> dict:
    """What the session's engine would do at ``now`` if ``departing_player_id`` dropped out: for each
    open spot type its queue (tier, then the coach's ordering) and every student's verdict stage
    (engine-tiers rule 12), and for each of the coach's students the pool keeps out, why. Read-only."""
    from padel_app.invitation_engine import planner
    from padel_app.services.engine_store import TableStore, settings_for
    from padel_app.services.level_ladder import get_level_ladder

    _now = now or utcnow_naive()
    store = TableStore(clock=lambda: _now)
    session = str(instance.id)
    settings = settings_for(session)
    departing = None if departing_player_id is None else str(departing_player_id)
    snapshot = hypothetical_snapshot(store, session, departing)
    dry = planner.evaluate(snapshot, settings, _now)
    excluded = store.pool_exclusions(session)
    counts = planner.spot_counts(planner.with_postponed(snapshot, _now))
    names = people(coach_id, set(snapshot.students) | set(excluded))
    ladder = get_level_ladder(coach_id)

    types = []
    for spot_type, n in planner.spot_types(snapshot, counts):
        verdicts = [v for v in dry.verdicts if v.spot_type == spot_type]
        tiers = {v.student: v.tier for v in verdicts}
        types.append({
            **spot_type_wire(spot_type, ladder),
            "count": n,
            "queue": [{"playerId": sid, **names.get(sid, {}), "tier": tiers.get(sid), "rank": rank}
                      for rank, sid in enumerate(dry.queues.get(spot_type, ()), 1)],
            "verdicts": [{"playerId": v.student, **names.get(v.student, {}), "stage": v.stage, "tier": v.tier}
                         for v in verdicts]
                        + [{"playerId": sid, **names.get(sid, {}), "stage": "not_in_pool", "tier": None,
                            "reasons": reasons}
                           for sid, reasons in sorted(excluded.items(), key=lambda kv: int(kv[0]))
                           if sid not in snapshot.students],
        })
    return {
        "engine": "new",
        "evaluatedAt": _now.isoformat(),
        "approvalRequired": settings.invitation_mode == "semi_automatic",
        "gates": _gates(instance, coach_id, snapshot, settings, _now),
        "departingPlayerId": departing,
        "spotTypes": types,
    }


def explain(instance, coach_id: int, departing_player_id, player_id, *, now: datetime | None = None) -> dict | None:
    """``player_id``'s verdict for each open spot type of the simulation (notifications.invite-
    simulation rule 2, new-engine readings): one entry per type. ``None`` when the student is not on
    this coach's roster."""
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer

    if Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=int(player_id)).first() is None:
        return None
    sim = simulate(instance, coach_id, departing_player_id, now=now)
    sid = str(player_id)
    entries, person = [], {}
    for t in sim["spotTypes"]:
        for v in t["verdicts"]:
            if v["playerId"] == sid:
                person = {k: v[k] for k in v if k not in ("stage", "tier", "reasons", "playerId")}
                rank = next((q["rank"] for q in t["queue"] if q["playerId"] == sid), None)
                entries.append({"side": t["side"], "levelId": t["levelId"], "levelLabel": t["levelLabel"],
                                "stage": v["stage"], "tier": v["tier"], "rank": rank,
                                **({"reasons": v["reasons"]} if "reasons" in v else {})})
    if not person:
        person = people(coach_id, [sid]).get(sid, {})
    return {"engine": "new", "playerId": sid, **person, "spotTypes": entries}
