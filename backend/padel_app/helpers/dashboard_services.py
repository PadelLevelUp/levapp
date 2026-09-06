from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from padel_app.helpers.dashboard.messages import compute_message_overview
from padel_app.helpers.dashboard.coach import build_coach_dashboard_blocks
from padel_app.helpers.dashboard.player import build_player_dashboard_blocks


def build_dashboard_payload(
    *,
    user,
    coach: Optional[object],
    player: Optional[object],
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Orchestrator: returns either coach or player dashboard.

    Args:
        user: Current user
        coach: Coach model or None
        player: Player model or None
        now: Injected clock for the time-dependent student blocks (tests); the
            coach blocks read ``utcnow_naive()`` themselves.

    Returns:
        Dashboard payload dict. The ``id`` is how the client tells the two homes
        apart (dashboard.blocks rule 3b) — both now share block types.
    """
    unread_messages, conversations_to_reply, latest = compute_message_overview(user_id=user.id)

    # Emitted for every dashboard because the layout's unread badge feeds off
    # it; neither home renders it as a card.
    base_blocks = [
        {
            "id": "messages",
            "type": "messages_overview",
            "data": {
                "unreadMessages": unread_messages,
                "conversationsToReply": conversations_to_reply,
                "latest": latest,
                "href": "/messages",
            },
        }
    ]

    if coach is not None:
        role_blocks = build_coach_dashboard_blocks(coach=coach, user_id=user.id)
        dashboard_id = "coach_default_v1"
    else:
        role_blocks = build_player_dashboard_blocks(player=player, user_id=user.id, now=now)
        dashboard_id = "player_default_v1"

    return {
        "id": dashboard_id,
        "title": "Dashboard",
        "blocks": base_blocks + role_blocks,
    }
