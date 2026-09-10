"""What the messaging layer actually sent, per presence (PAD-199, B-017).

``Presence.invited`` is set for every enrolled player the moment an instance is
materialised (``lesson_service.get_or_materialize_instance``), before any
notification exists, so it is roster membership — not a signal that a reminder
or invitation went out. Both shells nevertheless labelled the un-confirmed case
"Reminder sent" off that flag, which told a coach they had already chased
students they had never contacted.

This module derives the real signal from the records the notification engine
writes when it sends something:

* a ``notification_reminder`` message to the player's user whose metadata names
  the instance (``send_class_reminders``), or
* the message behind a ``NotificationEvent`` for the (player, instance) pair
  (an invitation, manual or automatic).

It is computed on read and never stored, so it cannot drift from the messages.
Metadata is filtered in Python, like the reminder code itself, so SQLite tests
and Postgres behave identically.
"""
from __future__ import annotations

from datetime import datetime
from typing import Dict, Iterable, Optional

from padel_app.models import (
    ConversationParticipant,
    Message,
    NotificationEvent,
    Player,
    Presence,
)
from padel_app.sql_db import db


def reminder_sent_at_by_presence(presences: Iterable[Presence]) -> Dict[int, Optional[datetime]]:
    """Map ``presence.id`` → when the last reminder/invitation reached the player, or ``None``."""
    rows = [p for p in presences if p is not None]
    if not rows:
        return {}

    player_ids = {p.player_id for p in rows}
    instance_ids = {p.lesson_instance_id for p in rows}

    user_by_player = {
        pid: uid
        for pid, uid in db.session.query(Player.id, Player.user_id)
        .filter(Player.id.in_(player_ids))
        .all()
    }
    user_ids = {uid for uid in user_by_player.values() if uid is not None}

    latest: Dict[tuple, datetime] = {}

    def note(player_id: int, instance_id: int, when: Optional[datetime]) -> None:
        if when is None:
            return
        key = (player_id, instance_id)
        if key not in latest or when > latest[key]:
            latest[key] = when

    if user_ids:
        # Reminders: inbound ``notification_reminder`` messages to the player's
        # user, matched to the instance through their metadata.
        reminders = (
            db.session.query(Message, ConversationParticipant.user_id)
            .join(
                ConversationParticipant,
                ConversationParticipant.conversation_id == Message.conversation_id,
            )
            .filter(ConversationParticipant.user_id.in_(user_ids))
            .filter(Message.sender_id != ConversationParticipant.user_id)
            .filter(Message.message_type == "notification_reminder")
            .filter(Message.is_deleted.is_(False))
            .all()
        )
        player_by_user = {uid: pid for pid, uid in user_by_player.items()}
        for message, user_id in reminders:
            meta = message.msg_metadata or {}
            instance_id = meta.get("lessonInstanceId") or meta.get("instanceId")
            try:
                instance_id = int(instance_id)
            except (TypeError, ValueError):
                continue
            if instance_id not in instance_ids:
                continue
            player_id = player_by_user.get(user_id)
            if player_id is not None:
                note(player_id, instance_id, message.sent_at)

    # Invitations: the engine's own record, dated by the message it sent.
    events = (
        db.session.query(NotificationEvent, Message.sent_at)
        .join(Message, Message.id == NotificationEvent.message_id)
        .filter(NotificationEvent.player_id.in_(player_ids))
        .filter(NotificationEvent.lesson_instance_id.in_(instance_ids))
        .all()
    )
    for event, sent_at in events:
        note(event.player_id, event.lesson_instance_id, sent_at)

    return {p.id: latest.get((p.player_id, p.lesson_instance_id)) for p in rows}
