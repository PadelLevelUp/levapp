"""PAD-408 (messaging.push-notifications rule 12) — a message push names the
message, not just the thread.

Every push that announces a `Message` row must carry that row's id alongside
its conversation: the native Expo `data` gains `messageId`, and the web
push's `url` gains `?message=<id>`. Rule 12 names two writers explicitly
(`messaging_service.create_message_service` and
`notification_service._send_system_message`), and the PAD-324 parity guard
extends to the new field: both pushes for one event must name the same
message, not just the same conversation.

The same rule (rule 7's "every push that announces a Message row") reaches
four more coach-facing writers, each of which builds its own `Message` row and
sends its own web + Expo push pair rather than going through either of the two
named functions:

  - `class_join_request_service._notify_coach_of_request` (a student's join
    request)
  - `notification_service._notify_coach_of_cancellation` (a late cancellation
    notice)
  - `academy_class_service._tell_coach_of_waiting_list_join` (a waiting-list
    join)
  - `class_request_service._tell_coach` (a class request)
"""
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_native_push import _create_user, _dm_fixture


def _register_ios_token(user_id, token):
    from padel_app.models import DeviceToken

    DeviceToken(user_id=user_id, token=token, platform="ios").create()


# ---------------------------------------------------------------------------
# Direct messages — messaging_service.create_message_service
# ---------------------------------------------------------------------------

def test_direct_message_native_push_carries_the_message_id(app):
    """create_message_service's Expo `data` names the message it announces."""
    from padel_app.services.messaging_service import create_message_service

    with app.app_context():
        sender, _recipient, conversation = _dm_fixture(
            "Ana Coach", "Bruno Player", "pad408dm"
        )
        conversation_id, sender_id = conversation.id, sender.id

        with patch("padel_app.services.messaging_service.publish"), \
             patch("padel_app.services.messaging_service.send_push_notification"), \
             patch("padel_app.services.messaging_service.send_expo_push_to_user") as mock_expo:
            message = create_message_service(
                {"conversationId": conversation_id, "text": "hello there"}, sender_id
            )

        assert mock_expo.call_count == 1
        data = mock_expo.call_args.kwargs["data"]
        assert data.get("messageId") == message.id, (
            f"native push data is {data!r}, missing the message id (PAD-408)"
        )


def test_direct_message_web_push_url_names_the_message(app):
    """The web push's `url` becomes `/messages/<cid>?message=<mid>`."""
    from padel_app.services.messaging_service import create_message_service

    with app.app_context():
        sender, _recipient, conversation = _dm_fixture(
            "Carla Coach", "Diogo Player", "pad408web"
        )
        conversation_id, sender_id = conversation.id, sender.id

        with patch("padel_app.services.messaging_service.publish"), \
             patch("padel_app.services.messaging_service.send_push_notification") as mock_web, \
             patch("padel_app.services.messaging_service.send_expo_push_to_user"):
            message = create_message_service(
                {"conversationId": conversation_id, "text": "hello again"}, sender_id
            )

        assert mock_web.call_count == 1
        url = mock_web.call_args.kwargs["url"]
        assert url == f"/messages/{conversation_id}?message={message.id}", (
            f"web push url is {url!r} (PAD-408)"
        )


# ---------------------------------------------------------------------------
# System messages — notification_service._send_system_message
# ---------------------------------------------------------------------------

def test_system_message_native_push_carries_the_message_id(app):
    """_send_system_message's own Expo push names the Message row it just
    wrote — this covers every system message (invitations, reminders, spot
    filled, waiting-list offers) alike, not only direct messages."""
    from padel_app.services.notification_service import _send_system_message

    with app.app_context():
        coach = _create_user("Coach", "pad408-sys-coach")
        student = _create_user("Student", "pad408-sys-student")
        db.session.commit()
        _register_ios_token(student.id, "ExponentPushToken[pad408sys]")

        with patch("padel_app.services.notification_service.publish"), \
             patch("padel_app.services.notification_service.send_push_notification"), \
             patch("padel_app.utils.expo_push.send_expo_push_to_user") as mock_expo:
            msg = _send_system_message(
                coach.id, student.id, "You're invited to tomorrow's class",
                message_type="text",
            )

        assert msg is not None
        assert mock_expo.call_count == 1
        data = mock_expo.call_args.kwargs["data"]
        assert data.get("messageId") == msg.id, (
            f"native push data is {data!r}, missing the message id (PAD-408)"
        )


