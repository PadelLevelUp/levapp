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
    """How many reminders this player has had for the spot they hold NOW.

    Voided attempts (see :func:`void_for_return`) do not count: they belong to a
    previous stint in this class, and the cap is about whether we have asked the
    student about the seat they currently hold.

    `superseded` alone is NOT the discriminator — every new reminder supersedes
    the previous one (PAD-49), so excluding those would uncap reminders entirely.
    Only the superseded-AND-expired pair means "void", and the one other writer
    of that pair, `_expire_stale_reminders`, runs only for a class that is over,
    which `send_class_reminders` already refuses to send for.
    """
    from padel_app.models import ReminderAttempt

    return (
        _query(instance_id, player_id)
        .filter(
            ~(ReminderAttempt.superseded.is_(True) & ReminderAttempt.expired.is_(True))
        )
        .count()
    )


def void_for_return(instance_id, player_id):
    """PAD-318: a student is back in the class, so the earlier round is void.

    A coach re-adding someone who had cancelled gives them a new seat. The
    reminders from before that cancellation asked about a seat they no longer
    held, so they stop counting toward the cap — otherwise the student is never
    asked again for this occurrence and sits at `planned` indefinitely, with the
    coach seeing no answer and no signal to go and ask.

    Voiding also retires the old bubbles: an un-actioned Yes/No from the previous
    stint must not stay tappable, which is PAD-49's rule and PAD-94's reason.
    Returns the messages whose flags changed, for the caller to publish.
    """
    changed = []
    for attempt in _query(instance_id, player_id).all():
        if attempt.superseded and attempt.expired:
            continue
        message = mark_superseded(attempt, expired=True)
        if message is not None:
            changed.append(message)
    return changed


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


def latest_counted_attempt(instance_id, player_id):
    """PAD-407: the newest attempt that `count_attempts` counts (voided ones excluded)."""
    from padel_app.models import ReminderAttempt

    return (
        _query(instance_id, player_id)
        .filter(~(ReminderAttempt.superseded.is_(True) & ReminderAttempt.expired.is_(True)))
        .order_by(ReminderAttempt.sent_at.desc(), ReminderAttempt.id.desc())
        .first()
    )


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
