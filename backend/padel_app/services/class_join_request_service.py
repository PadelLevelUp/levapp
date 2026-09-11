"""classes.join-requests (PAD-131): a student asks to attend an open spot, the
coach accepts or rejects, first fill wins.

Everything a request touches already exists: enrolment goes through the
invitation engine's ``_add_player_to_instance``; eligibility through the
single resolver (``effective_eligibility`` / ``eligibility_failures``);
visibility through ``effective_open_spots_visible`` (PAD-130); messages
through the coach ↔ student direct conversation. This module only sequences
them (rule 15 of the spec is the wire contract).
"""
from datetime import datetime

from flask import abort, jsonify, make_response

from padel_app.models import (
    Association_CoachPlayer,
    ClassJoinRequest,
    Lesson,
    LessonInstance,
    NotificationConfig,
    Vacancy,
    StandingWaitingListEntry,
)
from padel_app.sql_db import db
from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------

def serialize_join_request(row: ClassJoinRequest) -> dict:
    player_name = row.player.user.name if row.player and row.player.user else ""
    return {
        "id": row.id,
        "lessonInstanceId": str(row.lesson_instance_id),
        "playerId": str(row.player_id),
        "playerName": player_name,
        "coachId": str(row.coach_id),
        "status": row.status,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
        "decidedAt": row.decided_at.isoformat() if row.decided_at else None,
    }


def pending_requests_for_instance(instance_id: int) -> list:
    """Rule 15: the coach's ``joinRequests`` — pending only, oldest first."""
    return (
        ClassJoinRequest.query
        .filter_by(lesson_instance_id=instance_id, status="pending")
        .order_by(ClassJoinRequest.created_at.asc(), ClassJoinRequest.id.asc())
        .all()
    )


def latest_request_for_player(instance_id: int, player_id: int):
    """Rule 15: the student's ``myJoinRequest`` — their latest for this class."""
    return (
        ClassJoinRequest.query
        .filter_by(lesson_instance_id=instance_id, player_id=player_id)
        .order_by(ClassJoinRequest.id.desc())
        .first()
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _refuse(code: str, message: str, **extra):
    """A `409` the clients can branch on: ``{code, message, ...}``."""
    body = {"code": code, "message": message, **extra}
    abort(make_response(jsonify(body), 409))


def _coach_id_for(instance: LessonInstance):
    if instance.coaches_relations:
        return instance.coaches_relations[0].coach_id
    lesson = instance.lesson
    if lesson is not None and lesson.coaches_relations:
        return lesson.coaches_relations[0].coach_id
    return None


def _is_enrolled(instance: LessonInstance, player_id: int) -> bool:
    return player_id in instance.enrolled_player_ids  # PAD-259


def _is_closed(instance: LessonInstance, now: datetime) -> bool:
    """Rule 14: started, cancelled or completed."""
    if instance.status in ("canceled", "completed"):
        return True
    # PAD-256 (R-023): `now` is the UTC instant; the class time is on the club's clock.
    return instance.start_datetime is not None and instance.start_datetime <= utc_to_wall_naive(now)


def _is_full(instance: LessonInstance) -> bool:
    if instance.max_players is None:
        return False
    return instance.effective_filled_spots >= instance.max_players


def resolve_instance(model: str, original_id, date_str, *, now=None) -> LessonInstance:
    """The instance a request attaches to — materialising a recurrence
    occurrence when needed (rule 2, the one student action that creates one)."""
    from padel_app.services.lesson_service import get_or_materialize_instance, parse_event_target

    kind, target, occ_date = parse_event_target(model, original_id, date_str)
    if kind == "lessoninstance":
        return target
    return get_or_materialize_instance(target, occ_date)


def _localized(coach_user, pt: str, en: str) -> str:
    lang = getattr(coach_user, "language", None) if coach_user is not None else None
    return pt if (not lang or str(lang).startswith("pt")) else en


def _class_label(instance: LessonInstance, locale: str) -> str:
    from padel_app.services.notification_service import _format_class_when

    title = instance.title or ("a aula" if locale == "pt" else "the class")
    return f"{title}{_format_class_when(instance, locale)}"


# ---------------------------------------------------------------------------
# Student side
# ---------------------------------------------------------------------------

def create_join_request_service(player, model, original_id, date_str, *, now=None):
    """Rules 1–3, 14 and 15: validate server-side, then create (or return the
    pending one). Returns ``(row, created)``."""
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
        _refuse("class_closed", "This class is no longer open to requests")

    cp = Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=player.id).first()
    config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
    if cp is None or not effective_open_spots_visible(instance, coach_id, config):
        _refuse("not_visible", "This class is not open to requests")
    if _is_full(instance):
        _refuse("spot_filled", "This class is already full")
    if not passes_eligibility(cp, instance, coach_id, effective_eligibility(instance, coach_id, config)):
        _refuse("ineligible", "You do not meet this class's eligibility bar")

    existing = (
        ClassJoinRequest.query
        .filter_by(lesson_instance_id=instance.id, player_id=player.id, status="pending")
        .first()
    )
    if existing is not None:
        return existing, False

    row = ClassJoinRequest(
        lesson_instance_id=instance.id,
        player_id=player.id,
        coach_id=coach_id,
        status="pending",
        created_at=now,
    )
    db.session.add(row)
    db.session.commit()
    _notify_coach_of_request(row, instance)
    return row, True


