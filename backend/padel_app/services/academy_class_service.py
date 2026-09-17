"""classes.academy-class-booking (PAD-358): from the "Marcar Aula" wizard, a
student sees one coach's next fourteen days of classes they may join, requests
an open one (``classes.join-requests``) or puts themselves on a full one's
waiting list (``notifications.waiting-list`` rule 14).

Nothing here decides who may see what: discovery is the calendar's own
open-spot loader (``load_open_spot_events_for_player``) narrowed to one coach
and widened to full classes, and every write re-checks the same conditions the
join request checks. This module sequences them.
"""
from datetime import datetime, timedelta

from flask import abort
from sqlalchemy.exc import IntegrityError

from padel_app.models import (
    Association_CoachPlayer,
    ClassJoinRequest,
    NotificationConfig,
    WaitingListEntry,
)
from padel_app.sql_db import db
from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive

WINDOW_DAYS = 14


def _require_roster(player, coach_id):
    """Rule 2: the whole read is refused for a coach the student is not with."""
    try:
        coach_id = int(coach_id)
    except (TypeError, ValueError):
        abort(400, "coachId is required")
    cp = Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=player.id).first()
    if cp is None:
        abort(403, "You are not a student of this coach")
    return cp


def _instance_id_of(event):
    return int(event["originalId"]) if event.get("model") == "LessonInstance" else None


def list_academy_classes(player, coach_id, *, now=None) -> dict:
    """Rules 1–4 and 7: the coach's classes for fourteen club-local days that the
    student may join, each with its state and what the student already did.
    Reads only — nothing is materialised."""
    from padel_app.helpers.calendar_helpers import load_open_spot_events_for_player

    cp = _require_roster(player, coach_id)
    now = now or utcnow_naive()
    today = utc_to_wall_naive(now).date()
    # R-023: class times are Lisbon wall-clock, so the window's bounds are too.
    start = datetime(today.year, today.month, today.day)
    end = start + timedelta(days=WINDOW_DAYS)

    events = load_open_spot_events_for_player(
        player.id, start, end, now=now, coach_id=cp.coach_id, include_full=True
    )
    instance_ids = [i for i in (_instance_id_of(e) for e in events) if i is not None]
    latest = {}
    waiting = set()
    if instance_ids:
        for row in (
            ClassJoinRequest.query
            .filter(ClassJoinRequest.lesson_instance_id.in_(instance_ids),
                    ClassJoinRequest.player_id == player.id)
            .order_by(ClassJoinRequest.id.asc())
            .all()
        ):
            latest[row.lesson_instance_id] = {"id": row.id, "status": row.status}
        waiting = {
            e.lesson_instance_id
            for e in WaitingListEntry.query.filter(
                WaitingListEntry.lesson_instance_id.in_(instance_ids),
                WaitingListEntry.player_id == player.id,
                WaitingListEntry.is_active.is_(True),
            ).all()
        }

    classes = []
    for event in events:
        instance_id = _instance_id_of(event)
        event["myJoinRequest"] = latest.get(instance_id)
        event["onWaitingList"] = instance_id in waiting
        classes.append(event)
    classes.sort(key=lambda e: (e.get("date") or "", e.get("startTime") or ""))
    # Rule 2: an empty step says why — the coach does not advertise open spots.
    config = NotificationConfig.query.filter_by(coach_id=cp.coach_id).first()
    return {
        "from": today.isoformat(),
        "to": (today + timedelta(days=WINDOW_DAYS)).isoformat(),
        "openSpotsVisible": bool(config and config.open_spots_visible),
        "classes": classes,
    }


