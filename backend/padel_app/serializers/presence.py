from __future__ import annotations

from typing import Iterable, List, Optional


def serialize_presence(presence, *, reminder_sent_at: Optional[object] = None, late_cancellation: Optional[bool] = None):
    """One presence row.

    ``reminderSentAt`` (PAD-199, B-017) is the messaging layer's own record of a
    reminder or invitation reaching this player for this instance — see
    ``presence_signal_service``. Callers serialising a batch should use
    :func:`serialize_presences`, which computes it in two queries for the lot;
    a lone call without it emits ``null``, never a guess off ``invited``.
    """
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
        "reminderSentAt": reminder_sent_at.isoformat() if reminder_sent_at else None,
    }


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
    """Serialise a batch with the real reminder/invitation signal attached."""
    from padel_app.services.presence_signal_service import reminder_sent_at_by_presence

    rows = list(presences)
    sent_at = reminder_sent_at_by_presence(rows)
    late = _late_cancellation_for(rows)
    return [serialize_presence(p, reminder_sent_at=sent_at.get(p.id), late_cancellation=late.get(p.id, False)) for p in rows]
