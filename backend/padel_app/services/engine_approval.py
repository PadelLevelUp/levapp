"""Semi-automatic approval on the new engine (PAD-919, swap plan §8 step 7; owner ruling D2).

For a session the new engine runs, the hold is the engine's (``notifications.engine-planning``
rule 14): one pending ``ApprovalRequest`` per session, carrying a queue per open spot type, and the
session's approved queue, both kept by the store (``engine_sessions``). This module serves them through
the existing approval endpoints (notifications.semi-auto-approval, new-engine section) and renders the
request as the coach's Assistant message when the outbox sends it. Old-engine sessions keep
``replacement_approval_service`` as it is.

Public API
----------
- state(instance, coach_id, *, now=None) -> dict              the class view's approval state
- respond(request_id, action, coach_id, removed=(), *, now=None) -> dict
- recompute(instance, coach_id, *, now=None) -> dict
- send_approval_request(row) -> None                          the outbox's sender for ``ApprovalRequest``
"""
from __future__ import annotations

from datetime import datetime

from padel_app.services.engine_outbox import (  # noqa: F401 - the request's card and sender are the outbox's
    card,
    group,
    queues_wire,
    send_approval_request,
)
from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

#: The coach's answers on a new-engine request. "Yes, at the window" is the old engine's: a new-engine
#: request is never raised before the window (engine-planning rule 14).
ACTIONS = ("yes_now", "dismiss")


def _engine(now: datetime):
    from padel_app.invitation_engine import Engine
    from padel_app.services import engine_store

    return Engine(engine_store.TableStore(clock=lambda: now), engine_store.settings_for)


def _empty_queue_reasons(snapshot, settings, now: datetime) -> dict:
    """Per spot type with nobody to ask, how many students each verdict stage holds out (rule 4b's
    counts, from the dry run, notifications.engine-tiers rule 12), zero counts left out."""
    from collections import Counter

    from padel_app.invitation_engine import planner

    dry = planner.evaluate(snapshot, settings, now)
    out = {}
    for spot_type, queue in dry.queues.items():
        if not queue:
            counts = Counter(v.stage for v in dry.verdicts if v.spot_type == spot_type)
            out[spot_type] = [{"stage": s, "count": n} for s, n in sorted(counts.items())]
    return out


def state(instance, coach_id: int, *, now: datetime | None = None) -> dict:
    """The class's approval state for its coach (semi-auto-approval N1, per group): each pending
    request (its id, its group, its queue per spot type with the type's open spots; an empty type's
    ``emptyQueueReasons``), the approved and the dismissed groups and the removed students, and
    ``semiAutomatic`` from the coach's mode; ``state`` is ``pending`` while any request waits."""
    from padel_app.services import engine_store

    _now = now or utcnow_naive()
    session = str(instance.id)
    store = engine_store.TableStore(clock=lambda: _now)
    settings = engine_store.settings_for(session)
    snapshot = store.snapshot(session)
    approval = snapshot.approval
    requests = []
    if approval.pending:
        reasons = _empty_queue_reasons(snapshot, settings, _now)
        for p in sorted(approval.pending, key=lambda p: p.tier):
            types = queues_wire(coach_id, p.queues, snapshot)
            for (spot_type, _), t in zip(p.queues, types):
                if not t["queue"]:
                    t["emptyQueueReasons"] = reasons.get(spot_type, [])
            requests.append({"requestId": p.request, "lessonInstanceId": instance.id,
                             "group": group(settings, p.tier), "spotTypes": types})
    return {
        "engine": "new",
        "state": "pending" if requests else "none",
        "semiAutomatic": settings.invitation_mode == "semi_automatic",
        "approvedGroups": [group(settings, t) for t in sorted(approval.approved_groups)],
        "dismissedGroups": [group(settings, t) for t, _ in sorted(approval.dismissed_groups)],
        "removed": sorted(approval.removed, key=int),
        "requests": requests,
    }


def is_request_id(value) -> bool:
    """Whether ``value`` names a new-engine request (the engine's ``"<session>:<time>:…"``), not an old
    bundle (a UUID, which has no colon)."""
    parts = str(value or "").split(":")
    return len(parts) >= 3 and parts[0].isdigit()


def respond(request_id: str, action: str, coach_id: int, removed=(), *, now: datetime | None = None) -> dict:
    """The coach's answer to a new-engine request (semi-auto-approval N2): ``yes_now`` approves its group
    without the ``removed`` students (``ApproveGroup``), ``dismiss`` ignores the group until its spot
    count changes or the coach reopens it (``DismissGroup``). A request that is no longer pending
    decides nothing and answers ``stale``."""
    from flask import abort

    from padel_app.invitation_engine import requests as rq
    from padel_app.services import engine_store
    from padel_app.services.replacement_approval_service import _coached_instance

    if action not in ACTIONS:
        abort(400, f"action must be one of {', '.join(ACTIONS)}")
    _now = now or utcnow_naive()
    session = str(request_id).split(":")[0]
    instance = _coached_instance(int(session), coach_id)
    store = engine_store.TableStore(clock=lambda: _now)
    if not store.has_session(session) or not any(p.request == request_id
                                                 for p in store.snapshot(session).approval.pending):
        return {"engine": "new", "requestId": request_id, "result": "stale"}
    request = (rq.ApproveGroup(request_id, frozenset(str(r) for r in removed or ())) if action == "yes_now"
               else rq.DismissGroup(request_id))
    _engine(_now).handle(session, request, _now)
    result = "approved" if action == "yes_now" else "dismissed"
    return {"engine": "new", "requestId": request_id, "result": result,
            "state": state(instance, coach_id, now=_now)}


def recompute(instance, coach_id: int, *, now: datetime | None = None) -> dict:
    """Ask the engine again with the class as it is now (semi-auto-approval N3): each dismissed group is
    reopened (``ReopenGroup``), then the session is planned at once (``Engine.plan``), which asks for the
    group about to start. The answer is the class's approval state after the run."""
    from flask import abort

    from padel_app.invitation_engine import requests as rq
    from padel_app.services import engine_store
    from padel_app.utils.dates import wall_to_utc_naive

    _now = now or utcnow_naive()
    session = str(instance.id)
    if _now >= wall_to_utc_naive(instance.start_datetime):
        abort(409, "The class is over")
    if engine_store.settings_for(session).invitation_mode != "semi_automatic":
        abort(409, "Suggestions are for the semi-automatic mode")
    engine = _engine(_now)
    for tier, _ in engine_store.TableStore(clock=lambda: _now).snapshot(session).approval.dismissed_groups:
        engine.handle(session, rq.ReopenGroup(tier), _now)
    engine.plan(session, _now)
    return state(instance, coach_id, now=_now)