def withdraw_join_request_service(request_id, player, *, now=None):
    """Rule 4: the requesting student takes it back, silently."""
    row = ClassJoinRequest.query.get_or_404(request_id)
    if player is None or row.player_id != player.id:
        abort(403, "Not your request")
    if row.status != "pending":
        _refuse("not_pending", "This request is no longer pending")
    row.status = "withdrawn"
    row.decided_at = now or utcnow_naive()
    db.session.commit()
    return row


# ---------------------------------------------------------------------------
# Coach side
# ---------------------------------------------------------------------------

def _require_owner(row: ClassJoinRequest, coach):
    if coach is None or row.coach_id != coach.id:
        abort(403, "Not your class")


def decide_join_request_service(request_id, coach, *, accept: bool, confirm: bool = False, now=None):
    """Rules 5–10, 13 and 15. Accepting IS a manual add: the bar is re-checked
    and a failure is a named warning the coach may override with ``confirm``."""
    from padel_app.services.notification_service import (
        _add_player_to_instance,
        _broadcast_spot_filled,
        _deactivate_standing_entry,
        _send_system_message,
        _user_id_for_coach,
        _user_id_for_player,
        eligibility_failures_for_players,
    )

    now = now or utcnow_naive()
    row = ClassJoinRequest.query.get_or_404(request_id)
    _require_owner(row, coach)
    if row.status != "pending":
        _refuse("not_pending", "This request is no longer pending")

    instance = row.lesson_instance
    coach_user_id = _user_id_for_coach(row.coach_id)
    player_user_id = _user_id_for_player(row.player_id)
    locale = _localized(coach.user, "pt", "en")

    if not accept:
        row.status = "rejected"
        row.decided_at = now
        row.decided_by_coach_id = coach.id
        db.session.commit()
        if coach_user_id and player_user_id:
            _send_system_message(
                coach_user_id, player_user_id,
                _localized(
                    coach.user,
                    f"O teu pedido para entrar em {_class_label(instance, 'pt')} não foi aceite.",
                    f"Your request to join {_class_label(instance, 'en')} was not accepted.",
                ),
                msg_metadata={"joinRequest": {"id": row.id, "status": "rejected"}},
                class_instance_id=instance.id,
            )
        return row

    # Rule 14 / rule 10: a class that closed or filled meanwhile cannot be joined.
    if _is_closed(instance, now):
        row.status = "superseded"
        row.decided_at = now
        db.session.commit()
        _refuse("class_closed", "This class is no longer open", request=serialize_join_request(row))
    if _is_full(instance):
        row.status = "superseded"
        row.decided_at = now
        db.session.commit()
        _refuse("spot_filled", "This class is already full", request=serialize_join_request(row))

    # Rule 7: accepting is a manual add — warn with named reasons, never block.
    config = NotificationConfig.query.filter_by(coach_id=row.coach_id).first()
    if not confirm:
        failing = eligibility_failures_for_players(instance, row.coach_id, [row.player_id], config)
        if failing:
            _refuse(
                "ineligible",
                "This student no longer meets the bar",
                ineligible=failing,
                request=serialize_join_request(row),
            )

    # Rule 6: enrol exactly as the engine does; attribute the vacancy.
    _add_player_to_instance(row.player_id, instance)
    vacancy = (
        Vacancy.query
        .filter_by(lesson_instance_id=instance.id, status="open")
        .order_by(Vacancy.id.asc())
        .first()
    )
    if vacancy is not None:
        vacancy.status = "filled"
        vacancy.filled_by_player_id = row.player_id
        vacancy.filled_at = now
        # Rule 13: the request IS the coach's decision — a pending approval
        # prompt for this vacancy has nothing left to guard.
        if vacancy.approval_status == "pending":
            vacancy.approval_status = "approved"
        vacancy.save()

    # Rule 10: retire the invitations still out for this spot, as a "yes" would.
    if coach_user_id:
        templates = config.get_message_templates(locale) if config is not None else {}
        _broadcast_spot_filled(
            instance, -1, coach_user_id, templates,
            vacancy_id=vacancy.id if vacancy is not None else None, locale=locale,
        )

    # Rule 8: consume a standing waiting-list credit, if the student holds one.
    standing = (
        StandingWaitingListEntry.query
        .filter_by(coach_id=row.coach_id, player_id=row.player_id, is_active=True)
        .order_by(StandingWaitingListEntry.id.asc())
        .first()
    )
    if standing is not None:
        standing.credits_used += 1
        standing.save()
        if standing.credits_used >= standing.credits_total:
            _deactivate_standing_entry(standing)

    row.status = "accepted"
    row.decided_at = now
    row.decided_by_coach_id = coach.id
    db.session.commit()

    if coach_user_id and player_user_id:
        _send_system_message(
            coach_user_id, player_user_id,
            _localized(
                coach.user,
                f"Estás dentro: o teu pedido para {_class_label(instance, 'pt')} foi aceite.",
                f"You're in: your request for {_class_label(instance, 'en')} was accepted.",
            ),
            msg_metadata={"joinRequest": {"id": row.id, "status": "accepted"}},
            class_instance_id=instance.id,
        )
    # Rule 10: the fill closes every other pending request (hook in
    # _add_player_to_instance ran before `row` was accepted, so it skipped
    # this player's own row and closed the rest).
    return row


