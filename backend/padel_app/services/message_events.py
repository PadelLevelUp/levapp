"""A message's live event, as each participant may read it (PAD-918, invitations NB1).

Most messages read the same to everyone and go out once. A new-engine invitation carries
``countsUntil`` for the coach only (INVITATIONS-124), so its event goes out once per participant,
each serialised for that reader (``serializers.message.serialize_message``'s ``viewer_id``).
"""
from __future__ import annotations


def per_reader(msg) -> bool:
    """Whether the message's event must be serialised per participant."""
    meta = getattr(msg, "msg_metadata", None)
    return isinstance(meta, dict) and meta.get("engine") == "new" and "countsUntil" in meta


def publish_message_event(event_type: str, msg) -> None:
    """``message_created`` or ``message_edited`` for ``msg`` to its conversation's participants."""
    from padel_app import realtime
    from padel_app.serializers.message import serialize_message
    from padel_app.services.conversation_access import message_recipient_ids

    recipients = message_recipient_ids(msg)
    if not per_reader(msg):
        realtime.publish({"type": event_type, "payload": serialize_message(msg, None)}, recipients)
        return
    for user_id in recipients:
        realtime.publish({"type": event_type, "payload": serialize_message(msg, None, viewer_id=user_id)}, [user_id])
