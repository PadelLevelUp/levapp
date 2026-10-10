"""PAD-570 (dashboard.blocks rule 3a, attendance.confirm rule 27): the student's ask, batched.

Every dashboard surface that shows a student their own class — the hero, the schedule rows,
the "Precisa de ti" invite card and the Invites tile — reads ``pendingConfirmation`` from
the ONE server predicate, ``notification_service.student_may_confirm``. This module runs it
over a student's upcoming occurrences in a handful of queries; it never re-derives the ask.
"""
from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from typing import Any, Dict, Iterable, List, Optional

from padel_app.services import reminder_attempt_service as attempts
from padel_app.models import (
    Association_CoachLesson,
    Association_CoachLessonInstance,
    LessonInstance,
    Presence,
)
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


def _default_timing_config():
    """What ``proactive_decline_deadline`` falls back to when no coach config exists."""
    from padel_app.models.notification_config import DEFAULT_REMINDER_TIMING

    return SimpleNamespace(get_reminder_timing=lambda: DEFAULT_REMINDER_TIMING)


def _configs_by_coach(coach_ids: Iterable[int]) -> Dict[int, Any]:
    from padel_app.models.notification_config import NotificationConfig

    ids = {int(c) for c in coach_ids}
    if not ids:
        return {}
    out: Dict[int, Any] = {}
    for cfg in NotificationConfig.query.filter(NotificationConfig.coach_id.in_(ids)).all():
        out.setdefault(int(cfg.coach_id), cfg)
    return out


def lesson_reminder_configs(lesson_ids: Iterable[int]) -> Dict[int, Any]:
    """``{lesson_id: reminder config}`` for the lesson's primary coach (first junction row).

    PAD-583 (dashboard.blocks rule 8): ``student_may_confirm`` asks
    ``proactive_decline_deadline`` for the coach's reminder timing, and with no config
    passed that is ``primary_coach`` + a ``NotificationConfig`` query PER OCCURRENCE (the
    ``coaches`` SELECTs of the student dashboard). Resolved here for a whole set in two
    queries, with the same answer: the first coach by junction id, else the default timing.
    """
    ids = {int(i) for i in lesson_ids if i is not None}
    if not ids:
        return {}
    first: Dict[int, int] = {}
    for row in (
        Association_CoachLesson.query.filter(Association_CoachLesson.lesson_id.in_(ids))
        .order_by(Association_CoachLesson.id.asc())
        .all()
    ):
        first.setdefault(int(row.lesson_id), int(row.coach_id))
    configs = _configs_by_coach(first.values())
    default = _default_timing_config()
    return {lid: configs.get(first.get(lid), default) if lid in first else default for lid in ids}


def reminder_configs(instances: Iterable[LessonInstance]) -> Dict[int, Any]:
    """``{instance_id: reminder config}`` — the instance's own coach, else its lesson's
    (``lesson_service.coaches_for``), batched. See ``lesson_reminder_configs`` (PAD-583)."""
    instances = list(instances)
    ids = {int(i.id) for i in instances}
    if not ids:
        return {}
    first: Dict[int, int] = {}
    for row in (
        Association_CoachLessonInstance.query.filter(Association_CoachLessonInstance.lesson_instance_id.in_(ids))
        .order_by(Association_CoachLessonInstance.id.asc())
        .all()
    ):
        first.setdefault(int(row.lesson_instance_id), int(row.coach_id))
    inherited = lesson_reminder_configs(i.lesson_id for i in instances if int(i.id) not in first)
    own = _configs_by_coach(first.values())
    default = _default_timing_config()
    out: Dict[int, Any] = {}
    for inst in instances:
        iid = int(inst.id)
        if iid in first:
            out[iid] = own.get(first[iid], default)
        else:
            out[iid] = inherited.get(int(inst.lesson_id), default) if inst.lesson_id is not None else default
    return out


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
    asked = attempts.asked_instance_ids(player_id, ids)  # PAD-583: one query, not one per instance
    instances = LessonInstance.query.filter(LessonInstance.id.in_(ids)).all()
    configs = reminder_configs(instances)  # PAD-583: one batch, not a coach lookup per instance
    out: Dict[int, dict] = {}
    for instance in instances:
        row = rows.get(int(instance.id))
        out[int(instance.id)] = {
            "pendingConfirmation": student_may_confirm(
                row, instance, configs[int(instance.id)], now=now_utc, was_asked=int(instance.id) in asked
            ),
            "attendanceState": row.attendance_state if row is not None else "planned",
        }
    return out


def askable_instances(player_id: int, now_wall: datetime, *, limit: Optional[int] = None) -> List[LessonInstance]:
    """The student's upcoming occurrences they may answer "Vou" on right now, soonest first."""
    from padel_app.services.notification_service import student_may_confirm

    query = (
        db.session.query(LessonInstance)
        .join(Presence, Presence.lesson_instance_id == LessonInstance.id)
        .filter(Presence.player_id == player_id)
        .filter(LessonInstance.start_datetime >= now_wall)
        .order_by(LessonInstance.start_datetime.asc())
    )
    if limit:
        # PAD-583: the queue serialises these rows; the Invites tile only counts them.
        from padel_app.helpers.calendar_helpers import instance_serializer_options

        query = query.options(*instance_serializer_options())
    candidates = query.all()
    rows = own_rows(player_id, [c.id for c in candidates])
    configs = reminder_configs(candidates)  # PAD-583
    asked = attempts.asked_instance_ids(player_id, [c.id for c in candidates])  # PAD-583
    now_utc = wall_to_utc_naive(now_wall)
    out = [
        c for c in candidates
        if student_may_confirm(
            rows.get(int(c.id)), c, configs[int(c.id)], now=now_utc, was_asked=int(c.id) in asked
        )
    ]
    return out[:limit] if limit else out
