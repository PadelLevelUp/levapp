from padel_app.serializers.message import serialize_message
from padel_app.utils.dates import to_utc_iso

def serialize_conversation(conversation, user_id):
    messages = sorted(conversation.messages, key=lambda m: m.sent_at)
    last_message = messages[-1] if messages else None

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

    # No own row means no read state, so nothing has been read: every message
    # from someone else counts as unread, which is what `last_read_at = None`
    # already means to the comparison below.
    last_read_at = (
        conversation_participation_own.last_read_at
        if conversation_participation_own
        else None
    )

    unread_count = sum(
        1 for m in messages
        if m.sender_id != user_id
        and (not last_read_at or m.sent_at > last_read_at)
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

def serialize_conversation_detail(conversation, user_id):
    last_read_at = conversation.last_read_by(user_id)

    return {
        **serialize_conversation(conversation, user_id),
        "messages": [
            serialize_message(m, last_read_at)
            for m in sorted(conversation.messages, key=lambda m: m.sent_at)
        ],
    }
