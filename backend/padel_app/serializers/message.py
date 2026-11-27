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


def _metadata_for(message, viewer_id):
    """The message's metadata as ``viewer_id`` may see it: a new-engine invitation's ``countsUntil`` is
    the coach's only (invitations NB1, INVITATIONS-124), so it is dropped for anyone but the sender,
    and when no viewer is named."""
    meta = getattr(message, "msg_metadata", None)
    if (isinstance(meta, dict) and meta.get("engine") == "new" and "countsUntil" in meta
            and (viewer_id is None or viewer_id != message.sender_id)):
        meta = {k: v for k, v in meta.items() if k != "countsUntil"}
    if _started_open_engine_invite(meta):
        # invitations NB6: App Store builds 33-35 cannot derive "the class has started" (NB1); they read it
        # as answered. The stored row is unchanged, and the current shells still derive it from startsAt.
        meta = {**meta, "responded": True, "response": "expired"}
    return meta


def _started_open_engine_invite(meta) -> bool:
    from datetime import datetime

    from padel_app.utils.dates import utcnow_naive

    if not (isinstance(meta, dict) and meta.get("engine") == "new" and meta.get("state") == "open"
            and not meta.get("responded") and meta.get("startsAt")):
        return False
    try:
        return utcnow_naive() >= datetime.fromisoformat(str(meta["startsAt"])).replace(tzinfo=None)
    except ValueError:
        return False


def reminder_come_back(message, viewer_id, cache: dict | None = None):
    """attendance.confirm rule 32: the ``comeBack`` a ``notification_reminder`` message carries for its
    student (``viewer_id``), the value the class payload serves for its occurrence; ``None`` for any other
    viewer or message type, and when the student has not recorded a no. ``cache`` (per occurrence) lets a
    thread read each occurrence once."""
    if viewer_id is None or getattr(message, "message_type", None) != "notification_reminder":
        return None
    if viewer_id == message.sender_id:
        return None
    instance_id = referenced_instance_id(message)
    if instance_id is None:
        return None
    if cache is not None and instance_id in cache:
        return cache[instance_id]
    from padel_app.models import LessonInstance, Player, Presence
    from padel_app.services.notification_service import student_come_back
    from padel_app.sql_db import db

    value = None
    instance = db.session.get(LessonInstance, instance_id)
    player = Player.query.filter_by(user_id=viewer_id).first() if instance is not None else None
    if player is not None:
        presence = Presence.query.filter_by(lesson_instance_id=instance_id, player_id=player.id).first()
        value = student_come_back(presence, instance, player_id=player.id)
    if cache is not None:
        cache[instance_id] = value
    return value


def reminder_come_backs(messages, viewer_id) -> dict:
    """``reminder_come_back`` for a page, as ``deleted_class_message_ids`` does: one player and one presence
    read for the whole page; only an occurrence the student recorded a no for (absent) reads further. The
    result is the ``come_backs`` cache ``serialize_message`` takes."""
    from padel_app.models import LessonInstance, Player, Presence
    from padel_app.services.notification_service import student_come_back
    from padel_app.sql_db import db

    refs = {referenced_instance_id(m) for m in messages
            if viewer_id is not None and not m.is_deleted and m.sender_id != viewer_id
            and getattr(m, "message_type", None) == "notification_reminder"} - {None}
    if not refs:
        return {}
    out = dict.fromkeys(refs)
    player = Player.query.filter_by(user_id=viewer_id).first()
    if player is None:
        return out
    for presence in Presence.query.filter(Presence.player_id == player.id, Presence.lesson_instance_id.in_(refs),
                                          Presence.status == "absent").all():
        instance = db.session.get(LessonInstance, presence.lesson_instance_id)
        out[presence.lesson_instance_id] = student_come_back(presence, instance, player_id=player.id)
    return out


def serialize_message(message, last_read_at, *, class_deleted=False, viewer_id=None, come_backs=None):
    """One message, as ``viewer_id`` reads it (None: whatever every participant may see).

    ``comeBack`` (attendance.confirm rule 32) is served only when a viewer is named: a reminder's
    student reads it; a payload for no one in particular (a live event) leaves the key out, so a client
    keeps what it last read. ``come_backs``: a per-occurrence cache a list shares.

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
    come_back = {} if viewer_id is None else {"comeBack": reminder_come_back(message, viewer_id, come_backs)}

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
        "metadata": _metadata_for(message, viewer_id),
        # messaging.conversation-detail rule 15 (PAD-325): the class this
        # message points at was deleted, so clients must not offer it.
        "classDeleted": bool(class_deleted),
        # messaging.messages rule 6 / conversation-detail rule 16 (PAD-492).
        "isAutomatic": is_automatic(message),
        **come_back,
    }
