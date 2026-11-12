"""The app's entry points into the new invitation engine (swap plan §3.1, §8 step 6; PAD-918).

Each function here is what a route or a service calls when the session it touches runs on the new
engine (``engine_switch.engine_for``): it turns the app's action into an engine request, runs it in
the session's unit (``engine_runner.engine``), and answers in the route's own shape.
"""
from __future__ import annotations

from datetime import datetime

from werkzeug.exceptions import Forbidden, NotFound

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine import requests as rq
from padel_app.sql_db import db
from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive


# --- answers (notifications.invitations NB5, INVITATIONS-119) --------------------------------------


def _answer_state(row, placed: bool) -> str:
    """What happened to an answered invitation, as the route says it."""
    if row.closed_at is not None:
        return "closed_same_hour"
    if row.sorry_at is not None:
        return "sorry"
    if row.answer == "no":
        return "declined"
    return "confirmed" if placed else "reoffered"


def respond_to_invitation(invitation_id: int, action: str, user_id: int, *, now: datetime | None = None,
                          coach_id: int | None = None) -> dict:
    """A Yes or a No to a new-engine invitation, by its id: the student's own (``user_id``), or the
    coach's on their behalf (``coach_id``, ``coach_respond``). Returns ``{action, invitationId}``:
    ``confirmed``, ``declined``, ``sorry``, ``reoffered``, ``closed_same_hour`` or ``class_started``,
    with ``duplicate: true`` for an answer already given. 404 for an unknown id, 403 when the
    invitation is not the caller's."""
    from padel_app.models import EngineInvitation
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence
    from padel_app.services.engine_runner import engine
    from padel_app.services.lesson_service import coaches_for

    if action not in ("yes", "no"):
        from flask import abort
        abort(400, "action must be 'yes' or 'no'")
    now = now or utcnow_naive()
    row = db.session.get(EngineInvitation, int(invitation_id))
    if row is None:
        raise NotFound("unknown invitation")
    inst = db.session.get(LessonInstance, row.lesson_instance_id)
    if coach_id is not None:
        if coach_id not in {c.id for c in coaches_for(inst)}:
            raise Forbidden("not your session")
    elif getattr(db.session.get(Player, row.player_id), "user_id", None) != user_id:
        raise Forbidden("not your invitation")

    def placed() -> bool:
        p = Presence.query.filter_by(lesson_instance_id=row.lesson_instance_id, player_id=row.player_id).first()
        return p is not None and p.status != "absent"

    out = {"invitationId": row.id}
    if inst.start_datetime <= utc_to_wall_naive(now):
        return {**out, "action": "class_started"}
    if row.answer is not None or row.closed_at is not None:
        return {**out, "action": _answer_state(row, placed()), "duplicate": True}

    effects = engine(now).handle(str(row.lesson_instance_id),
                                 rq.Answer(str(row.player_id), action == "yes"), now)
    db.session.expire_all()
    student = str(row.player_id)
    if any(isinstance(e, fx.Reoffered) and e.student == student for e in effects):
        return {**out, "action": "reoffered"}
    row = db.session.get(EngineInvitation, int(invitation_id))
    return {**out, "action": _answer_state(row, placed())}
