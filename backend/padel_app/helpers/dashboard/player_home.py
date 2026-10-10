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
from padel_app.models import (
    ConversationParticipant,
    LessonInstance,
    Message,
    NotificationEvent,
    Presence,
)
from padel_app.serializers.calendar_event import serialize_calendar_event
from padel_app.utils.dates import club_now_naive, utcnow_naive, wall_to_utc_naive
# PAD-256 (R-023): inside the dashboard helpers `now` is the club's wall clock,
# the clock class times are stored in. It goes back to UTC only where it meets
# an event timestamp (the calendar serializer, the snooze).

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


def _decorate_with_confirmation(
    player_id: int, events: List[Dict[str, Any]], items: List[Dict[str, Any]], *, now: datetime
) -> None:
    """Add ``lessonInstanceId``, ``pendingConfirmation``, ``attendanceState`` and
    ``declineTarget`` to rows/hero built from ``events`` (dashboard.blocks rule 3a).

    The shared builders key rows by the calendar event id, so the instance id is
    recovered from the event list rather than re-queried (rule 3 — the two
    surfaces always agree on the id). PAD-570: ``pendingConfirmation`` is the ONE
    server predicate (``attendance.confirm`` rule 27), never ``invited``; a
    projected occurrence has no row, so it is ``planned`` and its ask is the
    time-based one computed on the virtual occurrence.
    """
    from padel_app.helpers.dashboard.confirmation import ask_state

    by_event_id = {str(e.get("id") or ""): e for e in events}
    instance_ids: Dict[str, Optional[int]] = {}
    for item in items:
        key = str(item.get("id") or item.get("classId") or "")
        instance_ids[key] = _instance_id(by_event_id.get(key, {}))
    state = ask_state(player_id, [i for i in instance_ids.values() if i is not None], now)
    for item in items:
        key = str(item.get("id") or item.get("classId") or "")
        event = by_event_id.get(key, {})
        iid = instance_ids.get(key)
        item["lessonInstanceId"] = iid
        own = state.get(iid) if iid is not None else None
        item["pendingConfirmation"] = bool(own and own["pendingConfirmation"]) or (
            iid is None and _virtual_ask_open(event, now)
        )
        item["attendanceState"] = own["attendanceState"] if own else "planned"
        item["declineTarget"] = (
            {"model": event.get("model"), "originalId": event.get("originalId"), "date": event.get("date")}
            if event.get("model") and event.get("originalId") is not None
            else None
        )


def _virtual_ask_open(event: Dict[str, Any], now: datetime) -> bool:
    """PAD-570: a projected occurrence (no row yet) is ``planned``; its ask is the
    time-based one, on the series' own notifications switch."""
    from datetime import date as _date
    from types import SimpleNamespace

    from padel_app.models import Lesson
    from padel_app.services.notification_service import student_may_confirm

    if event.get("model") != "Lesson" or event.get("originalId") is None or not event.get("date"):
        return False
    lesson = db.session.get(Lesson, int(event["originalId"]))
    if lesson is None or lesson.start_datetime is None:
        return False
    start = datetime.combine(_date.fromisoformat(str(event["date"])[:10]), lesson.start_datetime.time())
    stand_in = SimpleNamespace(
        id=None, start_datetime=start, status="scheduled",
        notifications_enabled=bool(lesson.notifications_enabled), lesson=lesson,
    )
    return student_may_confirm(None, stand_in, None, now=wall_to_utc_naive(now))


# ── 1. next class hero ─────────────────────────────────────────────────────


def build_player_next_class_block(*, player_id: int, now: Optional[datetime] = None) -> Optional[Dict[str, Any]]:
    """The student's soonest class, with their classmates. ``None`` when nothing is scheduled."""
    now = now or club_now_naive()
    events = load_events(player_id=player_id, start=now, end=now + timedelta(days=HERO_LOOKAHEAD_DAYS))
    block = next_class_block(events, now=now)
    if block is not None:
        _decorate_with_confirmation(player_id, events, [block["data"]], now=now)
    return block


