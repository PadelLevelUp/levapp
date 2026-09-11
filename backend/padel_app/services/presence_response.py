"""PAD-271 M5 (attendance.presence rule 7): the student's answer as one field.

``Presence.response`` is written only by the student's own actions (reminder
yes/no, cancel, proactive decline) and the import; the coach's attendance mark
(``status`` / ``justification`` / ``validated``) never moves it. ``late_cancellation``
is no longer stored: it is derived here from ``response`` and ``responded_at``
against the coach's cancellation deadline (``attendance.confirm`` rule 6).

Phase 1 (this module): the columns exist and are written; the legacy
``invited`` / ``confirmed`` booleans are still written where they always were
(shadow) and still read. Phase 2 derives them from ``response`` and moves the
readers and both shells over.
"""
from __future__ import annotations

from datetime import datetime, timedelta

RESPONSES = ("none", "confirmed", "declined", "cancelled", "proactive_decline")
RECORDED_BY = ("student", "coach", "system", "import")

#: The three answers that give the spot up (capacity, phase 2).
DECLINING = ("declined", "cancelled", "proactive_decline")


def response_from_legacy_flags(
    *, status=None, justification=None, validated=False, confirmed=False, late_cancellation=False
) -> str:
    """The migration's mapping from the pre-M5 flags, checked row by row by
    ``test_pad271_presence_response``. Mirrors ``BACKFILL_RESPONSE`` in
    migration 7558c350c002 exactly; change both or neither."""
    if status == "absent" and not validated:
        return "cancelled" if late_cancellation else "declined"
    if confirmed and status != "absent":
        return "confirmed"
    return "none"


def record_response(presence, response: str, *, recorded_by: str = "student", when: datetime | None = None):
    """Write the student's answer. Never touches ``status`` / ``justification``."""
    if response not in RESPONSES:
        raise ValueError(f"unknown response {response!r}")
    if recorded_by not in RECORDED_BY:
        raise ValueError(f"unknown recorded_by {recorded_by!r}")
    presence.response = response
    presence.responded_at = when or datetime.utcnow()
    presence.recorded_by = recorded_by
    return presence


def cancellation_deadline_utc(instance, config=None) -> datetime | None:
    """``attendance.confirm`` rule 6: N real hours before the class's real start
    (the stored start is Lisbon wall-clock, R-023 / PAD-256)."""
    from padel_app.models.notification_config import DEFAULT_CANCELLATION_DEADLINE_HOURS
    from padel_app.utils.dates import wall_to_utc_naive

    if instance is None or instance.start_datetime is None:
        return None
    hours = (
        config.get_cancellation_deadline_hours()
        if config is not None
        else DEFAULT_CANCELLATION_DEADLINE_HOURS
    )
    return wall_to_utc_naive(instance.start_datetime) - timedelta(hours=hours)


def presence_late_cancellation(presence, instance=None, config=None) -> bool:
    """Derived ``lateCancellation``: a cancellation answered at or after the
    deadline. A proactive decline is never late (``attendance.confirm`` rule 12);
    a plain reminder decline never was."""
    if presence is None or getattr(presence, "response", None) != "cancelled":
        return False
    if presence.responded_at is None:
        return False
    deadline = cancellation_deadline_utc(instance or presence.lesson_instance, config)
    if deadline is None:
        return False
    return presence.responded_at >= deadline
