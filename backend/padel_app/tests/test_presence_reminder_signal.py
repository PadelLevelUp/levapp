"""attendance.presence rule 1a (PAD-199, B-017): the badge follows a message that exists.

``Presence.invited`` is roster membership; ``reminderSentAt`` is the messaging
layer's own record. Two enrolled players, one reminded: only that one carries a
timestamp, on every endpoint that serialises presences.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import (
    PATCHES,
    _seed_coach_and_student,
    _seed_instance,
)


def _add_second_student(app, instance_id):
    from padel_app.models import Association_PlayerLessonInstance, Presence, User
    from padel_app.models.players import Player

    with app.app_context():
        user = User(name="Quiet Student", username="quiet-student", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        player = Player(user_id=user.id)
        db.session.add(player)
        db.session.flush()
        db.session.add(
            Association_PlayerLessonInstance(player_id=player.id, lesson_instance_id=instance_id)
        )
        # Materialisation's row: invited=True before any message exists.
        db.session.add(
            Presence(lesson_instance_id=instance_id, player_id=player.id, invited=True, confirmed=False)
        )
        db.session.commit()
        return player.id


def _bearer(app, user_id):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def test_only_the_reminded_player_carries_reminder_sent_at(app, client):
    from padel_app.services.notification_service import send_class_reminders
    from padel_app.models import Presence

    ids = _seed_coach_and_student(app)
    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=48)
    quiet_id = _add_second_student(app, instance_id)

    with app.app_context():
        # Both hold an invited=True row before any message exists.
        db.session.add(
            Presence(lesson_instance_id=instance_id, player_id=ids["student_id"], invited=True, confirmed=False)
        )
        db.session.commit()

    headers = _bearer(app, ids["coach_user_id"])
    before = client.get(f"/api/app/lesson_instance/{instance_id}/presences", headers=headers).get_json()
    assert {p["invited"] for p in before} == {True}
    assert {p["reminderSentAt"] for p in before} == {None}, "no message was ever sent"

    # A reminder reaches the first student only (the quiet one is capped out by
    # a coach config of zero? No — simply send to everyone and cap the quiet one
    # by pretending they already answered; then only the first got a message).
    with app.app_context():
        quiet = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=quiet_id).one()
        quiet.confirmed = True  # "already answered" → no reminder for them
        db.session.commit()
        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_class_reminders(instance_id, now=datetime.utcnow())
        quiet.confirmed = False
        db.session.commit()

    after = {p["playerId"]: p for p in client.get(
        f"/api/app/lesson_instance/{instance_id}/presences", headers=headers
    ).get_json()}
    assert after[ids["student_id"]]["reminderSentAt"] is not None
    assert after[quiet_id]["reminderSentAt"] is None
    assert after[quiet_id]["invited"] is True, "invited stays roster membership, unchanged"

    # The class-detail payload agrees (calendar.event-detail rule 3a).
    detail = client.post(
        f"/api/app/class_instance?model=lessoninstance&id={instance_id}", headers=headers
    ).get_json()
    by_player = {p["playerId"]: p for p in detail["presences"]}
    assert by_player[ids["student_id"]]["reminderSentAt"] == after[ids["student_id"]]["reminderSentAt"]
    assert by_player[quiet_id]["reminderSentAt"] is None


def test_an_invitation_counts_as_a_message_that_reached_the_player(app, client):
    from padel_app.models import (
        Conversation,
        ConversationParticipant,
        Message,
        NotificationEvent,
        Presence,
    )

    ids = _seed_coach_and_student(app)
    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=48)

    with app.app_context():
        conv = Conversation(
            is_group=False,
            participant_key=Conversation.build_participant_key([ids["coach_user_id"], ids["student_user_id"]]),
        )
        db.session.add(conv)
        db.session.flush()
        db.session.add_all([
            ConversationParticipant(conversation_id=conv.id, user_id=ids["coach_user_id"]),
            ConversationParticipant(conversation_id=conv.id, user_id=ids["student_user_id"]),
        ])
        sent = datetime.utcnow() - timedelta(hours=2)
        msg = Message(
            conversation_id=conv.id, sender_id=ids["coach_user_id"], text="A spot opened",
            message_type="notification_invite", sent_at=sent,
            msg_metadata={"lessonInstanceId": instance_id, "responded": False},
        )
        db.session.add(msg)
        db.session.flush()
        db.session.add(NotificationEvent(
            coach_id=ids["coach_id"], lesson_instance_id=instance_id, player_id=ids["student_id"],
            type="manual", round_number=1, status="sent", message_id=msg.id,
        ))
        db.session.add(Presence(lesson_instance_id=instance_id, player_id=ids["student_id"], invited=True, confirmed=False))
        db.session.commit()

    rows = client.get(
        f"/api/app/lesson_instance/{instance_id}/presences", headers=_bearer(app, ids["coach_user_id"])
    ).get_json()
    assert rows[0]["reminderSentAt"] == sent.isoformat()