def test_system_message_web_push_url_names_the_message(app):
    """The web sibling of a system-message push gets the same `?message=`."""
    from padel_app.services.notification_service import _send_system_message

    with app.app_context():
        coach = _create_user("Coach", "pad408-sys2-coach")
        student = _create_user("Student", "pad408-sys2-student")
        db.session.commit()
        _register_ios_token(student.id, "ExponentPushToken[pad408sys2]")

        with patch("padel_app.services.notification_service.publish"), \
             patch("padel_app.services.notification_service.send_push_notification") as mock_web, \
             patch("padel_app.utils.expo_push.send_expo_push_to_user"):
            msg = _send_system_message(
                coach.id, student.id, "Reminder: class tomorrow",
                message_type="text",
            )

        assert msg is not None
        assert mock_web.call_count == 1
        url = mock_web.call_args.kwargs["url"]
        assert url == f"/messages/{msg.conversation_id}?message={msg.id}", (
            f"web push url is {url!r} (PAD-408)"
        )


def test_system_message_pushes_name_the_same_conversation_and_message(app):
    """PAD-324 parity, extended by PAD-408: both channels must agree on the
    conversation AND the message, for one event."""
    from padel_app.services.notification_service import _send_system_message

    with app.app_context():
        coach = _create_user("Coach", "pad408-parity-coach")
        student = _create_user("Student", "pad408-parity-student")
        db.session.commit()
        _register_ios_token(student.id, "ExponentPushToken[pad408parity]")

        with patch("padel_app.services.notification_service.publish"), \
             patch("padel_app.services.notification_service.send_push_notification") as mock_web, \
             patch("padel_app.utils.expo_push.send_expo_push_to_user") as mock_expo:
            msg = _send_system_message(
                coach.id, student.id, "Your spot opened up",
                message_type="text",
            )

        assert msg is not None
        url = mock_web.call_args.kwargs["url"]
        data = mock_expo.call_args.kwargs["data"]
        assert data["type"] == "message"
        assert data["conversationId"] == msg.conversation_id
        assert data.get("messageId") == msg.id, (
            f"native push data is {data!r}, missing the message id (PAD-408)"
        )
        assert url == "/messages/{}?message={}".format(
            data["conversationId"], data.get("messageId")
        ), (
            "the web and native pushes for one event must name the same "
            f"conversation and message: web={url!r} native={data!r}"
        )


# ---------------------------------------------------------------------------
# The four other coach-facing writers (rule 7's "every push that announces a
# Message row"), each with its own web + Expo push pair rather than routing
# through `create_message_service` or `_send_system_message`.
# ---------------------------------------------------------------------------

def test_join_request_coach_push_carries_the_message_id(app):
    """class_join_request_service._notify_coach_of_request: the coach's web
    and native pushes both name the Message row the request created."""
    from padel_app.models import Message
    from padel_app.tests.test_pad131_join_requests import _config, _seed, _student
    from padel_app.tests.test_pad324_push_targets_agree import _pushes as _join_request_pushes

    ids = _seed(app)
    _config(app, ids, open_spots_visible=True)
    pid = _student(app, ids, "pad408-asker")

    url, data = _join_request_pushes(app, ids, pid)

    with app.app_context():
        msg = (
            Message.query.filter_by(conversation_id=data["conversationId"])
            .order_by(Message.id.desc())
            .first()
        )

    assert data.get("messageId") == msg.id, (
        f"native push data is {data!r}, missing the message id (PAD-408)"
    )
    assert url == f"/messages/{data['conversationId']}?message={msg.id}", (
        f"web push url is {url!r} (PAD-408)"
    )