# ── 2. needs-you queue ─────────────────────────────────────────────────────


def build_player_needs_you_block(*, player_id: int, user_id: int, now: Optional[datetime] = None) -> Dict[str, Any]:
    """Invites to answer (soonest first), then unread replies."""
    now = now or club_now_naive()

    # PAD-236: the asks come from three sources — the reminder (Presence), the
    # invitation engine (NotificationEvent) and the waiting-list offer (a chat
    # message) — merged soonest-class-first and capped together, so the most
    # time-sensitive question a student gets is never buried in the chat.
    asks = (
        _invite_items(player_id=player_id, now=now)
        + _vacancy_invite_items(player_id=player_id, now=now)
        + _waiting_list_offer_items(player_id=player_id, user_id=user_id, now=now)
    )
    asks.sort(key=lambda i: (str(i.get("date") or ""), str(i.get("timeLabel") or "")))

    items: List[Dict[str, Any]] = []
    items.extend(asks[:QUEUE_INVITE_LIMIT])
    items.extend(reply_items(user_id=user_id))

    return {
        "id": "needs_you",
        "type": "needs_you",
        "data": {"count": len(items), "items": items},
    }


def _invite_items(*, player_id: int, now: datetime) -> List[Dict[str, Any]]:
    """Occurrences the student has been ASKED to confirm and has not answered.

    PAD-570: the same predicate as the rows' ``pendingConfirmation``
    (``attendance.confirm`` rule 27) — before it this read ``invited and not
    confirmed``, which ``enrol()`` makes true from enrolment (B-441), so a student
    was nagged from day one.
    """
    from padel_app.helpers.dashboard.confirmation import askable_instances

    rows = askable_instances(player_id, now, limit=QUEUE_INVITE_LIMIT)

    out: List[Dict[str, Any]] = []
    for instance in rows:
        event = serialize_calendar_event(instance, now=wall_to_utc_naive(now))
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


def _class_item(instance: LessonInstance, *, now: datetime) -> Dict[str, Any]:
    event = serialize_calendar_event(instance, now=wall_to_utc_naive(now))
    filled, capacity = fill(event)
    return {
        "lessonInstanceId": int(instance.id),
        "classTitle": event.get("title") or "",
        "date": event.get("date"),
        "timeLabel": event.get("startTime"),
        "filled": filled,
        "capacity": capacity,
        "href": class_href(event),
    }


def _message_open(message: Optional[Message]) -> bool:
    """True while the chat bubble would still show Yes/No."""
    if message is None:
        return True
    meta = message.msg_metadata or {}
    return not (meta.get("responded") or meta.get("superseded") or meta.get("expired"))


def _vacancy_invite_items(*, player_id: int, now: datetime) -> List[Dict[str, Any]]:
    """Open engine invitations — "a spot opened, want it?" (PAD-236).

    An event is open while its status is ``sent`` and its class has not started.
    It is deduplicated against the chat bubble: once the invite message carries
    ``responded`` (either shell's Yes/No wrote it), the question is settled and
    must not reappear here. Several rounds for the same class collapse to the
    newest event so one class is one card.
    """
    rows = (
        db.session.query(NotificationEvent, LessonInstance)
        .join(LessonInstance, LessonInstance.id == NotificationEvent.lesson_instance_id)
        .filter(NotificationEvent.player_id == player_id)
        .filter(NotificationEvent.status == "sent")
        .filter(LessonInstance.start_datetime >= now)
        .filter(LessonInstance.status != "canceled")
        .order_by(LessonInstance.start_datetime.asc(), NotificationEvent.id.desc())
        .all()
    )
    out: List[Dict[str, Any]] = []
    seen: set = set()
    for event, instance in rows:
        if instance.id in seen:
            continue
        seen.add(instance.id)
        message = db.session.get(Message, event.message_id) if event.message_id else None
        if not _message_open(message):
            continue
        item = _class_item(instance, now=now)
        item.update(
            {
                "kind": "vacancy_invite",
                "id": f"notification-{event.id}",
                # The answer goes through respond_to_notification, keyed by event.
                "notificationEventId": int(event.id),
            }
        )
        out.append(item)
    return out


