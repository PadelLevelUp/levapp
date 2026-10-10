"""PAD-570 (dashboard.blocks rule 3a, attendance.confirm rule 27): the student's ask, batched.

Every dashboard surface that shows a student their own class — the hero, the schedule rows,
the "Precisa de ti" invite card and the Invites tile — reads ``pendingConfirmation`` from
the ONE server predicate, ``notification_service.student_may_confirm``. This module runs it
over a student's upcoming occurrences in a handful of queries; it never re-derives the ask.
"""
from __future__ import annotations

from datetime import datetime
from typing import Dict, Iterable, List, Optional

from padel_app.models import LessonInstance, Presence
from padel_app.sql_db import db
from padel_app.utils.dates import wall_to_utc_naive


def own_rows(player_id: int, instance_ids: Iterable[int]) -> Dict[int, Presence]:
    ids = [i for i in instance_ids if i is not None]
    if not ids:
        return {}
    rows = (
        Presence.query.filter(Presence.player_id == player_id)
        .filter(Presence.lesson_instance_id.in_(ids))
        .all()
    )
    return {int(r.lesson_instance_id): r for r in rows}


def ask_state(player_id: int, instance_ids: Iterable[int], now_wall: datetime) -> Dict[int, dict]:
    """``{instance_id: {"pendingConfirmation": bool, "attendanceState": str}}``.

    ``now_wall`` is the club's clock, as every dashboard builder receives it; the
    predicate takes the UTC instant.
    """
    from padel_app.services.notification_service import student_may_confirm

    ids = [i for i in instance_ids if i is not None]
    if not ids:
        return {}
    now_utc = wall_to_utc_naive(now_wall)
    rows = own_rows(player_id, ids)
    instances = LessonInstance.query.filter(LessonInstance.id.in_(ids)).all()
    out: Dict[int, dict] = {}
    for instance in instances:
        row = rows.get(int(instance.id))
        out[int(instance.id)] = {
            "pendingConfirmation": student_may_confirm(row, instance, None, now=now_utc),
            "attendanceState": row.attendance_state if row is not None else "planned",
        }
    return out


def askable_instances(player_id: int, now_wall: datetime, *, limit: Optional[int] = None) -> List[LessonInstance]:
    """The student's upcoming occurrences they may answer "Vou" on right now, soonest first."""
    from padel_app.services.notification_service import student_may_confirm

    candidates = (
        db.session.query(LessonInstance)
        .join(Presence, Presence.lesson_instance_id == LessonInstance.id)
        .filter(Presence.player_id == player_id)
        .filter(LessonInstance.start_datetime >= now_wall)
        .order_by(LessonInstance.start_datetime.asc())
        .all()
    )
    rows = own_rows(player_id, [c.id for c in candidates])
    now_utc = wall_to_utc_naive(now_wall)
    out = [c for c in candidates if student_may_confirm(rows.get(int(c.id)), c, None, now=now_utc)]
    return out[:limit] if limit else out
