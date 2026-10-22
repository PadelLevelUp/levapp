"""PAD-732 (B-618) — a manual invitation always goes out; "notifications off" is the engine's switch.

notifications.toggle-class rule 3b (owner, 2026-10-22): with `notifications_enabled` off, the
engine sends no automatic invitations for the class, but a coach's manual invitation is sent and
recorded like on any other class. Before PAD-732 `send_manual_notifications` returned `[]` for an
off class and the route answered 200, so the coach thought the student was invited. (Reminders on
an off class are a separate open question: the reminder path does not read the switch today.)

    pytest padel_app/tests/test_pad732_manual_invite_on_a_notifications_off_class.py -v
"""
from unittest.mock import patch

from padel_app.tests.test_notification_integration import PATCHES
from padel_app.tests.test_pad429_private_class_defaults import _class_with_a_candidate, _set


def _off_class(app, name):
    from padel_app.models.lesson_instances import LessonInstance

    ids = _class_with_a_candidate(app, lesson_type="academy", name=name)
    _set(app, LessonInstance, ids["instance_id"], notifications_enabled=False)
    return ids


def _events(app, ids):
    from padel_app.models.notification_event import NotificationEvent

    with app.app_context():
        return [
            (e.player_id, e.type, e.status, e.message_id is not None)
            for e in NotificationEvent.query.filter_by(lesson_instance_id=ids["instance_id"]).all()
        ]


def test_a_manual_invitation_on_an_off_class_is_sent_and_recorded(app):
    from padel_app.services.notification_service import send_manual_notifications

    ids = _off_class(app, "pad732-manual")
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        sent = send_manual_notifications(ids["instance_id"], [ids["candidate_id"]], ids["coach_id"])
        assert len(sent) == 1
    # Recorded: a manual invitation row, live, with the chat message it was sent as.
    assert _events(app, ids) == [(ids["candidate_id"], "manual", "sent", True)]


def test_an_off_class_still_gets_no_automatic_invitation(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import trigger_invitations

    ids = _off_class(app, "pad732-auto")
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        assert trigger_invitations(LessonInstance.query.get(ids["instance_id"]), ids["coach_id"]) == []
    assert _events(app, ids) == []