# ---------------------------------------------------------------------------
# First fill wins (rules 10–12) — called from _add_player_to_instance
# ---------------------------------------------------------------------------

def supersede_pending_requests(instance: LessonInstance, *, filled_by_player_id=None, now=None) -> list:
    """When ``instance`` is full, close every other pending request as
    ``superseded``; reply to each requester if the coach auto-notifies; alert
    the coach either way. Returns the rows closed."""
    from padel_app.services.notification_service import (
        _get_or_create_direct_conversation,
        _send_system_message,
        _user_id_for_coach,
        _user_id_for_player,
        publish,
        resolve_message_template,
    )
    from padel_app.models import Coach, Message
    from padel_app.serializers.message import serialize_message
    from padel_app.services.conversation_access import message_recipient_ids
    from padel_app.utils.push_notifications import send_push_notification

    if not _is_full(instance):
        return []
    now = now or utcnow_naive()
    pending = [
        r for r in pending_requests_for_instance(instance.id)
        if r.player_id != filled_by_player_id
    ]
    if not pending:
        return []

    coach_id = pending[0].coach_id
    coach = Coach.query.get(coach_id)
    coach_user = coach.user if coach else None
    coach_user_id = coach_user.id if coach_user else None
    config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
    auto_reply = bool(config.auto_notify_enabled) if config is not None else False
    locale = _localized(coach_user, "pt", "en")
    templates = config.get_message_templates(locale) if config is not None else {}
    spot_taken = resolve_message_template(templates, "spot_filled", locale)
    label = _class_label(instance, locale)

    names = []
    for row in pending:
        row.status = "superseded"
        row.decided_at = now
        db.session.add(row)
        player_user_id = _user_id_for_player(row.player_id)
        player_name = row.player.user.name if row.player and row.player.user else ""
        names.append(player_name)
        if not coach_user_id or not player_user_id:
            continue
        # Rule 12: the coach's alert, inside this requester's own conversation
        # (a conversation never names a third student).
        conv = _get_or_create_direct_conversation(coach_user_id, player_user_id)
        alert = Message(
            text=_localized(
                coach_user,
                f"{label} ficou cheia — o pedido de {player_name} para entrar foi encerrado.",
                f"{label} is now full — {player_name}'s request to join was closed.",
            ),
            sender_id=player_user_id,
            conversation_id=conv.id,
            message_type="text",
            msg_metadata={
                "joinRequest": {"id": row.id, "status": "superseded"},
                "lessonInstanceId": instance.id,
            },
        )
        alert.create()
        publish(
            {"type": "message_created", "payload": serialize_message(alert, None)},
            message_recipient_ids(alert),
        )
        # Rule 11: the automatic reply to the student only when the coach wants it.
        if auto_reply:
            _send_system_message(
                coach_user_id, player_user_id, spot_taken,
                msg_metadata={"joinRequest": {"id": row.id, "status": "superseded"}},
                class_instance_id=instance.id,
            )
    db.session.commit()

    if coach_user_id:
        title = _localized(coach_user, "Aula cheia", "Class full")
        body = _localized(
            coach_user,
            f"{label}: {len(names)} pedido(s) encerrado(s) — {', '.join(n for n in names if n)}",
            f"{label}: {len(names)} request(s) closed — {', '.join(n for n in names if n)}",
        )
        send_push_notification(user_id=coach_user_id, title=title, body=body[:100],
                               url=f"/calendar?classInstanceId={instance.id}")
        publish(
            {
                "type": "join_requests_superseded",
                "payload": {"lessonInstanceId": instance.id, "requestIds": [r.id for r in pending]},
            },
            [coach_user_id],
        )
    return pending


