"""PAD-577 — notifications.invitations rule 15a: an invitation message carries the class's start
(``startsAt``, club wall clock), so a retired invitation can offer the waiting list only while the
class is still ahead.
"""
from unittest.mock import patch

from padel_app.tests.test_pad493_invitations_run_twice import NOW, PATCHES, _seed


def test_an_invitation_message_says_when_the_class_starts(app, monkeypatch):
    from padel_app.models import Message
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import trigger_invitations
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, _, _ = _seed(enrolled=0, candidates=1, max_players=1)
        instance = LessonInstance.query.get(instance_id)
        trigger_invitations(instance, coach_id, now=NOW)
        invite = Message.query.filter_by(message_type="notification_invite").order_by(Message.id.desc()).first()
        assert invite is not None
        assert invite.msg_metadata["lessonInstanceId"] == instance_id
        starts_at = invite.msg_metadata["startsAt"]
        assert starts_at == instance.start_datetime.isoformat()
        # The contract the clients read by: a naive wall-clock string, never an instant.
        assert not starts_at.endswith("Z") and "+" not in starts_at, starts_at


def test_a_manual_invitation_message_says_when_the_class_starts_too(app, monkeypatch):
    """A manual invitation answered after the class filled reads "spot_filled" as well (its own
    late yes), so it carries the same naive club-clock start."""
    from padel_app.models import Message
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import send_manual_notifications
    from padel_app.tests.helpers import pin_clock

    pin_clock(monkeypatch, NOW)
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, _, (player_id,) = _seed(enrolled=0, candidates=1, max_players=1)
        instance = LessonInstance.query.get(instance_id)
        events = send_manual_notifications(instance_id, [player_id], coach_id)
        assert len(events) == 1
        invite = Message.query.get(events[0].message_id)
        starts_at = invite.msg_metadata["startsAt"]
        assert starts_at == instance.start_datetime.isoformat()
        assert not starts_at.endswith("Z") and "+" not in starts_at, starts_at
