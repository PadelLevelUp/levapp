"""
PAD-288 — early cancellation (attendance.confirm rules 21–24, coordinator
decisions of 2026-09-11): any future occurrence may be cancelled, the spot
frees through the engine's own rules, the coach is PUSHED only for a late
cancellation (the chat message stays for every one), and a serialized presence
says "cancelled by the student" with the time.
"""
from datetime import datetime
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import _seed_coach_and_student, _seed_instance

PUBLISH = "padel_app.services.notification_service.publish"
WEB_PUSH = "padel_app.services.notification_service.send_push_notification"
EXPO_PUSH = "padel_app.utils.expo_push.send_expo_push_to_user"


def _cancel(app, ids, instance_id):
    from padel_app.services.notification_service import cancel_attendance

    with app.app_context():
        return cancel_attendance(ids["student_user_id"], lesson_instance_id=instance_id)


def _seed(app, ids, start_offset_hours):
    """The reminder-flow seed plus the coach link the cancel path notifies through."""
    from padel_app.models import Association_CoachLessonInstance

    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=start_offset_hours)
    with app.app_context():
        if Association_CoachLessonInstance.query.filter_by(lesson_instance_id=instance_id).first() is None:
            db.session.add(Association_CoachLessonInstance(coach_id=ids["coach_id"], lesson_instance_id=instance_id))
            db.session.commit()
    return instance_id


def _coach_pushes(mock, ids):
    """Pushes aimed at the coach (the same symbol also pushes invited students)."""
    return [c for c in mock.call_args_list if c.kwargs.get("user_id") == ids["coach_user_id"] or (c.args and c.args[0] == ids["coach_user_id"])]


def _coach_messages(app):
    from padel_app.models import Message

    with app.app_context():
        return [m for m in Message.query.all() if (m.msg_metadata or {}).get("cancellation") is True]


def test_a_cancellation_a_month_ahead_frees_the_spot_messages_the_coach_and_does_not_push(app):
    from padel_app.models import LessonInstance, Presence, Vacancy
    from padel_app.serializers.presence import serialize_presence

    ids = _seed_coach_and_student(app)
    instance_id = _seed(app, ids, 24 * 30)
    with patch(PUBLISH), patch(WEB_PUSH) as web_push, patch(EXPO_PUSH) as expo_push:
        result = _cancel(app, ids, instance_id)
    assert result["action"] == "declined"
    assert result.get("proactive") is True
    assert _coach_pushes(web_push, ids) == []
    assert _coach_pushes(expo_push, ids) == []
    assert len(_coach_messages(app)) == 1

    with app.app_context():
        vacancy = Vacancy.query.filter_by(lesson_instance_id=instance_id, status="open").one()
        assert vacancy.invite_not_before is not None
        presence = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=ids["student_id"]).one()
        assert presence.late_cancellation is False
        row = serialize_presence(presence)
        assert row["cancelledByStudent"] is True
        assert row["cancelledAt"] is not None and row["cancelledAt"].endswith("+00:00")  # a UTC instant
        assert db.session.get(LessonInstance, instance_id).effective_filled_spots == 0


def test_a_late_cancellation_still_pushes_the_coach_once(app):
    ids = _seed_coach_and_student(app)
    instance_id = _seed(app, ids, 2)
    with patch(PUBLISH), patch(WEB_PUSH) as web_push, patch(EXPO_PUSH) as expo_push:
        result = _cancel(app, ids, instance_id)
    assert result["action"] == "declined"
    assert len(_coach_pushes(web_push, ids)) == 1
    assert len(_coach_pushes(expo_push, ids)) == 1
    messages = _coach_messages(app)
    assert len(messages) == 1 and messages[0].msg_metadata["lateCancellation"] is True


def test_a_coach_marked_justified_absence_is_not_cancelled_by_the_student(app):
    from padel_app.models import Presence
    from padel_app.serializers.presence import serialize_presence

    ids = _seed_coach_and_student(app)
    instance_id = _seed(app, ids, 48)
    with app.app_context():
        presence = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=ids["student_id"]).one()
        presence.status = "absent"
        presence.justification = "justified"
        presence.validated = True
        db.session.commit()
        row = serialize_presence(presence)
        assert row["cancelledByStudent"] is False
        assert row["cancelledAt"] is None
        # An unanswered, unvalidated row is not "cancelled" either.
        presence.status = None
        presence.justification = None
        presence.validated = False
        db.session.commit()
        row = serialize_presence(presence)
        assert row["cancelledByStudent"] is False and row["cancelledAt"] is None
