from padel_app.serializers.message import deleted_class_message_ids, serialize_message
from padel_app.utils.dates import to_utc_iso

# Distinguishes "the caller has already resolved this for the whole page" from
# "the value is genuinely None" — a conversation with no messages has no last
# message, and that is not the same as nobody having looked.
_UNRESOLVED = object()


def coach_display_names(viewer_user_id, other_user_ids):
    """PAD-660 (players.nickname rule 3): ``{user_id: nickname}`` for the students on the VIEWER's
    roster whose nickname this viewer chose to show as the name. Empty for a student viewer — a
    student is never served a nickname — and for anyone not on the viewer's own roster. One query.
    """
    ids = {i for i in other_user_ids if i is not None}
    if not ids:
        return {}
    from padel_app.models import Association_CoachPlayer, Coach, Player
    from padel_app.sql_db import db

    rows = db.session.execute(
        db.select(Player.user_id, Association_CoachPlayer.nickname)
        .join(Association_CoachPlayer, Association_CoachPlayer.player_id == Player.id)
        .join(Coach, Coach.id == Association_CoachPlayer.coach_id)
        .where(
            Coach.user_id == viewer_user_id,
            Player.user_id.in_(ids),
            Association_CoachPlayer.nickname_as_name.is_(True),
            Association_CoachPlayer.nickname.isnot(None),
        )
    ).all()
    return {user_id: nickname for user_id, nickname in rows if nickname}


def _other_user_id(conversation, user_id):
    return next((p.user_id for p in conversation.participants if p.user_id != user_id), None)


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
    display_names = coach_display_names(
        user_id, [_other_user_id(c, user_id) for c in conversations]
    )

    return [
        serialize_conversation(
            conversation,
            user_id,
            unread_count=unread_counts.get(conversation.id, 0),
            last_message=last_messages.get(conversation.last_message_id),
            display_names=display_names,
        )
        for conversation in conversations
    ]


def serialize_conversation(
    conversation, user_id, unread_count=_UNRESOLVED, last_message=_UNRESOLVED,
    display_names=_UNRESOLVED,
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
    if display_names is _UNRESOLVED:
        display_names = coach_display_names(user_id, [participant.id if participant else None])

    return {
        "id": conversation.id,
        "participantId": participant.id if participant else None,
        # PAD-660: the viewer coach's own nickname for a student, when they show it as the name.
        "participantName": (
            display_names.get(participant.id, participant.name) if participant else None
        ),
        # PAD-593: the participant's photo. It read `avatar_url`, which no model defines, so it
        # was always null; the image rides the list's participant join (no lazy load per row).
        "participantAvatar": participant.user_image_url if participant else None,
        "participantRole": participant.role if participant else None,
        # The client renders its own localized "Deleted user" label off this
        # flag. The server sends no display string: there is no server-side i18n
        # for serializer output, so a hardcoded label here would ship English to
        # a Portuguese-default app (cf. B-016).
        "participantDeleted": participant is None,
        "isAssistant": (
            participant.username == "levelup-assistant" if participant else False
        ),

        # messaging.conversations rule 12a (PAD-639, B-547): a deleted last message shows no
        # text. "" rather than None keeps older App Store builds from reading "No messages yet".
        "lastMessage": (
            ("" if last_message.is_deleted else last_message.text) if last_message else None
        ),
        "lastMessageDeleted": bool(last_message and last_message.is_deleted),
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
    from padel_app.services.messaging_service import (
        first_unread_message_id,
        is_known_contact,
    )

    last_read_at = conversation.last_read_by(user_id)
    viewer = User.query.get(user_id)

    if messages is None:
        messages = sorted(conversation.messages, key=lambda m: m.sent_at)
    # messaging.conversation-detail rule 15: one lookup for the whole page.
    deleted = deleted_class_message_ids(messages)

    return {
        **serialize_conversation(conversation, user_id),
        # messaging.block-and-report rule 7: drives the unknown-sender banner.
        "isKnownContact": (
            is_known_contact(viewer, conversation) if viewer else True
        ),
        "messages": [
            serialize_message(m, last_read_at, class_deleted=m.id in deleted)
            for m in messages
        ],
        "hasMore": has_more,
        "oldestMessageId": messages[0].id if messages else None,
        # messaging.conversation-detail rule 9a: where the clients open.
        "firstUnreadMessageId": first_unread_message_id(conversation.id, user_id),
    }