def _waiting_list_offer_items(*, player_id: int, user_id: int, now: datetime) -> List[Dict[str, Any]]:
    """Un-answered waiting-list offers — "want to join the list?" (PAD-236).

    The offer only exists as a chat message (``notifications.waiting-list``
    rule 1), so this reads the student's inbound ``waiting_list_offer`` messages
    and keeps the ones still open for a class that has not started. Metadata is
    filtered in Python, like the reminder code, so SQLite tests and Postgres
    behave identically.
    """
    rows = (
        db.session.query(Message)
        .join(ConversationParticipant, ConversationParticipant.conversation_id == Message.conversation_id)
        .filter(ConversationParticipant.user_id == user_id)
        .filter(Message.sender_id != user_id)
        .filter(Message.message_type == "waiting_list_offer")
        .filter(Message.is_deleted.is_(False))
        .order_by(Message.id.desc())
        .all()
    )
    out: List[Dict[str, Any]] = []
    seen: set = set()
    for message in rows:
        meta = message.msg_metadata or {}
        instance_id = meta.get("lessonInstanceId")
        if not instance_id or instance_id in seen:
            continue
        seen.add(instance_id)
        if not _message_open(message):
            continue
        instance = db.session.get(LessonInstance, int(instance_id))
        if (
            instance is None
            or instance.start_datetime is None
            or instance.start_datetime < now
            or instance.status == "canceled"
        ):
            continue
        item = _class_item(instance, now=now)
        item.update({"kind": "waiting_list_offer", "id": f"waiting-list-offer-{message.id}"})
        out.append(item)
    return out


# ── 3. next 7 days ─────────────────────────────────────────────────────────


def _upcoming_events(player_id: int, now: datetime) -> List[Dict[str, Any]]:
    """The student's scheduled classes over the 30-day window.

    One loader for the schedule block AND the "Upcoming lessons" tile (PAD-235,
    B-032): the tile used to count confirmed presences while the list counted
    enrolments, so a student with unanswered reminders read "0 upcoming" above
    three upcoming classes.
    """
    return load_events(player_id=player_id, start=now, end=now + timedelta(days=PLAYER_SCHEDULE_DAYS))


def build_player_schedule_block(*, player_id: int, now: Optional[datetime] = None) -> Dict[str, Any]:
    now = now or club_now_naive()
    events = _upcoming_events(player_id, now)
    block = schedule_block(events)
    _decorate_with_confirmation(player_id, events, block["data"]["items"], now=now)
    return block


# ── 4. KPIs ────────────────────────────────────────────────────────────────


def build_player_kpi_block(*, player_id: int, now: Optional[datetime] = None) -> Dict[str, Any]:
    """Attended / Missed / Upcoming / Invites, each with the context that makes it readable.

    ``href`` policy is unchanged (dashboard.navigation rules 6, 7, 11, 11a):
    a KPI links out only where a page exists, so Invites ships without one.

    "Upcoming lessons" is ``len(_upcoming_events(...))`` — the schedule's own
    number (dashboard.blocks rule 3, PAD-235).
    """
    from padel_app.helpers.dashboard.confirmation import askable_instances

    now = now or club_now_naive()
    kpis = compute_player_kpis(player_id=player_id)
    total = int(kpis.lessons_attended) + int(kpis.lessons_missed)
    upcoming = len(_upcoming_events(player_id, now))
    # PAD-570: the tile counts the same asks the queue lists — never a raw `invited` count.
    invites = len(askable_instances(player_id, now))

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
                    "value": upcoming,
                    "icon": "calendar",
                    "href": "/calendar",
                },
                {
                    "label": "Invites",
                    "value": invites,
                    "icon": "mail",
                },
            ]
        },
    }
