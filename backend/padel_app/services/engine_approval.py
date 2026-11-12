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

from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

#: The coach's answers on a new-engine request. "Yes, at the window" is the old engine's: a new-engine
#: request is never raised before the window (engine-planning rule 14).
ACTIONS = ("yes_now", "dismiss")


def _engine(now: datetime):
    from padel_app.invitation_engine import Engine
    from padel_app.services import engine_store

    return Engine(engine_store.TableStore(clock=lambda: now), engine_store.settings_for)


def _queues_payload(coach_id: int, queues) -> list[dict]:
    """A request's queues on the wire: per spot type (invite-simulation N2's shape) its students in order."""
    from padel_app.services.engine_simulation import _people, _spot_type
    from padel_app.services.level_ladder import get_level_ladder

    people = _people(coach_id, {sid for _, ids in queues for sid in ids})
    ladder = get_level_ladder(coach_id)
    return [{**_spot_type(spot_type, ladder), "queue": [{"playerId": sid, **people.get(sid, {}), "rank": rank}
                                                        for rank, sid in enumerate(ids, 1)]}
            for spot_type, ids in queues]


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
    """The class's approval state for its coach (rule 12, new-engine readings): ``pending`` with the
    session's request (its id and a queue per spot type), ``dismissed``, or ``none``; with the
    session's approved and removed students, and ``semiAutomatic`` from the coach's mode."""
    from padel_app.services import engine_store

    _now = now or utcnow_naive()
    session = str(instance.id)
    store = engine_store.TableStore(clock=lambda: _now)
    settings = engine_store.settings_for(session)
    snapshot = store.snapshot(session)
    approval = snapshot.approval
    out = {
        "engine": "new",
        "semiAutomatic": settings.invitation_mode == "semi_automatic",
        "approved": sorted(approval.approved, key=int),
        "removed": sorted(approval.removed, key=int),
    }
    if approval.pending is not None:
        reasons = _empty_queue_reasons(snapshot, settings, _now)
        types = _queues_payload(coach_id, approval.pending)
        for (spot_type, _), t in zip(approval.pending, types):
            if not t["queue"]:
                t["emptyQueueReasons"] = reasons.get(spot_type, [])
        return {**out, "state": "pending", "request": {"requestId": approval.pending_request,
                                                        "lessonInstanceId": instance.id, "spotTypes": types}}
    if approval.dismissed is not None:
        return {**out, "state": "dismissed"}
    return {**out, "state": "none"}


def is_request_id(value) -> bool:
    """Whether ``value`` names a new-engine request (``"<session>:<time>:<hash>"``), not an old bundle."""
    parts = str(value or "").split(":")
    return len(parts) == 3 and parts[0].isdigit()


def respond(request_id: str, action: str, coach_id: int, removed=(), *, now: datetime | None = None) -> dict:
    """The coach's answer to a new-engine request (rule 8, new-engine readings): ``yes_now`` approves
    it without the ``removed`` students (``ApproveQueue``), ``dismiss`` ignores it until the spot count
    changes or the coach reopens the class (``DismissQueue``). A request that is no longer the
    session's pending one decides nothing and answers ``stale``."""
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
    if not store.has_session(session) or store.snapshot(session).approval.pending_request != request_id:
        return {"engine": "new", "requestId": request_id, "result": "stale"}
    request = (rq.ApproveQueue(request_id, frozenset(str(r) for r in removed or ())) if action == "yes_now"
               else rq.DismissQueue())
    _engine(_now).handle(session, request, _now)
    result = "approved" if action == "yes_now" else "dismissed"
    return {"engine": "new", "requestId": request_id, "result": result,
            "state": state(instance, coach_id, now=_now)}


def recompute(instance, coach_id: int, *, now: datetime | None = None) -> dict:
    """Ask the engine again with the class as it is now (rule 12, new-engine readings): a dismissed
    session is reopened (``ReopenQueue``, which ends the dismissal and plans), any other is planned
    (``Engine.plan``). The answer is the class's approval state after the run."""
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
    if engine_store.TableStore(clock=lambda: _now).snapshot(session).approval.dismissed is not None:
        engine.handle(session, rq.ReopenQueue(), _now)
    else:
        engine.plan(session, _now)
    return state(instance, coach_id, now=_now)


def card(row) -> dict:
    """The Assistant message's payload for an ``ApprovalRequest`` outbox row: the request id, the class,
    and per open spot type its queue (notifications.semi-auto-approval, new-engine readings)."""
    from padel_app.invitation_engine.snapshot import SpotType
    from padel_app.services.engine_store import TableStore

    session = str(row.lesson_instance_id)
    coach_id = TableStore().coach_of(session)
    queues = tuple((SpotType(*spot), tuple(ids)) for spot, ids in (row.payload or {}).get("queues") or ())
    return {"engine": "new", "requestId": (row.payload or {}).get("request"), "lessonInstanceId": int(session),
            "responded": False, "spotTypes": _queues_payload(coach_id, queues)}


#: The request's message (semi-auto-approval N4, message-templates rule 6), per coach locale.
CARD_TEXT = {
    "pt": "Pedido de convites para {klass}, {weekday} às {time}: {n} aluno(s) na fila. Enviar os convites?",
    "en": "Invitation request for {klass}, {weekday} at {time}: {n} student(s) in the queue. Send the invitations?",
}


def _card_text(card_payload: dict, coach, instance) -> str:
    """The message's text in the coach's locale: the class, its day and time, and how many students the
    request's queues hold."""
    from padel_app.services.notification_service import _format_weekday, _resolve_locale

    locale = _resolve_locale(coach)
    start = instance.start_datetime
    klass = getattr(getattr(instance, "lesson", None), "title", None) or ""
    n = len({q["playerId"] for t in card_payload["spotTypes"] for q in t["queue"]})
    return CARD_TEXT[locale].format(klass=klass, weekday=_format_weekday(start, locale),
                                    time=start.strftime("%H:%M") if start else "", n=n)


def send_approval_request(row) -> None:
    """The outbox's sender for an ``ApprovalRequest`` row (plan step 6 schedules it, PAD-918): the
    request as one ``replacement_approval`` message in the coach's Assistant conversation (rule 6, as
    today), then the live event and the coach's push."""
    from padel_app.models import Coach, Message
    from padel_app.serializers.message import serialize_message
    from padel_app.realtime import publish
    from padel_app.services.conversation_access import message_recipient_ids
    from padel_app.services.engine_store import TableStore
    from padel_app.services.replacement_approval_service import _get_or_create_assistant_conversation
    from padel_app.utils.push_notifications import send_push_notification

    payload = card(row)
    coach = db.session.get(Coach, TableStore().coach_of(str(row.lesson_instance_id)))
    if coach is None or coach.user_id is None:
        return
    from padel_app.models.lesson_instances import LessonInstance

    conv, assistant = _get_or_create_assistant_conversation(coach.user_id)
    text = _card_text(payload, coach, db.session.get(LessonInstance, row.lesson_instance_id))
    msg = Message(text=text, sender_id=assistant.id, conversation_id=conv.id,
                  message_type="replacement_approval", msg_metadata=payload)
    db.session.add(msg)
    db.session.commit()
    publish({"type": "message_created", "payload": serialize_message(msg, None)}, message_recipient_ids(msg))
    send_push_notification(user_id=coach.user_id, title="Replacement approval needed", body=text[:100],
                           url=f"/messages/{conv.id}")
