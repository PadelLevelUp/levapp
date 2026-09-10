"""Blocks for the rebuilt coach dashboard — and the home vocabulary both roles share.

The screen answers one question — *what needs me right now?* — so the payload is
four blocks in priority order: the class about to start, a queue of things that
can be resolved, the week ahead, and two health metrics.

PAD-202: the student home speaks the same vocabulary (``next_class``,
``needs_you``, ``schedule_7d``), so the role-agnostic halves live here as public
helpers — ``load_events``, ``next_class_block``, ``schedule_block``,
``reply_items``, ``class_href``, ``fill`` — and ``player_home.py`` composes them
for a player. Only the loading differs by role; the block shapes never do.

Every number here ships with its denominator. A bare count (52 players, 19
classes) tells a coach nothing about whether anything is wrong, which is why the
old ``kpi_grid`` is gone: ``pending_validations`` became a queue item that can be
cleared, and the two remaining counts moved into ``week_pulse`` with context.

Notes on two deliberate choices:

* **No court.** ``Lesson`` has no court/field column, so the hero shows
  ``{start} – {end}`` only rather than inventing a location.
* **Validation is a Presences-tab week, in classes.** (PAD-190 / PAD-201,
  B-045.) The old item counted presence rows over a rolling 7 days while the
  tab counted classes over a Monday–Sunday week, so the two never agreed. The
  item now reads ``count_pending_validation`` — the tab's own helper — for the
  current UTC week, falling back to the previous week when this one is clean
  (a Monday-morning coach still needs to see the weekend's backlog), and links
  to the tab *on that week*. Older attendances are a backlog, not this
  week's chore, and stay out of the card.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib.parse import urlencode

from sqlalchemy import and_, func, or_

from padel_app.sql_db import db
from padel_app.models import (
    Association_CoachLesson,
    Association_CoachPlayer,
    Association_PlayerLessonInstance,
    ConversationParticipant,
    Lesson,
    LessonInstance,
    Message,
    Player,
    Presence,
    User,
)
from padel_app.helpers.calendar_helpers import (
    build_lesson_events,
    load_lessons_for_coach,
    load_lesson_instances_for_coach,
    load_lessons_for_player,
    load_lesson_instances_for_player,
)
from padel_app.helpers.dashboard.snooze import snoozed_item_ids
from padel_app.services.presence_overview_service import count_pending_validation
from padel_app.tools.tools import _safe_int
from padel_app.utils.dates import club_now_naive, utcnow_naive, wall_to_utc_naive
# PAD-256 (R-023): inside the dashboard helpers `now` is the club's wall clock,
# the clock class times are stored in. It goes back to UTC only where it meets
# an event timestamp (the calendar serializer, the snooze).

# How far ahead the hero and the queue look.
HERO_SOON_MINUTES = 120
HERO_LOOKAHEAD_DAYS = 90
SCHEDULE_DAYS = 7
SCHEDULE_ROWS = 5
QUEUE_REPLY_LIMIT = 3
# Two, not three: at 28px with the overlap the design uses, a third circle
# covers the second one's initials. Two avatars plus a "+n" chip reads cleanly
# and still says how many are signed up.
HERO_AVATAR_LIMIT = 2
ACTIVE_PLAYER_DAYS = 30
# The current week, then the previous one. Two, not more: anything older is a
# backlog the tab's week control reaches, not this week's chore.
VALIDATION_WEEK_OFFSETS = (0, -1)

_EPOCH = datetime(1970, 1, 1)


# ── shared event loading ───────────────────────────────────────────────────


def load_events(
    *,
    start: datetime,
    end: datetime,
    coach_id: Optional[int] = None,
    player_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Classes overlapping a window for exactly one of a coach or a player, earliest first.

    Deliberately ignores the serialized ``status``: that field is computed
    against ``utcnow_naive()`` inside the serializer, so it would silently
    override an injected ``now`` and make every time-dependent test here a lie.
    The window bounds are the only thing deciding what is in range.

    A player's instances come off their ``Presence`` rows as well as the
    sign-up association, so an invited-but-unanswered class is on their
    schedule — it is on their calendar too.
    """
    if (coach_id is None) == (player_id is None):
        raise ValueError("Provide exactly one of coach_id or player_id")
    if coach_id is not None:
        lessons = load_lessons_for_coach(coach_id, start, end)
        instances = load_lesson_instances_for_coach(coach_id, start, end)
    else:
        lessons = load_lessons_for_player(player_id, start, end)
        instances = load_lesson_instances_for_player(player_id, start, end)
    events = build_lesson_events(lessons, instances, start, end)

    in_window = [
        e
        for e in events
        if e.get("type") == "class" and _event_end(e) > start and _event_start(e) < end
    ]
    return sorted(in_window, key=_event_start)


