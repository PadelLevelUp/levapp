"""Who may see, and who may touch, a conversation.

One home for the two questions PAD-206 made explicit, so no caller has to
re-derive them:

* **Who are the recipients of an event about this conversation?**
  `conversation_participant_ids()` — the answer `realtime.publish()` needs for
  every message-shaped event (B-004).
* **May this user act in this conversation?** `require_participant()` — the
  guard `create_message_service` and friends were missing (B-026).

Its own module rather than a corner of `messaging_service`: the notification
engine and the replacement-approval service both need the recipient list, and
neither should have to import the messaging service (nor risk the import cycle
that would eventually create).
"""

from flask import abort

from padel_app.sql_db import db
from padel_app.models import ConversationParticipant


def conversation_participant_ids(conversation_id) -> list[int]:
    """The user ids participating in ``conversation_id``.

    Returns `[]` for an unknown conversation — an event addressed to nobody is
    delivered to nobody, which is the safe direction to fail in.
    """
    if conversation_id is None:
        return []

    rows = (
        db.session.query(ConversationParticipant.user_id)
        .filter(ConversationParticipant.conversation_id == conversation_id)
        .all()
    )
    return [row[0] for row in rows]


def message_recipient_ids(message) -> list[int]:
    """Recipients of an event about ``message`` — its conversation's participants."""
    if message is None:
        return []
    return conversation_participant_ids(getattr(message, "conversation_id", None))


def is_participant(conversation_id, user_id) -> bool:
    if conversation_id is None or user_id is None:
        return False
    return (
        db.session.query(ConversationParticipant.id)
        .filter(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == user_id,
        )
        .first()
        is not None
    )


def require_participant(conversation_id, user_id) -> None:
    """Abort 403 unless ``user_id`` participates in ``conversation_id``.

    messaging.messages rule 10. Deliberately a single 403 for both "you are not
    in this conversation" and "there is no such conversation": telling the two
    apart would let an outsider enumerate which conversation ids exist.
    """
    if not is_participant(conversation_id, user_id):
        abort(403, "Not a participant of this conversation")
