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
    class_href,
    fill,
    load_events,
    next_class_block,
    reply_items,
    schedule_block,
)
from padel_app.helpers.dashboard.kpis import compute_player_kpis

QUEUE_INVITE_LIMIT = 5
# PAD-202 correction: a student's "upcoming" is the next month, not the coach's
# dense week — a once-a-week student otherwise met an empty section. It is the
# same window the dashboard fetch already asks for.
PLAYER_SCHEDULE_DAYS = 30


def _instance_id(event: Dict[str, Any]) -> Optional[int]:
    """The materialised instance behind an event, or ``None`` for a projected occurrence."""
    if event.get("model") != "LessonInstance":
        return None
    try:
        return int(event.get("originalId"))
    except (TypeError, ValueError):
        return None


def _pending_instance_ids(player_id: int, instance_ids: List[int]) -> set:
    """Instances the student was asked to confirm and has not answered.

    Both answers set ``confirmed`` (see respond_to_reminder), so "asked and
    unanswered" is exactly ``invited and not confirmed``.
    """
    if not instance_ids:
        return set()
    rows = (
        db.session.query(Presence.lesson_instance_id)
        .filter(Presence.player_id == player_id)
        .filter(Presence.lesson_instance_id.in_(instance_ids))
        .filter(Presence.invited.is_(True))
        .filter(Presence.confirmed.is_(False))
        .all()
    )
    return {r[0] for r in rows}


def _decorate_with_confirmation(player_id: int, events: List[Dict[str, Any]], items: List[Dict[str, Any]]) -> None:
    """Add ``lessonInstanceId`` + ``pendingConfirmation`` to rows/hero built from ``events``.

    The shared builders key rows by the calendar event id, so the instance id is
    recovered from the event list rather than re-queried (rule 3 — the two
    surfaces always agree on the id).
    """
    by_event_id = {str(e.get("id") or ""): e for e in events}
    instance_ids: Dict[str, Optional[int]] = {}
    for item in items:
        key = str(item.get("id") or item.get("classId") or "")
        instance_ids[key] = _instance_id(by_event_id.get(key, {}))
    pending = _pending_instance_ids(player_id, [i for i in instance_ids.values() if i is not None])
    for item in items:
        key = str(item.get("id") or item.get("classId") or "")
        iid = instance_ids.get(key)
        item["lessonInstanceId"] = iid
        item["pendingConfirmation"] = iid is not None and iid in pending


# ── 1. next class hero ─────────────────────────────────────────────────────


def build_player_next_class_block(*, player_id: int, now: Optional[datetime] = None) -> Optional[Dict[str, Any]]:
    """The student's soonest class, with their classmates. ``None`` when nothing is scheduled."""
    now = now or utcnow_naive()
    events = load_events(player_id=player_id, start=now, end=now + timedelta(days=HERO_LOOKAHEAD_DAYS))
    block = next_class_block(events, now=now)
    if block is not None:
        _decorate_with_confirmation(player_id, events, [block["data"]])
    return block


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
                # The answer goes through respond_reminder, keyed by instance.
                "lessonInstanceId": int(instance.id),
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
    events = load_events(player_id=player_id, start=now, end=now + timedelta(days=PLAYER_SCHEDULE_DAYS))
    block = schedule_block(events)
    _decorate_with_confirmation(player_id, events, block["data"]["items"])
    return block


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