def cut_events(events: Sequence[Dict[str, Any]], *, start: datetime, end: datetime) -> List[Dict[str, Any]]:
    """``events`` restricted to a window — the same predicate ``load_events`` applies.

    PAD-262 (dashboard.blocks rule 8): the coach home loads its classes once over
    the widest window any block needs and every block cuts its own from that
    set, so the four blocks cost one pipeline call instead of twelve.
    """
    return [e for e in events if _event_end(e) > start and _event_start(e) < end]


def coach_home_window(now: datetime) -> Tuple[datetime, datetime]:
    """The superset window: a week before the current week (week-pulse delta)
    to the hero's look-ahead."""
    week_start = datetime.combine(now.date() - timedelta(days=now.weekday()), datetime.min.time())
    start = min(week_start - timedelta(days=7), now - timedelta(days=SCHEDULE_DAYS))
    end = max(week_start + timedelta(days=7), now + timedelta(days=HERO_LOOKAHEAD_DAYS))
    return start, end


def load_coach_home_events(*, coach_id: int, now: datetime) -> List[Dict[str, Any]]:
    start, end = coach_home_window(now)
    return load_events(coach_id=coach_id, start=start, end=end)


def _window_events(
    events: Optional[Sequence[Dict[str, Any]]], *, coach_id: int, start: datetime, end: datetime
) -> List[Dict[str, Any]]:
    """Cut the preloaded set when there is one, otherwise load just this window."""
    if events is not None:
        return cut_events(events, start=start, end=end)
    return load_events(coach_id=coach_id, start=start, end=end)


def _event_start(event: Dict[str, Any]) -> datetime:
    return _combine(event.get("date"), event.get("startTime"), datetime.max)


def _event_end(event: Dict[str, Any]) -> datetime:
    """The class's real end instant (B-058, dashboard.blocks rule 9).

    ``date`` is the START date, and the strings are UTC. A class that crosses
    UTC midnight (23:15-00:15 UTC) ends on the next date, so an end time
    earlier than the start time rolls forward one day. Joining the start date
    to the end time used to put such a class's end before its start, and every
    block built on ``load_events`` dropped it.
    """
    end = _combine(event.get("date"), event.get("endTime"), datetime.min)
    start = _combine(event.get("date"), event.get("startTime"), datetime.max)
    if end is not datetime.min and start is not datetime.max and end < start:
        end += timedelta(days=1)
    return end


def _combine(day: Optional[str], clock: Optional[str], fallback: datetime) -> datetime:
    try:
        return datetime.fromisoformat(f"{day}T{clock}")
    except (TypeError, ValueError):
        return fallback


def class_href(event: Dict[str, Any]) -> str:
    """Deep link that opens this one occurrence in the calendar.

    Both params are required — a materialized id is just ``lessoninstance-<pk>``,
    so the date cannot be derived from it, and the calendar needs the date to
    select the right week.
    """
    return "/calendar?" + urlencode(
        {"classId": str(event.get("id") or ""), "date": str(event.get("date") or "")}
    )


def fill(event: Dict[str, Any]) -> Tuple[int, int]:
    return _safe_int(event.get("participantCount"), 0), _safe_int(event.get("maxPlayers"), 0)


