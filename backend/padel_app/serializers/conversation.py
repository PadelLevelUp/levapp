from padel_app.serializers.message import serialize_message
from padel_app.utils.dates import to_utc_iso

# Distinguishes "the caller has already resolved this for the whole page" from
# "the value is genuinely None" — a conversation with no messages has no last
# message, and that is not the same as nobody having looked.
_UNRESOLVED = object()


def serialize_conversations(conversations, user_id):
    """Serialize a page of conversations with a constant number of queries.

    PAD-204 / messaging.conversations rule 12. Called with a page rather than a
    conversation because the two things every row needs — its last message and
    its unread count — are batch lookups: one `messages.id IN (...)` and one
    grouped count over the whole page. Serializing row by row is what made the
    list O(conversations) in statements and O(messages) in rows.
    """
    from padel_app.services.messaging_service import (
        last_messages_by_id,
        unread_counts_for_conversations,
    )

    unread_counts = unread_counts_for_conversations(
        user_id, [c.id for c in conversations]
    )
    last_messages = last_messages_by_id(
        [c.last_message_id for c in conversations]
    )

    return [
        serialize_conversation(
            conversation,
            user_id,
            unread_count=unread_counts.get(conversation.id, 0),
            last_message=last_messages.get(conversation.last_message_id),
        )
        for conversation in conversations
    ]


def serialize_conversation(
    conversation, user_id, unread_count=_UNRESOLVED, last_message=_UNRESOLVED
):
    """One conversation's summary payload.

    PAD-204: `last_message` and `unread_count` are passed in by
    `serialize_conversations` when a whole page is being rendered, and looked up
    here — one bounded query each — when a single conversation is serialized on
    its own (the detail and create endpoints). Either way this function never
    touches `conversation.messages`: reading the thread to find its last row and
    to count unread is the defect the ticket exists to remove.
    """
    if last_message is _UNRESOLVED:
        from padel_app.services.messaging_service import last_messages_by_id

        last_message = last_messages_by_id(
            [conversation.last_message_id]
        ).get(conversation.last_message_id)

    if unread_count is _UNRESOLVED:
        from padel_app.services.messaging_service import (
            unread_counts_for_conversations,
        )

        unread_count = unread_counts_for_conversations(
            user_id, [conversation.id]
        ).get(conversation.id, 0)

    # PAD-203: both lookups carry a default. They used to be bare `next(...)`,
    # so a conversation with a single participant row — a hard-deleted
    # counterpart, or a creation that failed between the old per-row commits —
    # raised `StopIteration` out of the list comprehension in
    # `GET /api/app/conversations` and returned a 500 for the caller's ENTIRE
    # list, on every request, permanently. One malformed row must degrade to a
    # null participant, not take messaging away from the user
    # (messaging.conversations rule 10).
    conversation_participation = next(
        (p for p in conversation.participants if p.user_id != user_id),
        None,
    )

    conversation_participation_own = next(
        (p for p in conversation.participants if p.user_id == user_id),
        None,
    )

    participant = (
        conversation_participation.user if conversation_participation else None
    )

    return {
        "id": conversation.id,
        "participantId": participant.id if participant else None,
        "participantName": participant.name if participant else None,
        "participantAvatar": getattr(participant, "avatar_url", None),
        "participantRole": participant.role if participant else None,
        # The client renders its own localized "Deleted user" label off this
        # flag. The server sends no display string: there is no server-side i18n
        # for serializer output, so a hardcoded label here would ship English to
        # a Portuguese-default app (cf. B-016).
        "participantDeleted": participant is None,
        "isAssistant": (
            participant.username == "levelup-assistant" if participant else False
        ),

        "lastMessage": last_message.text if last_message else None,
        "lastMessageAt": (
            to_utc_iso(last_message.sent_at)
            if last_message
            else None
        ),

        "unreadCount": unread_count,
    }

def serialize_conversation_detail(
    conversation, user_id, messages=None, has_more=False
):
    """One conversation plus one page of its thread.

    PAD-208 / messaging.conversation-detail rule 1. `messages` is the page the
    caller already selected — newest-first in SQL, handed here ascending. When
    it is None the whole thread is rendered from `conversation.messages`, which
    is the deprecated unpaged branch kept for TestFlight build 8 in the field.

    `hasMore` and `oldestMessageId` are what the client walks backwards with:
    the next request passes `oldestMessageId` as `before`, and stops asking once
    `hasMore` is false. Read state is resolved per page from the same
    `last_read_at` (messaging.read-tracking), so a message's `isRead` does not
    depend on which page it arrived in.

    `isKnownContact` (PAD-215) is a property of the conversation, not of the
    page, so it is computed the same way whichever branch produced `messages`.
    """
    from padel_app.models import User
    from padel_app.services.messaging_service import is_known_contact

    last_read_at = conversation.last_read_by(user_id)
    viewer = User.query.get(user_id)

    if messages is None:
        messages = sorted(conversation.messages, key=lambda m: m.sent_at)

    return {
        **serialize_conversation(conversation, user_id),
        # messaging.block-and-report rule 7: drives the unknown-sender banner.
        "isKnownContact": (
            is_known_contact(viewer, conversation) if viewer else True
        ),
        "messages": [serialize_message(m, last_read_at) for m in messages],
        "hasMore": has_more,
        "oldestMessageId": messages[0].id if messages else None,
    }
