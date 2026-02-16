from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import func

from padel_app.sql_db import db
from padel_app.models import ConversationParticipant, Message, User


def compute_message_overview(*, user_id: int) -> Tuple[int, int, Optional[Dict[str, Any]]]:
    """
    Compute message overview stats for the dashboard.

    Args:
        user_id: Current user id.

    Returns:
        Tuple[int, int, Optional[Dict[str, Any]]]:
            - unread_total: total unread messages
            - conversations_to_reply: number of conversations with unread messages
            - latest: dict with sender/preview or None
    """
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)

    CP = ConversationParticipant
    M = Message
    U = User

    unread_total = (
        db.session.query(func.count(M.id))
        .join(CP, CP.conversation_id == M.conversation_id)
        .filter(CP.user_id == user_id)
        .filter(M.sender_id != user_id)
        .filter(M.sent_at > func.coalesce(CP.last_read_at, epoch))
        .scalar()
    ) or 0

    conversations_to_reply = (
        db.session.query(func.count(func.distinct(M.conversation_id)))
        .join(CP, CP.conversation_id == M.conversation_id)
        .filter(CP.user_id == user_id)
        .filter(M.sender_id != user_id)
        .filter(M.sent_at > func.coalesce(CP.last_read_at, epoch))
        .scalar()
    ) or 0

    latest_msg = (
        db.session.query(M, U)
        .join(CP, CP.conversation_id == M.conversation_id)
        .join(U, U.id == M.sender_id)
        .filter(CP.user_id == user_id)
        .order_by(M.sent_at.desc())
        .first()
    )

    latest: Optional[Dict[str, Any]] = None
    if latest_msg:
        msg, sender = latest_msg
        latest = {
            "sender": sender.name,
            "preview": msg.text,
        }

    return int(unread_total), int(conversations_to_reply), latest