def _initials(name: Optional[str]) -> str:
    parts = [p for p in (name or "").split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


# ── 1. next class hero ─────────────────────────────────────────────────────


def build_next_class_block(
    *, coach_id: int, now: Optional[datetime] = None, events: Optional[Sequence[Dict[str, Any]]] = None
) -> Optional[Dict[str, Any]]:
    """The class about to start. ``None`` when the coach has nothing scheduled.

    Returning ``None`` is intentional: an empty hero would be the largest element
    on the screen saying nothing, which is the flaw this redesign removes.
    """
    now = now or club_now_naive()
    window = _window_events(events, coach_id=coach_id, start=now, end=now + timedelta(days=HERO_LOOKAHEAD_DAYS))
    return next_class_block(window, now=now)


def next_class_block(events: Sequence[Dict[str, Any]], *, now: datetime) -> Optional[Dict[str, Any]]:
    """The ``next_class`` block for the earliest of ``events``; ``None`` for none."""
    if not events:
        return None

    event = events[0]
    start = _event_start(event)
    filled, capacity = fill(event)
    is_today = start.date() == now.date()
    minutes_until = int((start - now).total_seconds() // 60)

    return {
        "id": "next_class",
        "type": "next_class",
        "data": {
            "classId": str(event.get("id") or ""),
            "title": event.get("title") or "",
            "date": event.get("date"),
            "startTime": event.get("startTime"),
            "endTime": event.get("endTime"),
            "isToday": is_today,
            # Drives "UP NEXT · 18:00" vs "NEXT CLASS · Tuesday". The client
            # localises the weekday from `date`; this is just the switch.
            "weekday": start.strftime("%A"),
            # Only set when the chip should show, so the client never has to
            # re-derive the 2-hour rule.
            "minutesUntil": minutes_until if is_today and 0 <= minutes_until <= HERO_SOON_MINUTES else None,
            "filled": filled,
            "capacity": capacity,
            "players": _roster(event, limit=HERO_AVATAR_LIMIT),
            "href": class_href(event),
        },
    }


def _roster(event: Dict[str, Any], *, limit: int) -> List[Dict[str, Any]]:
    """Signed-up players for the avatar stack, capped at ``limit``.

    An unmaterialized occurrence has no instance row, so enrolment comes off the
    lesson template instead.
    """
    model = event.get("model")
    original_id = event.get("originalId")
    if not original_id:
        return []

    if model == "LessonInstance":
        rows = (
            db.session.query(Player)
            .join(
                Association_PlayerLessonInstance,
                Association_PlayerLessonInstance.player_id == Player.id,
            )
            .filter(Association_PlayerLessonInstance.lesson_instance_id == original_id)
            .all()
        )
    else:
        lesson = db.session.get(Lesson, original_id)
        rows = [rel.player for rel in getattr(lesson, "players_relations", [])] if lesson else []

    return [
        {"id": p.id, "name": p.name, "initials": _initials(p.name)}
        for p in rows[:limit]
        if p is not None
    ]


# ── 2. needs-you queue ─────────────────────────────────────────────────────


def build_needs_you_block(
    *,
    coach_id: int,
    user_id: int,
    now: Optional[datetime] = None,
    events: Optional[Sequence[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Things the coach can resolve, each carrying its own action.

    Order is fixed — empty seats (soonest first), then replies, then validation —
    because it runs from time-critical to whenever-you-like.
    """
    now = now or club_now_naive()

    items: List[Dict[str, Any]] = []
    items.extend(_empty_seat_items(coach_id=coach_id, now=now, events=events))
    items.extend(reply_items(user_id=user_id))

    validation = _validation_item(coach_id=coach_id, now=now)
    if validation:
        items.append(validation)

    return {
        "id": "needs_you",
        "type": "needs_you",
        "data": {"count": len(items), "items": items},
    }


def _empty_seat_items(
    *, coach_id: int, now: datetime, events: Optional[Sequence[Dict[str, Any]]] = None
) -> List[Dict[str, Any]]:
    events = _window_events(events, coach_id=coach_id, start=now, end=now + timedelta(days=SCHEDULE_DAYS))
    # "Later" (rule 3c): a snoozed occurrence stays off the queue until its
    # snooze lapses. It is still on the schedule — only the nag is paused.
    snoozed = snoozed_item_ids(coach_id=coach_id, now=wall_to_utc_naive(now))  # snoozed_until is UTC
    out: List[Dict[str, Any]] = []
    for event in events:
        filled, capacity = fill(event)
        if not capacity or filled >= capacity:
            continue
        if str(event.get("id") or "") in snoozed:
            continue
        out.append(
            {
                "kind": "empty_seats",
                "id": str(event.get("id") or ""),
                "classTitle": event.get("title") or "",
                "seatsMissing": capacity - filled,
                "date": event.get("date"),
                "timeLabel": event.get("startTime"),
                "filled": filled,
                "capacity": capacity,
                "href": class_href(event),
            }
        )
    return out


def reply_items(*, user_id: int) -> List[Dict[str, Any]]:
    """Unread inbound messages, most recent first, one per conversation.

    PAD-262: the database picks the newest unread message per conversation
    and returns at most ``QUEUE_REPLY_LIMIT`` rows; this used to pull every
    unread message the user had and dedupe in Python.
    """
    unread = (
        db.session.query(
            Message.conversation_id.label("conversation_id"),
            func.max(Message.sent_at).label("latest_at"),
        )
        .join(ConversationParticipant, ConversationParticipant.conversation_id == Message.conversation_id)
        .filter(ConversationParticipant.user_id == user_id)
        .join(User, User.id == Message.sender_id)
        .filter(Message.sender_id != user_id)
        .filter(Message.is_deleted.is_(False))
        # PAD-268 (auth.account-deletion rule 8): a deleted person cannot read a
        # reply, so their messages never put a conversation in the queue.
        .filter(User.status != "disabled")
        .filter(Message.sent_at > func.coalesce(ConversationParticipant.last_read_at, _EPOCH))
        .group_by(Message.conversation_id)
        .subquery()
    )
    rows = (
        db.session.query(Message, User, unread.c.conversation_id)
        .join(unread, and_(Message.conversation_id == unread.c.conversation_id, Message.sent_at == unread.c.latest_at))
        .join(User, User.id == Message.sender_id)
        .filter(Message.sender_id != user_id)
        .filter(Message.is_deleted.is_(False))
        .filter(User.status != "disabled")
        .order_by(Message.sent_at.desc(), Message.id.desc())
        .limit(QUEUE_REPLY_LIMIT * 2)
        .all()
    )

    seen: set = set()
    out: List[Dict[str, Any]] = []
    for message, sender, conversation_id in rows:
        if conversation_id in seen:
            continue
        seen.add(conversation_id)
        out.append(
            {
                "kind": "reply",
                "id": f"conversation-{conversation_id}",
                "personName": sender.name,
                "initials": _initials(sender.name),
                "preview": (message.text or "").strip(),
                "href": f"/messages?conversationId={conversation_id}",
            }
        )
        if len(out) >= QUEUE_REPLY_LIMIT:
            break
    return out


def week_bounds(now: datetime, offset: int) -> Tuple[datetime, datetime]:
    """Monday 00:00:00 – Sunday 23:59:59 (naive UTC) for the week ``offset`` weeks from ``now``.

    Byte-for-byte the window both shells' ``weekBounds`` produce once the bare
    ``to`` date is expanded to end-of-day by ``_parse_attendance_bound``
    (``attendance.validation`` rule 15), so the dashboard counts exactly the
    week the tab will show.
    """
    monday = datetime.combine(now.date() - timedelta(days=now.weekday()), datetime.min.time())
    monday += timedelta(weeks=offset)
    sunday_end = monday + timedelta(days=6, hours=23, minutes=59, seconds=59)
    return monday, sunday_end


def validation_href(week_offset: int) -> str:
    return "/presences" if week_offset == 0 else f"/presences?week={week_offset}"


def _validation_item(*, coach_id: int, now: datetime) -> Optional[Dict[str, Any]]:
    """Classes still to validate, for the tab's week (dashboard.blocks rule 3).

    One helper — ``count_pending_validation`` — so this is the number the
    Presences trigger shows once the card opens it (B-045).
    """
    for offset in VALIDATION_WEEK_OFFSETS:
        start, end = week_bounds(now, offset)
        count = count_pending_validation(
            coach_id=coach_id, range_start=start, range_end=end, now=now
        )
        if count:
            return {
                "kind": "validation",
                "id": "validation",
                "count": int(count),
                "weekOffset": offset,
                "href": validation_href(offset),
            }
    return None


# ── 3. next 7 days ─────────────────────────────────────────────────────────


def build_schedule_block(
    *, coach_id: int, now: Optional[datetime] = None, events: Optional[Sequence[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """The week ahead. Shows the first few rows and links out for the rest."""
    now = now or club_now_naive()
    window = _window_events(events, coach_id=coach_id, start=now, end=now + timedelta(days=SCHEDULE_DAYS))
    return schedule_block(window)


def schedule_block(events: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """The ``schedule_7d`` block for ``events`` already cut to the 7-day window."""
    items = []
    for event in events[:SCHEDULE_ROWS]:
        start = _event_start(event)
        filled, capacity = fill(event)
        items.append(
            {
                "id": str(event.get("id") or ""),
                "title": event.get("title") or "",
                "date": event.get("date"),
                # Client localises both; these keep the column widths stable.
                "weekday": start.strftime("%A"),
                "dayOfMonth": start.day,
                "timeLabel": event.get("startTime"),
                "filled": filled,
                "capacity": capacity,
                "href": class_href(event),
            }
        )

    return {
        "id": "schedule_7d",
        "type": "schedule_7d",
        "data": {
            "totalCount": len(events),
            "items": items,
            "calendarHref": "/calendar",
        },
    }


# ── 4. this week ───────────────────────────────────────────────────────────


def build_week_pulse_block(
    *, coach_id: int, now: Optional[datetime] = None, events: Optional[Sequence[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Two metrics, each with a denominator, plus a 7-day seats trend."""
    now = now or club_now_naive()

    week_start = datetime.combine(now.date() - timedelta(days=now.weekday()), datetime.min.time())
    week_end = week_start + timedelta(days=7)

    # PAD-262: nine windows off one loaded set instead of nine pipeline runs.
    if events is None:
        events = load_events(coach_id=coach_id, start=min(week_start - timedelta(days=7), now - timedelta(days=SCHEDULE_DAYS)), end=max(week_end, now + timedelta(days=1)))

    filled, total = _seats_in_window(coach_id=coach_id, start=week_start, end=week_end, events=events)

    prev_filled, prev_total = _seats_in_window(
        coach_id=coach_id, start=week_start - timedelta(days=7), end=week_start, events=events
    )
    pct = _pct(filled, total)
    prev_pct = _pct(prev_filled, prev_total)

    trend = []
    for offset in range(SCHEDULE_DAYS - 1, -1, -1):
        day = datetime.combine(now.date() - timedelta(days=offset), datetime.min.time())
        day_filled, day_total = _seats_in_window(coach_id=coach_id, start=day, end=day + timedelta(days=1), events=events)
        trend.append(_pct(day_filled, day_total))

    active, total_players = _player_activity(coach_id=coach_id, now=now)

    return {
        "id": "week_pulse",
        "type": "week_pulse",
        "data": {
            "seatsFilled": {
                "pct": pct,
                "filled": filled,
                "total": total,
                # None rather than 0 when there is no prior week to compare, so
                # the client can omit the delta instead of claiming "+0%".
                "deltaPct": (pct - prev_pct) if prev_total else None,
                "trend": trend,
            },
            "players": {
                "active": active,
                "total": total_players,
                "idle": max(total_players - active, 0),
            },
        },
    }


def _pct(part: int, whole: int) -> int:
    return round(100 * part / whole) if whole else 0


def _seats_in_window(
    *, coach_id: int, start: datetime, end: datetime, events: Optional[Sequence[Dict[str, Any]]] = None
) -> Tuple[int, int]:
    events = _window_events(events, coach_id=coach_id, start=start, end=end)
    filled = sum(fill(e)[0] for e in events)
    total = sum(fill(e)[1] for e in events)
    return filled, total


def _player_activity(*, coach_id: int, now: datetime) -> Tuple[int, int]:
    """Active = attended recently OR signed up to something upcoming.

    Both halves matter: attendance alone marks a player idle the moment they book
    ahead but haven't played yet, and signups alone ignore regulars between terms.
    """
    player_ids = [
        pid
        for (pid,) in db.session.query(Association_CoachPlayer.player_id)
        .join(Player, Player.id == Association_CoachPlayer.player_id)
        .join(User, User.id == Player.user_id)
        .filter(Association_CoachPlayer.coach_id == coach_id)
        # PAD-268 (auth.account-deletion rule 8): a deleted account is not a
        # player here, in the count or the denominator. The roster row stays.
        .filter(User.status != "disabled")
        .all()
    ]
    if not player_ids:
        return 0, 0

    since = now - timedelta(days=ACTIVE_PLAYER_DAYS)

    attended = {
        pid
        for (pid,) in db.session.query(Presence.player_id)
        .join(LessonInstance, Presence.lesson_instance_id == LessonInstance.id)
        .filter(Presence.player_id.in_(player_ids))
        .filter(Presence.status == "present")
        .filter(LessonInstance.end_datetime >= since)
        .filter(LessonInstance.end_datetime <= now)
        .distinct()
        .all()
    }

    upcoming = {
        pid
        for (pid,) in db.session.query(Association_PlayerLessonInstance.player_id)
        .join(
            LessonInstance,
            LessonInstance.id == Association_PlayerLessonInstance.lesson_instance_id,
        )
        .filter(Association_PlayerLessonInstance.player_id.in_(player_ids))
        .filter(LessonInstance.start_datetime >= now)
        .distinct()
        .all()
    }

    return len(attended | upcoming), len(player_ids)
