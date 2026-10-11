from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Dict, List, Optional, Tuple

from padel_app.sql_db import db
from padel_app.models import NotificationEvent, LessonInstance
from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive


def _tomorrow_window(now: Optional[datetime] = None) -> Tuple[datetime, datetime]:
    """Half-open [start, end) range covering the *next* club-local calendar day.

    PAD-256 (dashboard.blocks rule 6): ``LessonInstance.start_datetime`` is
    stored on the club's wall clock (R-023), so the window is tomorrow's Lisbon
    midnight to the next one, in wall-clock terms, compared directly. ``now`` is
    a UTC instant. PAD-144 converted the window to naive UTC on the assumption
    that class times were UTC, which made it 23:00-23:00 in summer: today's
    23:30 class counted as tomorrow's, tomorrow's 23:30 class did not, and
    ``notify_pending_confirmations`` nudged the wrong students.
    """
    wall = utc_to_wall_naive(now or utcnow_naive())
    start = datetime.combine(wall.date() + timedelta(days=1), time.min)
    return start, start + timedelta(days=1)


def _pending_pairs(coach_id: int, now: Optional[datetime] = None):
    """
    Distinct (lesson_instance_id, player_id) pairs that are *pending confirmation*
    for the coach's classes tomorrow.

    A pair is pending when there is a NotificationEvent still in the ``sent``
    state: the student was invited/notified but has neither confirmed (event ->
    ``confirmed``) nor declined / timed out (event -> ``expired``).
    """
    start, end = _tomorrow_window(now)
    return (
        db.session.query(
            NotificationEvent.lesson_instance_id,
            NotificationEvent.player_id,
        )
        .join(LessonInstance, LessonInstance.id == NotificationEvent.lesson_instance_id)
        .filter(NotificationEvent.coach_id == coach_id)
        .filter(NotificationEvent.status == "sent")
        .filter(LessonInstance.start_datetime >= start)
        .filter(LessonInstance.start_datetime < end)
        .distinct()
    )


def count_pending_confirmations(*, coach_id: int, now: Optional[datetime] = None) -> int:
    """Number of students still pending confirmation for tomorrow's classes."""
    return _pending_pairs(coach_id, now).count()


def get_pending_confirmation_targets(
    *, coach_id: int, now: Optional[datetime] = None
) -> List[Tuple[int, List[int]]]:
    """
    Pending targets grouped by lesson instance:
        [(lesson_instance_id, [player_id, ...]), ...]
    """
    by_instance: Dict[int, List[int]] = {}
    for instance_id, player_id in _pending_pairs(coach_id, now).all():
        by_instance.setdefault(instance_id, []).append(player_id)
    return list(by_instance.items())


def notify_pending_confirmations(
    *, coach_id: int, now: Optional[datetime] = None
) -> Dict[str, int]:
    """
    Nudge every student still pending confirmation for tomorrow's classes about the invitation they
    already hold. Students who already confirmed or declined are never targeted (they are not in the
    pending set).

    PAD-620 (PAD-612 R2): the nudge used to send each of them a brand-new invitation through
    ``send_manual_notifications`` — a second live invitation, message and push on every press. It now
    re-sends the push of the invitation they already hold (its own text, opening its conversation):
    no new invitation, no new chat message, so the pending set and every bubble stay as they were.
    ``sent`` is the number of students pushed.
    """
    from padel_app.services.notification_service import push_existing_invitation

    targets = get_pending_confirmation_targets(coach_id=coach_id, now=now)
    sent = 0
    for instance_id, player_ids in targets:
        latest = {}
        for event in (
            NotificationEvent.query.filter(
                NotificationEvent.coach_id == coach_id,
                NotificationEvent.lesson_instance_id == instance_id,
                NotificationEvent.player_id.in_(player_ids),
                NotificationEvent.status == "sent",
                NotificationEvent.message_id.isnot(None),
            ).order_by(NotificationEvent.id.asc())
        ):
            latest[event.player_id] = event  # the newest wins
        for event in latest.values():
            if push_existing_invitation(event):
                sent += 1
    return {"instances": len(targets), "sent": sent}
