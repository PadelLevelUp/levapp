"""PAD-325 / messaging.conversation-detail rule 15 — a message whose class is
gone says so.

Messages store a bare `lessonInstanceId` (older rows: `instanceId`) in
`msg_metadata`, with no foreign key, so deleting the class leaves the message
pointing at nothing (B-059). The conversation payload now derives, on read, a
`classDeleted` flag per message: one `lesson_instances` lookup for the whole
page, never one per message, and nothing stored.
"""
from datetime import datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import event

from padel_app.sql_db import db


BASE = datetime(2026, 9, 1, 9, 0, 0)


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth_header(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _seed(app):
    from padel_app.models import Club, Lesson, LessonInstance, User
    from padel_app.models.conversation_participants import ConversationParticipant
    from padel_app.models.conversations import Conversation
    from padel_app.models.messages import Message

    with app.app_context():
        ana = User(name="Ana", username="pad325_a", password="x")
        bruno = User(name="Bruno", username="pad325_b", password="x")
        club = Club(name="Club 325", description="", location="Lisboa")
        db.session.add_all([ana, bruno, club])
        db.session.flush()

        start = datetime(2026, 9, 20, 10, 0, 0)
        lesson = Lesson(
            title="Kept", start_datetime=start, end_datetime=start + timedelta(hours=1),
            is_recurring=False, type="academy", max_players=4, color="#000000",
            status="active", club_id=club.id,
        )
        db.session.add(lesson)
        db.session.flush()
        kept = LessonInstance(
            lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
            max_players=4, status="scheduled",
        )
        gone = LessonInstance(
            lesson_id=lesson.id, start_datetime=start + timedelta(days=7),
            end_datetime=start + timedelta(days=7, hours=1), max_players=4, status="scheduled",
        )
        db.session.add_all([kept, gone])
        db.session.flush()
        gone_id = gone.id

        conversation = Conversation(
            is_group=False, participant_key=Conversation.build_participant_key([ana.id, bruno.id])
        )
        db.session.add(conversation)
        db.session.flush()
        for uid in (ana.id, bruno.id):
            db.session.add(ConversationParticipant(conversation_id=conversation.id, user_id=uid))

        rows = [
            ("plain", None),
            ("live", {"lessonInstanceId": kept.id}),
            ("deleted", {"lessonInstanceId": gone_id}),
            ("deleted-alias", {"instanceId": gone_id}),
            ("live-alias", {"instanceId": kept.id}),
            ("junk", {"lessonInstanceId": "not-a-number"}),
        ]
        for i, (text, meta) in enumerate(rows):
            db.session.add(Message(
                text=text, sender_id=ana.id, conversation_id=conversation.id,
                sent_at=BASE + timedelta(minutes=i), message_type="text", msg_metadata=meta,
            ))
        db.session.flush()
        db.session.delete(gone)
        db.session.commit()
        return {"user_id": bruno.id, "conversation_id": conversation.id}


def _flags(body):
    return {m["content"]: m["classDeleted"] for m in body["messages"]}


EXPECTED = {
    "plain": False,
    "live": False,
    "deleted": True,
    "deleted-alias": True,
    "live-alias": False,
    "junk": False,
}


def test_the_paged_payload_flags_messages_whose_class_is_gone(app, client):
    ids = _seed(app)
    res = client.get(
        f"/api/app/conversation/{ids['conversation_id']}?limit=50",
        headers=_auth_header(app, ids["user_id"]),
    )
    assert res.status_code == 200, res.get_data(as_text=True)
    assert _flags(res.get_json()) == EXPECTED


def test_the_unpaged_payload_flags_them_too(app, client):
    ids = _seed(app)
    res = client.get(
        f"/api/app/conversation/{ids['conversation_id']}",
        headers=_auth_header(app, ids["user_id"]),
    )
    assert res.status_code == 200, res.get_data(as_text=True)
    assert _flags(res.get_json()) == EXPECTED


def test_one_lesson_instance_lookup_for_the_whole_page(app):
    from padel_app.models.conversations import Conversation
    from padel_app.serializers.conversation import serialize_conversation_detail
    from padel_app.services.messaging_service import conversation_messages_page

    ids = _seed(app)
    with app.app_context():
        conversation = Conversation.query.get(ids["conversation_id"])
        messages, has_more = conversation_messages_page(ids["conversation_id"], limit=50)
        statements = []

        def count(conn, cursor, statement, *args):
            if "lesson_instances" in statement.lower():
                statements.append(statement)

        event.listen(db.engine, "before_cursor_execute", count)
        try:
            serialize_conversation_detail(conversation, ids["user_id"], messages=messages, has_more=has_more)
        finally:
            event.remove(db.engine, "before_cursor_execute", count)
        assert len(statements) == 1, statements


def test_a_single_message_serialises_as_live_without_a_query(app):
    """The realtime path serialises a message just created or edited about a
    class that exists; it opts out of the lookup explicitly."""
    from padel_app.models.messages import Message
    from padel_app.serializers.message import serialize_message

    ids = _seed(app)
    with app.app_context():
        msg = Message.query.filter_by(text="deleted").one()
        assert serialize_message(msg, None)["classDeleted"] is False
