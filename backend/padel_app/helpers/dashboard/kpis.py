from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func

from padel_app.sql_db import db
from padel_app.models import Presence, LessonInstance

@dataclass(frozen=True)
class PlayerKpis:
    lessons_attended: int
    lessons_missed: int
    invites_to_confirm: int


def compute_player_kpis(*, player_id: int) -> PlayerKpis:
    """
    Compute player KPIs based on Presence + LessonInstance.

    Uses LessonInstance.start_datetime as the start timestamp.

    "Upcoming lessons" is deliberately NOT here (PAD-235, B-032): it is the
    schedule's own count, derived in ``player_home`` from the same event load
    the ``schedule_7d`` block uses, so the two can never disagree.
    """
    now = datetime.now(timezone.utc)

    P = Presence
    LI = LessonInstance

    lessons_attended = (
        db.session.query(func.count(P.id))
        .filter(P.player_id == player_id)
        .filter(P.status == "present")
        .scalar()
    ) or 0

    lessons_missed = (
        db.session.query(func.count(P.id))
        .filter(P.player_id == player_id)
        .filter(P.status == "absent")
        .scalar()
    ) or 0

    invites_to_confirm = (
        db.session.query(func.count(P.id))
        .join(LI, LI.id == P.lesson_instance_id)
        .filter(P.player_id == player_id)
        .filter(P.invited == True)    # noqa: E712
        .filter(P.confirmed == False) # noqa: E712
        .filter(LI.start_datetime >= now)
        .scalar()
    ) or 0

    return PlayerKpis(
        lessons_attended=int(lessons_attended),
        lessons_missed=int(lessons_missed),
        invites_to_confirm=int(invites_to_confirm),
    )
