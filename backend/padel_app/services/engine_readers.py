"""What the app's screens read for a new-engine session (swap plan §3.2; PAD-918's second PR).

Each reader here answers in the shape its old-engine twin answers, from the new engine's rows
(``models/engine_store.py``), for a session ``engine_switch.engine_for`` puts on the new engine.
"""
from __future__ import annotations

from datetime import datetime

from padel_app.sql_db import db
from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive


def invitee_outcome(row, presence, started: bool, now: datetime) -> str:
    """calendar.event-detail ND1: the first match of the table, from the invitation and the student's
    presence on the session."""
    placed = presence is not None and presence.placed_how == "invitation"
    if row.answer == "yes" and placed and presence.status == "absent":
        return "cancelled"
    if row.answer == "yes" and placed:
        return "accepted"
    if row.answer == "no":
        return "declined"
    if row.closed_reason == "withdrawn":
        return "withdrawn"
    if row.closed_reason == "same_hour" or (row.closed_at is not None and row.closed_reason is None):
        return "closed_same_hour"
    if row.sorry_at is not None and row.reopened_at is None:
        return "sorry"
    if started:
        return "expired"
    if row.counts_until is not None and row.counts_until > now:
        return "pending"
    return "not_counting"


def _tier_labels(session: str):
    """``tier index -> (tierSource, groupNumber)`` from the coach's settings now (ND1: the group number is
    1-based in the coach's group order; only a pool tier has one)."""
    from padel_app.services.engine_store import settings_for

    try:
        tiers = settings_for(session).tiers
    except Exception:  # noqa: BLE001 — a coach whose settings no longer map still shows the list
        return {}
    labels, group = {}, 0
    for i, tier in enumerate(tiers):
        if tier.source == "pool":
            group += 1
        labels[i] = (tier.source, group if tier.source == "pool" else None)
    return labels


def engine_invitees(instance, now: datetime | None = None) -> list[dict]:
    """The class detail's ``invitations`` for a new-engine session (calendar.event-detail ND1–ND3): one
    row per student invited, in the order invited, with today's keys plus ``tierSource``,
    ``groupNumber`` and ``reopenedAt``. Students placed by automatic entry or direct join hold no
    invitation, so they are participants only."""
    from padel_app.models import EngineInvitation
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence

    now = now or utcnow_naive()
    started = instance.start_datetime is not None and utc_to_wall_naive(now) >= instance.start_datetime
    presences = {p.player_id: p for p in Presence.query.filter_by(lesson_instance_id=instance.id).all()}
    labels = _tier_labels(str(instance.id))
    out = []
    for row in (EngineInvitation.query.filter_by(lesson_instance_id=instance.id)
                .order_by(EngineInvitation.sent_at, EngineInvitation.id).all()):
        player = db.session.get(Player, row.player_id)
        source, group = labels.get(row.tier, (None, None)) if row.tier is not None else (None, None)
        outcome = invitee_outcome(row, presences.get(row.player_id), started, now)
        out.append({
            "id": row.id,
            "playerId": str(row.player_id),
            "playerName": player.user.name if player is not None and player.user is not None else "Unknown",
            "status": "open" if outcome in ("pending", "not_counting") else outcome,
            "outcome": outcome,
            "answer": row.answer,
            "answeredBy": None,
            "movedAt": None,
            "reopenedAt": row.reopened_at.isoformat() if row.reopened_at else None,
            "tierSource": source,
            "groupNumber": group,
        })
    return out
