from __future__ import annotations

from typing import Iterable, List, Optional


_UNSET = object()


def _sides_for(presences) -> dict:
    """PAD-551 (classes.instance-enrollment rule 13): ``{player_id: side in the occurrence}`` for one
    occurrence's rows — the coach's override first, else the player's usual side with the class's
    coach — in one query (`notification_service.sides_in_occurrence`)."""
    from padel_app.services.lesson_service import primary_coach
    from padel_app.services.notification_service import sides_in_occurrence

    rows = list(presences)
    if not rows or rows[0].lesson_instance is None:
        return {p.player_id: p.side for p in rows}
    instance = rows[0].lesson_instance
    coach = primary_coach(instance)
    if coach is None:
        return {p.player_id: p.side for p in rows}
    return sides_in_occurrence(instance, coach.id, [p.player_id for p in rows])


def serialize_presence(presence, *, reminder_sent_at: Optional[object] = None, late_cancellation: Optional[bool] = None,
                       side=_UNSET):
    """One presence row.

    ``reminderSentAt`` (PAD-199, B-017) is the messaging layer's own record of a
    reminder or invitation reaching this player for this instance — see
    ``presence_signal_service``. Callers serialising a batch should use
    :func:`serialize_presences`, which computes it in two queries for the lot;
    a lone call without it emits ``null``, never a guess off ``invited``.
    """
    from padel_app.utils.dates import to_utc_iso

    cancelled_by_student = (
        presence.status == "absent"
        and presence.justification == "justified"
        and not presence.validated
    )
    return {
        "id": presence.id,
        "lessonInstanceId": presence.lesson_instance_id,
        "playerId": presence.player_id,
        "status": presence.status,
        "justification": presence.justification,
        "invited": presence.invited,
        "confirmed": presence.confirmed,
        "validated": presence.validated,
        # PAD-271 M5 (attendance.presence rule 7): the answer as one field, and
        # lateness DERIVED from it against the deadline (no column).
        "response": presence.response,
        "respondedAt": presence.responded_at.isoformat() if presence.responded_at else None,
        "recordedBy": presence.recorded_by,
        "lateCancellation": (
            late_cancellation if late_cancellation is not None
            else _late_cancellation_for([presence]).get(presence.id, False)
        ),
        # PAD-313 (rule 9): the one derived state every surface renders.
        # The raw columns above stay while the clients move over.
        "attendanceState": presence.attendance_state,
        "reminderSentAt": reminder_sent_at.isoformat() if reminder_sent_at else None,
        # PAD-288 (attendance.confirm rule 23, attendance.presence): derived, no
        # column — the shape only the student's own decline produces before the
        # coach validates the sheet; the time is the row's last write, which
        # the decline sets.
        "cancelledByStudent": cancelled_by_student,
        "cancelledAt": to_utc_iso(presence.updated_at) if cancelled_by_student and presence.updated_at else None,
        # PAD-551 (classes.instance-enrollment rule 13): the side in this occurrence, and whether the
        # coach set it here (else it is the player's usual side).
        "side": _sides_for([presence]).get(presence.player_id) if side is _UNSET else side,
        "sideOverride": presence.side is not None,
        # PAD-672 (instance-enrollment rule 13a): a "both" player's side once the class is full.
        "assignedSide": _assigned_side(presence),
        # The server's answer to "may the coach still change it" (rule 13: until the occurrence
        # ends), so no client compares a date with its own clock.
        "sideEditable": _side_editable(presence),
    }


def _assigned_side(presence):
    from padel_app.services.lesson_service import primary_coach
    from padel_app.services.notification_service import assigned_sides

    instance = presence.lesson_instance
    if instance is None:
        return None
    if presence.assigned_side:
        return presence.assigned_side
    coach = primary_coach(instance)
    return assigned_sides(instance, coach.id if coach else None).get(presence.player_id)


def _side_editable(presence) -> bool:
    from padel_app.services.presence_side_service import occurrence_side_editable

    return presence.lesson_instance is not None and occurrence_side_editable(presence.lesson_instance)


def _late_cancellation_for(presences) -> dict:
    """Derived lateness for a batch: one config lookup per coach, the instance
    read from the row (already loaded by every caller)."""
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.presence_response import presence_late_cancellation

    configs: dict = {}
    out = {}
    for p in presences:
        if getattr(p, "response", None) != "cancelled":
            out[p.id] = False
            continue
        instance = p.lesson_instance
        coach_id = None
        if instance is not None:
            rel = instance.coaches_relations[0] if instance.coaches_relations else None
            if rel is None and instance.lesson is not None and instance.lesson.coaches_relations:
                rel = instance.lesson.coaches_relations[0]
            coach_id = rel.coach_id if rel is not None else None
        if coach_id is not None and coach_id not in configs:
            configs[coach_id] = NotificationConfig.query.filter_by(coach_id=coach_id).first()
        out[p.id] = presence_late_cancellation(p, instance, configs.get(coach_id))
    return out


def serialize_presences(presences: Iterable) -> List[dict]:
    """Serialise a batch with the real reminder/invitation signal attached.

    Every caller passes one occurrence's presences, so they come out in the roster's
    one order (classes.instance-enrollment rule 12, D163).
    """
    from padel_app.services.presence_signal_service import reminder_sent_at_by_presence
    from padel_app.services.roster_order import in_roster_order

    rows = in_roster_order(presences)
    sent_at = reminder_sent_at_by_presence(rows)
    late = _late_cancellation_for(rows)
    sides = _sides_for(rows)
    return [
        serialize_presence(p, reminder_sent_at=sent_at.get(p.id), late_cancellation=late.get(p.id, False),
                           side=sides.get(p.player_id))
        for p in rows
    ]
