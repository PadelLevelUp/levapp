from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from padel_app.helpers.dashboard.player_home import (
    build_player_kpi_block,
    build_player_needs_you_block,
    build_player_next_class_block,
    build_player_schedule_block,
)


def build_player_dashboard_blocks(*, player, user_id: int, now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """
    Build player-specific dashboard blocks, in the order the screen renders them:
      - Next class hero (omitted entirely when nothing is scheduled)
      - "Needs you" queue (invites to answer, then replies)
      - Next 7 days
      - KPIs, each with its denominator

    PAD-202: the old ``kpi_grid`` + ``grid`` of two ``class_list`` blocks is gone.
    The student now shares the coach home's vocabulary so both shells render it
    with the same components. See helpers/dashboard/player_home.py.
    """
    blocks: List[Dict[str, Any]] = []

    hero = build_player_next_class_block(player_id=player.id, now=now)
    if hero is not None:
        blocks.append(hero)

    blocks.append(build_player_needs_you_block(player_id=player.id, user_id=user_id, now=now))
    blocks.append(build_player_schedule_block(player_id=player.id, now=now))
    blocks.append(build_player_kpi_block(player_id=player.id, now=now))

    evaluations_block = _build_player_evaluations_block(player=player)
    if evaluations_block is not None:
        blocks.append(evaluations_block)

    return blocks


def _build_player_evaluations_block(*, player) -> Optional[Dict[str, Any]]:
    """PAD-402 (evaluations.student-view rules 4, 5): the newest 3 shared cards,
    gated by the `evaluations` capability token (fails closed) and omitted
    entirely — never an empty block — when the player has none."""
    from padel_app.services.evaluation_share_service import my_evaluations
    from padel_app.utils.client_capabilities import EVALUATIONS, client_declares

    if not client_declares(EVALUATIONS):
        return None
    cards = my_evaluations(player)["cards"][:3]
    if not cards:
        return None
    return {
        "id": "evaluations",
        "type": "evaluations",
        "data": {"cards": cards, "href": "/evaluations"},
    }
