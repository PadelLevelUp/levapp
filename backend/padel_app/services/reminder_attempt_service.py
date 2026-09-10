"""notifications.reminders rule 14 (PAD-207, audit M6): the `reminder_attempts`
rows behind every reminder read, and the one place that keeps the reminder
message's `msg_metadata` in step with its row so the clients see no change.

No publishing here: the caller (`notification_service`) owns `publish` and the
recipients; these helpers return the messages whose metadata changed so the
caller can announce them.
"""
from datetime import datetime

from padel_app.sql_db import db


def _query(instance_id, player_id):
    from padel_app.models import ReminderAttempt

    return ReminderAttempt.query.filter_by(lesson_instance_id=instance_id, player_id=player_id)


def count_attempts(instance_id, player_id) -> int:
    """How many reminders this player has had for this class."""
    return _query(instance_id, player_id).count()


def pending_attempts(instance_id, player_id):
    """Attempts still awaiting an answer, newest first."""
    from padel_app.models import ReminderAttempt

    return (
        _query(instance_id, player_id)
        .filter(ReminderAttempt.responded_at.is_(None), ReminderAttempt.superseded.is_(False))
        .order_by(ReminderAttempt.number.desc(), ReminderAttempt.id.desc())
        .all()
    )


def latest_pending_message(instance_id, player_id):
    """The newest pending reminder's message, or None (rule 9 / PAD-94)."""
    for attempt in pending_attempts(instance_id, player_id):
        if attempt.message is not None:
            return attempt.message
    return None


def latest_attempt(instance_id, player_id):
    from padel_app.models import ReminderAttempt

    return _query(instance_id, player_id).order_by(ReminderAttempt.number.desc(), ReminderAttempt.id.desc()).first()


def record_attempt(*, message, instance_id, player_id, presence_id, number, sent_at=None):
    from padel_app.models import ReminderAttempt

    attempt = ReminderAttempt(
        lesson_instance_id=instance_id,
        player_id=player_id,
        presence_id=presence_id,
        number=number,
        message_id=message.id if message is not None else None,
        sent_at=sent_at or datetime.utcnow(),
    )
    db.session.add(attempt)
    db.session.commit()
    return attempt


def _mirror(attempt, **flags):
    """Write the same flags onto the delivery record (the message)."""
    msg = attempt.message
    if msg is None or msg.msg_metadata is None:
        return None
    msg.msg_metadata = {**msg.msg_metadata, **flags}
    msg.save()
    return msg


def mark_superseded(attempt, *, expired=False):
    """Returns the message whose metadata changed, or None."""
    attempt.superseded = True
    if expired:
        attempt.expired = True
    db.session.commit()
    flags = {"superseded": True}
    if expired:
        flags["expired"] = True
    return _mirror(attempt, **flags)


def mark_responded(attempt, response, *, when=None):
    """Returns the message whose metadata changed, or None."""
    attempt.responded_at = when or datetime.utcnow()
    attempt.response = response
    db.session.commit()
    return _mirror(attempt, responded=True, response=response)
