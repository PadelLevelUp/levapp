"""PAD-237 — POST /api/app/conversation answers with the paged shape GET uses
(messaging.conversations rule 6): the newest first-page of messages, ascending,
plus hasMore / oldestMessageId — never the whole history."""
from datetime import datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-secret"


def _roster(app):
    """Coach + student on the coach's roster, so the coach may start the thread."""
    from padel_app.models import User, Association_CoachPlayer
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    coach_user = User(name="Coach", username="coach-237", email="c237@test.com", password="x", status="active")
    student_user = User(name="Student", username="student-237", email="s237@test.com", password="x", status="active")
    db.session.add_all([coach_user, student_user])
    db.session.flush()
    coach = Coach(user_id=coach_user.id, approval_status="approved")
    player = Player(user_id=student_user.id)
    db.session.add_all([coach, player])
    db.session.flush()
    db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=player.id))
    db.session.commit()
    return coach_user, student_user


def _headers(user_id):
    return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def test_post_conversation_new_thread_has_the_paged_shape(client, app):
    with app.app_context():
        coach_user, student_user = _roster(app)
        res = client.post("/api/app/conversation",
                          json={"otherParticipants": [student_user.id]},
                          headers=_headers(coach_user.id))
    assert res.status_code == 201, res.get_json()
    body = res.get_json()
    assert body["messages"] == []
    assert body["hasMore"] is False
    assert body["oldestMessageId"] is None


def test_post_conversation_existing_thread_returns_first_page_not_whole_history(client, app):
    from padel_app.models import Conversation, ConversationParticipant, Message
    with app.app_context():
        coach_user, student_user = _roster(app)
        conv = Conversation(is_group=False,
                            participant_key=Conversation.build_participant_key([coach_user.id, student_user.id]))
        db.session.add(conv)
        db.session.flush()
        db.session.add_all([
            ConversationParticipant(conversation_id=conv.id, user_id=coach_user.id),
            ConversationParticipant(conversation_id=conv.id, user_id=student_user.id),
        ])
        base = datetime.utcnow() - timedelta(days=1)
        for i in range(45):
            db.session.add(Message(conversation_id=conv.id, sender_id=student_user.id,
                                   text=f"m{i}", sent_at=base + timedelta(minutes=i)))
        db.session.commit()
        conv_id = conv.id
        res = client.post("/api/app/conversation",
                          json={"otherParticipants": [student_user.id]},
                          headers=_headers(coach_user.id))
    assert res.status_code == 201, res.get_json()
    body = res.get_json()
    assert body["id"] == conv_id
    texts = [m["content"] for m in body["messages"]]
    assert len(texts) == 30, "first page is the clients' CONVERSATION_FIRST_PAGE_SIZE"
    assert texts == [f"m{i}" for i in range(15, 45)], "newest 30, ascending"
    assert body["hasMore"] is True
    assert body["oldestMessageId"] == body["messages"][0]["id"]
