"""notifications.reminders rule 13 (PAD-202): answering a reminder is reading it.

The student dashboard offers Yes/No on a class row, so a reminder can be
answered without the chat ever being opened. The unread badge is driven by
``ConversationParticipant.last_read_at``, which only the chat screen used to
advance — so an answer given elsewhere left the reminder counting as unread
forever. ``respond_to_reminder`` now moves the marker to the moment of a fresh
answer: the reminder, anything before it and the acknowledgement the answer
produces are read; anything sent after the answer is not.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.tests.test_notification_reminder_flow import (
    PATCHES,
    _seed_coach_and_student,
    _seed_instance,
)


def _participation(conversation_id, user_id):
    from padel_app.models import ConversationParticipant

    return ConversationParticipant.query.filter_by(
        conversation_id=conversation_id, user_id=user_id
    ).one()


def _reminder_and_conversation(coach_user_id, student_user_id):
    from padel_app.models.messages import Message
    from padel_app.services.notification_service import _get_or_create_direct_conversation

    conv = _get_or_create_direct_conversation(coach_user_id, student_user_id)
    reminder = (
        Message.query.filter_by(conversation_id=conv.id, message_type="notification_reminder")
        .order_by(Message.id.desc())
        .first()
    )
    return reminder, conv


def _coach_text_after(conv, coach_user_id, sent_at):
    from padel_app.models.messages import Message

    msg = Message(
        conversation_id=conv.id,
        sender_id=coach_user_id,
        text="Bring a second racket",
        message_type="text",
        sent_at=sent_at,
    )
    msg.create()
    return msg


def test_answer_marks_the_conversation_read_up_to_the_answer(app):
    from padel_app.helpers.dashboard.messages import compute_message_overview
    from padel_app.services.notification_service import respond_to_reminder, send_class_reminders

    ids = _seed_coach_and_student(app)
    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=12)

    with app.app_context():
        t0 = datetime(2026, 8, 4, 10, 0)
        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_class_reminders(instance_id, now=t0)

            reminder, conv = _reminder_and_conversation(ids["coach_user_id"], ids["student_user_id"])
            assert reminder is not None
            # The reminder is stamped with the wall clock, so "later" is relative to it —
            # and must still land before the answer, which comes a moment from now.
            _coach_text_after(conv, ids["coach_user_id"], reminder.sent_at + timedelta(microseconds=1))

            # Nothing read yet: reminder + the later text are both unread.
            unread_before, _, _ = compute_message_overview(user_id=ids["student_user_id"])
            assert unread_before == 2

            result = respond_to_reminder(instance_id, "yes", ids["student_user_id"], now=t0 + timedelta(minutes=10))
            assert result == {"action": "confirmed"}

        part = _participation(conv.id, ids["student_user_id"])
        assert part.last_read_at is not None and part.last_read_at >= reminder.sent_at

        # Reminder, the coach text and the "confirmed" acknowledgement: all read.
        unread_after, _, _ = compute_message_overview(user_id=ids["student_user_id"])
        assert unread_after == 0

        # Something the coach sends AFTER the answer is news again.
        _coach_text_after(conv, ids["coach_user_id"], part.last_read_at + timedelta(minutes=5))
        unread_later, _, _ = compute_message_overview(user_id=ids["student_user_id"])
        assert unread_later == 1


def test_marker_never_moves_backwards(app):
    """A student who already read past the reminder keeps their later marker."""
    from padel_app.services.notification_service import respond_to_reminder, send_class_reminders

    ids = _seed_coach_and_student(app)
    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=12)

    with app.app_context():
        t0 = datetime(2026, 8, 4, 10, 0)
        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_class_reminders(instance_id, now=t0)
            reminder, conv = _reminder_and_conversation(ids["coach_user_id"], ids["student_user_id"])

            part = _participation(conv.id, ids["student_user_id"])
            later = datetime(2030, 1, 1)
            part.last_read_at = later
            part.save()

            respond_to_reminder(instance_id, "no", ids["student_user_id"], now=t0 + timedelta(hours=2))

        part = _participation(conv.id, ids["student_user_id"])
        assert part.last_read_at == later


def test_duplicate_answer_does_not_touch_the_marker(app):
    from padel_app.services.notification_service import respond_to_reminder, send_class_reminders

    ids = _seed_coach_and_student(app)
    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=12)

    with app.app_context():
        t0 = datetime(2026, 8, 4, 10, 0)
        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_class_reminders(instance_id, now=t0)
            reminder, conv = _reminder_and_conversation(ids["coach_user_id"], ids["student_user_id"])
            respond_to_reminder(instance_id, "yes", ids["student_user_id"], now=t0 + timedelta(minutes=1))
            marker = _participation(conv.id, ids["student_user_id"]).last_read_at
            # A later coach message, then an impatient second "yes".
            _coach_text_after(conv, ids["coach_user_id"], marker + timedelta(minutes=5))
            dup = respond_to_reminder(instance_id, "yes", ids["student_user_id"], now=t0 + timedelta(minutes=6))
            assert dup.get("duplicate") is True

        part = _participation(conv.id, ids["student_user_id"])
        assert part.last_read_at == marker
