"""Blocks for the student home (PAD-202).

The student payload speaks the coach home's vocabulary — ``next_class``,
``needs_you``, ``schedule_7d`` — so both shells render it with the very same
components; only ``kpi_grid`` is student-specific, and it now carries the
context that gives each number meaning (``total``).

The one thing the old student dashboard promised and never delivered was the
"Invites to confirm" list: it filtered calendar events on ``invited`` /
``confirmed`` flags the calendar serializer does not emit, so it was always
empty. The queue reads ``Presence`` directly — the same rows the Invites KPI
already counted — so the two cannot disagree.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from padel_app.sql_db import db
from padel_app.models import LessonInstance, Presence
from padel_app.serializers.calendar_event import serialize_calendar_event
from padel_app.utils.dates import utcnow_naive

from padel_app.helpers.dashboard.coach_home import (
    HERO_LOOKAHEAD_DAYS,
    SCHEDULE_DAYS,
    class_href,
    fill,
    load_events,
    next_class_block,
    reply_items,
    schedule_block,
)
from padel_app.helpers.dashboard.kpis import compute_player_kpis

QUEUE_INVITE_LIMIT = 5


# ── 1. next class hero ─────────────────────────────────────────────────────


def build_player_next_class_block(*, player_id: int, now: Optional[datetime] = None) -> Optional[Dict[str, Any]]:
    """The student's soonest class, with their classmates. ``None`` when nothing is scheduled."""
    now = now or utcnow_naive()
    events = load_events(player_id=player_id, start=now, end=now + timedelta(days=HERO_LOOKAHEAD_DAYS))
    return next_class_block(events, now=now)


# ── 2. needs-you queue ─────────────────────────────────────────────────────


def build_player_needs_you_block(*, player_id: int, user_id: int, now: Optional[datetime] = None) -> Dict[str, Any]:
    """Invites to answer (soonest first), then unread replies."""
    now = now or utcnow_naive()

    items: List[Dict[str, Any]] = []
    items.extend(_invite_items(player_id=player_id, now=now))
    items.extend(reply_items(user_id=user_id))

    return {
        "id": "needs_you",
        "type": "needs_you",
        "data": {"count": len(items), "items": items},
    }


def _invite_items(*, player_id: int, now: datetime) -> List[Dict[str, Any]]:
    """Presences the student was invited to and has neither confirmed nor declined.

    A declined invite is marked ``status = "absent"`` (and left unconfirmed), so
    it must be excluded explicitly or it would nag forever.
    """
    rows = (
        db.session.query(LessonInstance)
        .join(Presence, Presence.lesson_instance_id == LessonInstance.id)
        .filter(Presence.player_id == player_id)
        .filter(Presence.invited.is_(True))
        .filter(Presence.confirmed.is_(False))
        .filter((Presence.status.is_(None)) | (Presence.status != "absent"))
        .filter(LessonInstance.start_datetime >= now)
        .order_by(LessonInstance.start_datetime.asc())
        .limit(QUEUE_INVITE_LIMIT)
        .all()
    )

    out: List[Dict[str, Any]] = []
    for instance in rows:
        event = serialize_calendar_event(instance, now=now)
        filled, capacity = fill(event)
        out.append(
            {
                "kind": "invite",
                "id": str(event.get("id") or ""),
                "classTitle": event.get("title") or "",
                "date": event.get("date"),
                "timeLabel": event.get("startTime"),
                "filled": filled,
                "capacity": capacity,
                "href": class_href(event),
            }
        )
    return out


# ── 3. next 7 days ─────────────────────────────────────────────────────────


def build_player_schedule_block(*, player_id: int, now: Optional[datetime] = None) -> Dict[str, Any]:
    now = now or utcnow_naive()
    events = load_events(player_id=player_id, start=now, end=now + timedelta(days=SCHEDULE_DAYS))
    return schedule_block(events)


# ── 4. KPIs ────────────────────────────────────────────────────────────────


def build_player_kpi_block(*, player_id: int) -> Dict[str, Any]:
    """Attended / Missed / Upcoming / Invites, each with the context that makes it readable.

    ``href`` policy is unchanged (dashboard.navigation rules 6, 7, 11, 11a):
    a KPI links out only where a page exists, so Invites ships without one.
    """
    kpis = compute_player_kpis(player_id=player_id)
    total = int(kpis.lessons_attended) + int(kpis.lessons_missed)

    return {
        "id": "kpis",
        "type": "kpi_grid",
        "data": {
            "items": [
                {
                    "label": "Attended",
                    "value": int(kpis.lessons_attended),
                    "total": total,
                    "icon": "check_circle",
                    "href": "/attendance",
                },
                {
                    "label": "Missed",
                    "value": int(kpis.lessons_missed),
                    "total": total,
                    "icon": "x_circle",
                    "href": "/absences",
                },
                {
                    "label": "Upcoming lessons",
                    "value": int(kpis.upcoming_lessons),
                    "icon": "calendar",
                    "href": "/calendar",
                },
                {
                    "label": "Invites",
                    "value": int(kpis.invites_to_confirm),
                    "icon": "mail",
                },
            ]
        },
    }
