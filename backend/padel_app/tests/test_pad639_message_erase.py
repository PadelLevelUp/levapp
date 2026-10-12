"""PAD-639 — deleting a message erases its content (messaging.messages rule 3).

The row stays (R-016) so the "Message deleted" placeholder, the thread order and the reply chain
survive, but its text, metadata, attachment and reactions go. A report keeps its own copy of the
reported text (messaging.block-and-report rule 4a), and the conversation list never shows a
deleted last message's text (messaging.conversations rule 12a, B-547).

The bucket is never touched: `padel_app.model._storage_client` is patched and only the calls
made on it are asserted (as in test_pad605).
"""
from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import text as sql_text

from padel_app import model
from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

KEY = "images/message/20260101000000_tok_photo.jpg"
SECRET = "call me on 912 345 678"


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


@pytest.fixture(autouse=True)
def _no_external_io(monkeypatch):
    """R-008 — Redis publish and both push transports are external I/O."""
    from padel_app.services import messaging_service

    monkeypatch.setattr(messaging_service, "publish", lambda *a, **k: None)
    monkeypatch.setattr(messaging_service, "send_push_notification", lambda *a, **k: None)
    monkeypatch.setattr(messaging_service, "send_expo_push_to_user", lambda *a, **k: None)


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _world(app, *, photo_is_also_avatar=False, text=SECRET):
    """Ana (sender) and Bea in one conversation; message 1 from Ana carries metadata, an
    image attachment and Bea's 👍. Optionally the same image is also Bea's profile photo."""
    from padel_app.model import Image
    from padel_app.models import Message, User
    from padel_app.models.conversation_participants import ConversationParticipant
    from padel_app.models.conversations import Conversation
    from padel_app.models.message_reaction import MessageReaction

    with app.app_context():
        photo = Image(object_key=KEY, content_type="image/jpeg")
        db.session.add(photo)
        db.session.flush()
        ana = User(name="Ana", username="ana639", password="x", status="active")
        bea = User(name="Bea", username="bea639", password="x", status="active",
                   user_image_id=photo.id if photo_is_also_avatar else None)
        db.session.add_all([ana, bea])
        db.session.flush()
        conv = Conversation(is_group=False,
                            participant_key=Conversation.build_participant_key([ana.id, bea.id]))
        db.session.add(conv)
        db.session.flush()
        db.session.add_all([ConversationParticipant(conversation_id=conv.id, user_id=ana.id),
                            ConversationParticipant(conversation_id=conv.id, user_id=bea.id)])
        msg = Message(text=text, sent_at=utcnow_naive() - timedelta(minutes=5), sender_id=ana.id,
                      conversation_id=conv.id, attachment_id=photo.id, msg_metadata={"x": 1},
                      edited=True)
        db.session.add(msg)
        db.session.flush()
        db.session.add(MessageReaction(message_id=msg.id, user_id=bea.id, emoji="👍"))
        db.session.commit()
        return {"ana": ana.id, "bea": bea.id, "conv": conv.id, "msg": msg.id, "image": photo.id}


def _bucket():
    storage = MagicMock()
    return storage, storage.bucket.return_value.blob


def _delete(app, client, ids):
    res = client.delete(f"/api/app/message/{ids['msg']}", headers=_auth(app, ids["ana"]))
    assert res.status_code == 200, res.get_json()


def test_deleting_erases_text_metadata_attachment_and_reactions(app, client):
    from padel_app.model import Image
    from padel_app.models import Message
    from padel_app.models.message_reaction import MessageReaction

    ids = _world(app)
    storage, blob = _bucket()
    with patch.object(model, "GCS_BUCKET", "uploads"), \
         patch.object(model, "_storage_client", return_value=storage):
        _delete(app, client, ids)

    with app.app_context():
        msg = db.session.get(Message, ids["msg"])
        assert msg is not None and msg.is_deleted is True  # R-016: the row stays
        assert msg.text == ""
        assert msg.msg_metadata is None
        assert msg.attachment_id is None
        assert msg.edited is False
        assert MessageReaction.query.filter_by(message_id=ids["msg"]).count() == 0
        assert db.session.get(Image, ids["image"]) is None
        row = db.session.execute(sql_text("SELECT * FROM messages WHERE id = :i"), {"i": ids["msg"]}).one()
        assert not any("912 345 678" in str(v) for v in row)
    blob.assert_called_with(KEY)
    blob.return_value.delete.assert_called_once()


def test_an_attachment_something_else_uses_survives_the_erase(app, client):
    from padel_app.model import Image
    from padel_app.models import Message

    ids = _world(app, photo_is_also_avatar=True)
    storage, blob = _bucket()
    with patch.object(model, "GCS_BUCKET", "uploads"), \
         patch.object(model, "_storage_client", return_value=storage):
        _delete(app, client, ids)

    with app.app_context():
        assert db.session.get(Message, ids["msg"]).attachment_id is None
        assert db.session.get(Image, ids["image"]) is not None
    blob.return_value.delete.assert_not_called()


def test_erase_message_is_the_one_shared_erase(app):
    """PAD-631's moderation delete reuses it: callable on a message by itself."""
    from padel_app.models import Message
    from padel_app.services.messaging_service import erase_message

    ids = _world(app)
    with app.app_context():
        msg = db.session.get(Message, ids["msg"])
        erase_message(msg)
        db.session.commit()
        msg = db.session.get(Message, ids["msg"])
        assert (msg.is_deleted, msg.text, msg.msg_metadata, msg.attachment_id) == (True, "", None, None)


def test_a_report_outlives_the_messages_edit_and_deletion(app, client):
    from padel_app.models import Message
    from padel_app.models.message_report import MessageReport

    ids = _world(app, text="you are useless")
    res = client.post(f"/api/app/messages/{ids['msg']}/report", json={"reason": "abuse"},
                      headers=_auth(app, ids["bea"]))
    assert res.status_code in (200, 201), res.get_json()
    res = client.put(f"/api/app/message/{ids['msg']}", json={"text": "sorry"}, headers=_auth(app, ids["ana"]))
    assert res.status_code == 200, res.get_json()
    _delete(app, client, ids)

    with app.app_context():
        assert db.session.get(Message, ids["msg"]).text == ""
        report = MessageReport.query.filter_by(message_id=ids["msg"]).one()
        assert report.message_text == "you are useless"


def _list_row(app, client, ids):
    res = client.get("/api/app/conversations", headers=_auth(app, ids["bea"]))
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    rows = body if isinstance(body, list) else body.get("conversations", body.get("items"))
    return next(r for r in rows if r["id"] == ids["conv"])


def test_a_live_last_message_shows_its_text_in_the_list(app, client):
    ids = _world(app)
    row = _list_row(app, client, ids)
    assert row["lastMessage"] == SECRET
    assert row["lastMessageDeleted"] is False


def test_a_deleted_last_message_shows_no_text_in_the_list(app, client):
    ids = _world(app)
    _delete(app, client, ids)
    row = _list_row(app, client, ids)
    assert row["lastMessage"] == ""
    assert row["lastMessageDeleted"] is True
    assert "912 345 678" not in str(row)
