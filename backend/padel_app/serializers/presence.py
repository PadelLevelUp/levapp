from __future__ import annotations

from typing import Iterable, List, Optional


def serialize_presence(presence, *, reminder_sent_at: Optional[object] = None):
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
        "lateCancellation": presence.late_cancellation,
        # PAD-313 (rule 9): the one derived state every surface renders.
        # The raw columns above stay while the clients move over.
        "attendanceState": presence.attendance_state,
        "reminderSentAt": reminder_sent_at.isoformat() if reminder_sent_at else None,
    }


def serialize_presences(presences: Iterable) -> List[dict]:
    """Serialise a batch with the real reminder/invitation signal attached."""
    from padel_app.services.presence_signal_service import reminder_sent_at_by_presence

    rows = list(presences)
    sent_at = reminder_sent_at_by_presence(rows)
    return [serialize_presence(p, reminder_sent_at=sent_at.get(p.id)) for p in rows]