def join_class_waiting_list_service(player, model, original_id, date_str, *, now=None):
    """Rule 6: the student's own place on a full class's waiting list. Returns
    ``(entry, created)`` — ``created`` is False when they were already on it."""
    from padel_app.services.class_join_request_service import (
        _coach_id_for,
        _is_closed,
        _is_enrolled,
        _is_full,
        _refuse,
        resolve_instance,
    )
    from padel_app.services.notification_service import (
        effective_eligibility,
        effective_open_spots_visible,
        passes_eligibility,
    )

    now = now or utcnow_naive()
    instance = resolve_instance(model, original_id, date_str, now=now)
    coach_id = _coach_id_for(instance)
    if coach_id is None:
        _refuse("not_visible", "This class has no coach")
    if _is_enrolled(instance, player.id):
        _refuse("already_enrolled", "You are already in this class")
    if _is_closed(instance, now):
        _refuse("class_closed", "This class is no longer open")

    cp = Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=player.id).first()
    config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
    if cp is None or not effective_open_spots_visible(instance, coach_id, config):
        _refuse("not_visible", "This class is not open to requests")
    if not _is_full(instance):
        _refuse("has_spots", "This class has room: ask to join it instead")
    if not passes_eligibility(cp, instance, coach_id, effective_eligibility(instance, coach_id, config)):
        _refuse("ineligible", "You do not meet this class's eligibility bar")

    entry = _existing_entry(instance.id, player.id)
    if entry is not None and entry.is_active:
        return entry, False
    if entry is None:
        entry = WaitingListEntry(lesson_instance_id=instance.id, player_id=player.id, coach_id=coach_id)
        db.session.add(entry)
    else:
        # Reactivated by the student: it is theirs now, never a standing fan-out row.
        entry.is_active = True
        entry.standing_entry_id = None
    try:
        db.session.commit()
    except IntegrityError:
        # Cross-review F5: a parallel join by the same student (a double tap) committed
        # the unique (instance, player) row first. Theirs is the place: answer it as
        # "already on the list", never a 500.
        db.session.rollback()
        entry = _existing_entry(instance.id, player.id)
        if entry is None or not entry.is_active:
            raise
        return entry, False
    _tell_coach_of_waiting_list_join(player, instance, coach_id)
    return entry, True


def _existing_entry(instance_id, player_id):
    """The (instance, player) row, active or not — a seam the race test replaces."""
    return WaitingListEntry.query.filter_by(lesson_instance_id=instance_id, player_id=player_id).first()


def leave_class_waiting_list_service(player, lesson_instance_id):
    """Rule 7 / waiting-list rule 14: the student's active place on this class's
    list, whatever put it there, is removed. A place the coach's standing list
    fanned out is theirs to leave for this class too (cross-review F3: the list
    reports every active place, so leave must accept every one); the standing
    entry itself and its other classes are untouched."""
    entry = WaitingListEntry.query.filter_by(
        lesson_instance_id=lesson_instance_id,
        player_id=player.id,
        is_active=True,
    ).first()
    if entry is None:
        abort(404, "You are not on this class's waiting list")
    entry.is_active = False
    db.session.commit()
    return entry


def _tell_coach_of_waiting_list_join(player, instance, coach_id) -> None:
    """The coach hears about it in the coach <-> student conversation, the channel
    join requests use (rule 6)."""
    from padel_app.models import Coach, Message
    from padel_app.serializers.message import serialize_message
    from padel_app.services.class_join_request_service import _class_label, _localized
    from padel_app.services.conversation_access import message_recipient_ids
    from padel_app.services.notification_service import _get_or_create_direct_conversation, publish

    coach = db.session.get(Coach, coach_id)
    coach_user = coach.user if coach else None
    player_user = player.user
    if coach_user is None or player_user is None:
        return
    text = _localized(
        coach_user,
        f"{player_user.name} entrou na lista de espera de {_class_label(instance, 'pt')}.",
        f"{player_user.name} joined the waiting list for {_class_label(instance, 'en')}.",
    )
    conv = _get_or_create_direct_conversation(coach_user.id, player_user.id)
    msg = Message(
        text=text,
        sender_id=player_user.id,
        conversation_id=conv.id,
        message_type="text",
        msg_metadata={"waitingListJoin": {"lessonInstanceId": instance.id}, "lessonInstanceId": instance.id},
    )
    msg.create()
    publish({"type": "message_created", "payload": serialize_message(msg, None)}, message_recipient_ids(msg))
    publish(
        {"type": "waiting_list_joined", "payload": {"lessonInstanceId": instance.id, "playerId": player.id}},
        [coach_user.id],
    )
    # F2 (cross-review): told the way a join request tells the coach — web push and
    # iOS push, opening the thread (PAD-324: a message exists, so the tap opens it).
    from padel_app.utils.expo_push import send_expo_push_to_user
    from padel_app.utils.push_notifications import send_push_notification

    locale = _localized(coach_user, "pt", "en")
    title = "Lista de espera" if locale == "pt" else "Waiting list"
    send_push_notification(user_id=coach_user.id, title=title, body=text[:100], url=f"/messages/{conv.id}")
    send_expo_push_to_user(
        coach_user.id, title=title, body=text[:100],
        data={"type": "message", "conversationId": conv.id, "classInstanceId": instance.id},
    )