# ---------------------------------------------------------------------------
# Coach notification on request (rule 5)
# ---------------------------------------------------------------------------

def _notify_coach_of_request(row: ClassJoinRequest, instance: LessonInstance) -> None:
    from padel_app.models import Coach, Message
    from padel_app.serializers.message import serialize_message
    from padel_app.services.conversation_access import message_recipient_ids
    from padel_app.services.notification_service import (
        _get_or_create_direct_conversation,
        _user_id_for_player,
        publish,
    )
    from padel_app.utils.expo_push import send_expo_push_to_user
    from padel_app.utils.push_notifications import send_push_notification

    coach = Coach.query.get(row.coach_id)
    coach_user = coach.user if coach else None
    coach_user_id = coach_user.id if coach_user else None
    player_user_id = _user_id_for_player(row.player_id)
    if not coach_user_id or not player_user_id:
        return
    player_name = row.player.user.name if row.player and row.player.user else ""
    locale = _localized(coach_user, "pt", "en")
    text = _localized(
        coach_user,
        f"{player_name} pediu para entrar em {_class_label(instance, 'pt')}.",
        f"{player_name} asked to join {_class_label(instance, 'en')}.",
    )
    conv = _get_or_create_direct_conversation(coach_user_id, player_user_id)
    msg = Message(
        text=text,
        sender_id=player_user_id,
        conversation_id=conv.id,
        message_type="text",
        msg_metadata={
            "joinRequest": {"id": row.id, "status": "pending"},
            "lessonInstanceId": instance.id,
        },
    )
    msg.create()
    publish(
        {"type": "message_created", "payload": serialize_message(msg, None)},
        message_recipient_ids(msg),
    )
    publish(
        {
            "type": "join_request_created",
            "payload": {"lessonInstanceId": instance.id, "requestId": row.id},
        },
        [coach_user_id],
    )
    title = "Pedido para entrar" if locale == "pt" else "Request to join"
    send_push_notification(user_id=coach_user_id, title=title, body=text[:100], url=f"/messages/{conv.id}")
    send_expo_push_to_user(
        coach_user_id, title=title, body=text[:100],
        data={"type": "class", "classInstanceId": instance.id},
    )


# ---------------------------------------------------------------------------
# Read access (PAD-131 × PAD-257, classes.join-requests rule 16)
# ---------------------------------------------------------------------------

def student_may_view_open_spot(player, instance, *, now=None) -> bool:
    """Rule 16: may this non-enrolled student read this class instance?

    ``classes.detail-visibility`` rule 5 (PAD-257) limits class reads to the
    class's own people. A student discovering an open spot is not one of them
    yet, so this is the one exception, and it asks exactly what
    ``create_join_request_service`` asks before it lets a student request: on
    the owning coach's roster, and either already holding a request for this
    instance, or the instance is open (not started, cancelled, completed or
    full), advertised (``effective_open_spots_visible``) and the student passes
    its eligibility bar. Pure: no aborts, no writes.
    """
    from padel_app.services.notification_service import (
        effective_eligibility,
        effective_open_spots_visible,
        passes_eligibility,
    )

    if player is None or instance is None:
        return False
    coach_id = _coach_id_for(instance)
    if coach_id is None:
        return False
    cp = Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=player.id).first()
    if cp is None:
        return False
    if ClassJoinRequest.query.filter_by(
        lesson_instance_id=instance.id, player_id=player.id
    ).first() is not None:
        return True
    if _is_closed(instance, now or utcnow_naive()) or _is_full(instance):
        return False
    config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
    if not effective_open_spots_visible(instance, coach_id, config):
        return False
    return bool(passes_eligibility(cp, instance, coach_id, effective_eligibility(instance, coach_id, config)))
