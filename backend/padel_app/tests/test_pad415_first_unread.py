"""
PAD-415 — messaging.conversation-detail rule 9a: the thread GET names the caller's first unread
message (`firstUnreadMessageId`), computed from the read mark as it stood before this open. The
clients open there instead of at the newest message.

Unread uses the same predicate as the counts (conversations rule 12): from someone else, not
soft-deleted, `sent_at > coalesce(last_read_at, epoch)`.
"""
from datetime import datetime, timedelta

from padel_app.sql_db import db
from padel_app.tests.test_pad208_conversation_paging import (
    _auth_header,
    _conversation_between,
    _jwt_secret,  # noqa: F401 — autouse fixture
    _two_users,
)

BASE = datetime(2026, 9, 1, 10, 0)


def _seed(app, prefix, *, read_up_to=None, deleted=()):
    """Ana writes msg-1..msg-10; Bruno writes msg-11..msg-20. Ana's read mark sits just after
    `read_up_to` (a message number) or is NULL."""
    from padel_app.models.conversation_participants import ConversationParticipant
    from padel_app.models.messages import Message

    with app.app_context():
        ana, bruno = _two_users(prefix)
        conversation = _conversation_between([ana.id, bruno.id])
        ids = {}
        for i in range(1, 21):
            m = Message(text=f"msg-{i}", sender_id=ana.id if i <= 10 else bruno.id,
                        conversation_id=conversation.id, sent_at=BASE + timedelta(minutes=i),
                        is_deleted=i in deleted)
            db.session.add(m)
            db.session.flush()
            ids[i] = m.id
        if read_up_to is not None:
            part = ConversationParticipant.query.filter_by(conversation_id=conversation.id, user_id=ana.id).one()
            part.last_read_at = BASE + timedelta(minutes=read_up_to, seconds=30)
        db.session.commit()
        return conversation.id, ana.id, bruno.id, ids


def _get(client, app, conversation_id, user_id, **params):
    q = "&".join(f"{k}={v}" for k, v in params.items())
    return client.get(f"/api/app/conversation/{conversation_id}?{q}", headers=_auth_header(app, user_id)).get_json()


def test_names_the_first_unread_from_someone_else(app, client):
    cid, ana, _bruno, ids = _seed(app, "fu1", read_up_to=14)
    assert _get(client, app, cid, ana, limit=30)["firstUnreadMessageId"] == ids[15]


def test_skips_a_soft_deleted_message(app, client):
    cid, ana, _bruno, ids = _seed(app, "fu2", read_up_to=14, deleted=(15,))
    assert _get(client, app, cid, ana, limit=30)["firstUnreadMessageId"] == ids[16]


def test_never_read_means_the_first_message_from_the_other_side(app, client):
    cid, ana, _bruno, ids = _seed(app, "fu3", read_up_to=None)
    # Ana's own msg-1..10 are never unread to her; Bruno's msg-11 is the first.
    assert _get(client, app, cid, ana, limit=30)["firstUnreadMessageId"] == ids[11]


def test_nothing_unread_is_null(app, client):
    cid, ana, _bruno, _ids = _seed(app, "fu4", read_up_to=20)
    assert _get(client, app, cid, ana, limit=30)["firstUnreadMessageId"] is None


def test_the_sender_has_none(app, client):
    cid, _ana, bruno, _ids = _seed(app, "fu5", read_up_to=14)
    # Bruno wrote 11..20 and never read Ana's 1..10: his first unread is Ana's msg-1.
    body = _get(client, app, cid, bruno, limit=30)
    assert body["firstUnreadMessageId"] is not None
    cid2, _a2, bruno2, _ = _seed(app, "fu6", read_up_to=14)
    from padel_app.models.conversation_participants import ConversationParticipant
    with app.app_context():
        p = ConversationParticipant.query.filter_by(conversation_id=cid2, user_id=bruno2).one()
        p.last_read_at = BASE + timedelta(minutes=10, seconds=30)
        db.session.commit()
    assert _get(client, app, cid2, bruno2, limit=30)["firstUnreadMessageId"] is None


def test_the_unpaged_legacy_branch_carries_it_too(app, client):
    cid, ana, _bruno, ids = _seed(app, "fu7", read_up_to=17)
    assert _get(client, app, cid, ana)["firstUnreadMessageId"] == ids[18]
