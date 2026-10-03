from padel_app.utils.dates import to_utc_iso


def referenced_instance_id(message):
    """The class occurrence a message points at, or None.

    `lessonInstanceId` in `msg_metadata`, with the older `instanceId` alias the
    notification engine also reads. Not a foreign key: the row can be gone.
    """
    meta = getattr(message, "msg_metadata", None)
    if not isinstance(meta, dict):
        return None
    raw = meta.get("lessonInstanceId") or meta.get("instanceId")
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def deleted_class_message_ids(messages):
    """Ids of the messages whose referenced class no longer exists.

    messaging.conversation-detail rule 15 (PAD-325). One `lesson_instances`
    lookup for the whole list, whatever its length: derived on read, never
    stored, the same shape as `reminder_sent_at_by_presence`.
    """
    from padel_app.models import LessonInstance
    from padel_app.sql_db import db

    refs = {}
    for message in messages:
        if message.is_deleted:
            continue
        instance_id = referenced_instance_id(message)
        if instance_id is not None:
            refs[message.id] = instance_id
    if not refs:
        return set()
    existing = {
        row_id
        for (row_id,) in db.session.query(LessonInstance.id)
        .filter(LessonInstance.id.in_(set(refs.values())))
        .all()
    }
    return {mid for mid, iid in refs.items() if iid not in existing}


def is_automatic(message) -> bool:
    """messaging.messages rule 6 (PAD-492): the app wrote this message, a person did not.

    Every automatic writer stores a `message_type` other than "text" or a non-null
    `msg_metadata` (`_send_system_message` always writes `msg_metadata or {}`); the human
    send path stores neither. The guard in test_pad492_automatic_marker keeps it that way.
    """
    message_type = getattr(message, "message_type", None) or "text"
    return message_type != "text" or getattr(message, "msg_metadata", None) is not None


def serialize_message(message, last_read_at, *, class_deleted=False):
    """One message.

    `class_deleted` comes from `deleted_class_message_ids` when a list is
    serialised. A single message on the realtime path (just created or edited,
    about a class that exists) passes nothing and reads as live; that is an
    explicit opt-out, not a skipped check.
    """
    if message.is_deleted:
        return {
            "id": message.id,
            "senderId": message.sender_id,
            "content": None,
            "timestamp": to_utc_iso(message.sent_at),
            "conversationId": message.conversation_id,
            "isRead": True,
            "status": "read",
            "replyTo": None,
            "edited": False,
            "isDeleted": True,
            "reactions": [],
            "classDeleted": False,
            "isAutomatic": False,
        }

    is_read = bool(last_read_at and message.sent_at <= last_read_at)

    return {
        "id": message.id,
        "senderId": message.sender_id,
        "content": message.text,
        "timestamp": to_utc_iso(message.sent_at),
        "conversationId": message.conversation_id,
        "isRead": is_read,
        "status": "read" if is_read else "delivered",
        "replyTo": message.reply_to_id,
        "edited": message.edited,
        "isDeleted": False,
        "reactions": [
            {"emoji": r.emoji, "userId": r.user_id}
            for r in (message.reactions or [])
        ],
        "messageType": getattr(message, "message_type", "text") or "text",
        "metadata": getattr(message, "msg_metadata", None),
        # messaging.conversation-detail rule 15 (PAD-325): the class this
        # message points at was deleted, so clients must not offer it.
        "classDeleted": bool(class_deleted),
        # messaging.messages rule 6 / conversation-detail rule 16 (PAD-492).
        "isAutomatic": is_automatic(message),
    }