def test_cancellation_notice_native_push_carries_the_message_id(app):
    """notification_service._notify_coach_of_cancellation: a student's late
    cancellation pushes the coach with the Message row's id."""
    from datetime import datetime, timedelta

    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.players import Player
    from padel_app.services.notification_service import _notify_coach_of_cancellation

    with app.app_context():
        coach_user = _create_user("Coach", "pad408-cancel-coach")
        player_user = _create_user("Player", "pad408-cancel-player")
        db.session.flush()
        coach = Coach(user_id=coach_user.id)
        db.session.add(coach)
        player = Player(user_id=player_user.id)
        db.session.add(player)
        club = Club(name="Club", description="", location="City")
        db.session.add(club)
        db.session.flush()
        start = datetime.utcnow() + timedelta(hours=48)
        lesson = Lesson(title="Class", start_datetime=start, end_datetime=start + timedelta(hours=1),
                         is_recurring=False, type="academy", max_players=4, color="#000",
                         status="active", club_id=club.id)
        db.session.add(lesson)
        db.session.flush()
        instance = LessonInstance(lesson_id=lesson.id, start_datetime=start,
                                   end_datetime=start + timedelta(hours=1), max_players=4,
                                   status="scheduled", notifications_enabled=True)
        db.session.add(instance)
        db.session.commit()
        _register_ios_token(coach_user.id, "ExponentPushToken[pad408cancel]")

        with patch("padel_app.services.notification_service.publish"), \
             patch("padel_app.services.notification_service.send_push_notification") as mock_web, \
             patch("padel_app.utils.expo_push.send_expo_push_to_user") as mock_expo:
            msg = _notify_coach_of_cancellation(
                coach_user.id, player_user.id, instance, player, is_late=True
            )

        assert msg is not None
        data = mock_expo.call_args.kwargs["data"]
        url = mock_web.call_args.kwargs["url"]
        assert data.get("messageId") == msg.id, (
            f"native push data is {data!r}, missing the message id (PAD-408)"
        )
        assert url == f"/messages/{msg.conversation_id}?message={msg.id}", (
            f"web push url is {url!r} (PAD-408)"
        )


def test_waiting_list_join_native_push_carries_the_message_id(app):
    """academy_class_service._tell_coach_of_waiting_list_join: the coach's
    push names the Message row the join created."""
    from padel_app.models import Message
    from padel_app.tests.test_pad358_academy_classes import (
        _add_class,
        _join as _join_waiting_list,
    )
    from padel_app.tests.test_pad358_academy_classes import _setup as _seed_academy

    ids = _seed_academy(app)
    full = _add_class(app, ids, days=3, title="Pad408 Full", max_players=2, filled=2)

    with patch("padel_app.services.notification_service.publish"), \
         patch("padel_app.utils.push_notifications.send_push_notification") as mock_web, \
         patch("padel_app.utils.expo_push.send_expo_push_to_user") as mock_expo:
        _join_waiting_list(app, ids, model="LessonInstance", original_id=full["instance_id"])

    assert mock_web.call_count == 1
    assert mock_expo.call_count == 1
    data = mock_expo.call_args.kwargs["data"]
    url = mock_web.call_args.kwargs["url"]

    with app.app_context():
        msg = (
            Message.query.filter_by(conversation_id=data["conversationId"])
            .order_by(Message.id.desc())
            .first()
        )

    assert data.get("messageId") == msg.id, (
        f"native push data is {data!r}, missing the message id (PAD-408)"
    )
    assert url == f"/messages/{data['conversationId']}?message={msg.id}", (
        f"web push url is {url!r} (PAD-408)"
    )


def test_class_request_coach_push_carries_the_message_id(app):
    """class_request_service._tell_coach: the coach's push for a new class
    request names the Message row it created."""
    from padel_app.models import Message
    from padel_app.tests.test_pad104_class_requests import _request as _class_request
    from padel_app.tests.test_pad104_class_requests import _setup as _seed_requests

    ids = _seed_requests(app)
    with patch("padel_app.realtime.publish"), \
         patch("padel_app.utils.push_notifications.send_push_notification") as mock_web, \
         patch("padel_app.utils.expo_push.send_expo_push_to_user") as mock_expo:
        mock_expo.return_value = True
        _class_request(app, ids)

    assert mock_web.call_count == 1
    assert mock_expo.call_count == 1
    data = mock_expo.call_args.kwargs["data"]
    url = mock_web.call_args.kwargs["url"]

    with app.app_context():
        msg = (
            Message.query.filter_by(conversation_id=data["conversationId"])
            .order_by(Message.id.desc())
            .first()
        )

    assert data.get("messageId") == msg.id, (
        f"native push data is {data!r}, missing the message id (PAD-408)"
    )
    assert url == f"/messages/{data['conversationId']}?message={msg.id}", (
        f"web push url is {url!r} (PAD-408)"
    )
