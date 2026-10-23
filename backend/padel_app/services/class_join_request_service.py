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
        "note": row.note,
        # PAD-672 (rule 20): the side asked for, and — when the student has no profile side — the
        # one to offer the coach for the profile (Q6).
        "side": row.side,
        "suggestedProfileSide": _suggested_profile_side(row),
    }


def _suggested_profile_side(row: ClassJoinRequest):
    if row.side not in ("left", "right"):
        return None
    cp = Association_CoachPlayer.query.filter_by(coach_id=row.coach_id, player_id=row.player_id).first()
    return row.side if cp is not None and not cp.side else None


def pending_requests_for_instance(instance_id: int) -> list:
    """Rule 15: the coach's ``joinRequests`` — pending only, oldest first."""
    return (
        ClassJoinRequest.query
        .filter_by(lesson_instance_id=instance_id, status="pending")
        .order_by(ClassJoinRequest.created_at.asc(), ClassJoinRequest.id.asc())
        .all()
    )


def serialize_join_request_list_row(row: ClassJoinRequest) -> dict:
    """Rule 17 (PAD-460): a list row is rule 15's shape plus the class it is for. `date` and the
    times are the class's own wall clock (R-023: club-local, never converted)."""
    inst = row.lesson_instance
    start = inst.start_datetime if inst else None
    end = inst.end_datetime if inst else None
    return {
        **serialize_join_request(row),
        "kind": "academy",
        "classTitle": inst.title if inst else None,
        "date": start.date().isoformat() if start else None,
        "startTime": start.strftime("%H:%M") if start else None,
        "endTime": end.strftime("%H:%M") if end else None,
    }


def list_join_requests_for(user) -> list:
    """Rule 17 (PAD-460): the caller's join requests, newest first, every status — a coach's
    every request addressed to them, a student's own. Anyone else is refused."""
    q = ClassJoinRequest.query
    if getattr(user, "coach", None) is not None:
        q = q.filter_by(coach_id=user.coach.id)
    elif getattr(user, "player", None) is not None:
        q = q.filter_by(player_id=user.player.id)
    else:
        abort(403, "Only a coach or a student has class requests")
    rows = q.order_by(ClassJoinRequest.created_at.desc(), ClassJoinRequest.id.desc()).all()
    return [serialize_join_request_list_row(r) for r in rows]


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


SIDES = ("left", "right", "both")


def requested_side(side, cp) -> tuple:
    """PAD-672 (rule 20): ``(side to store, check it)``. A client that declares `join-side` and names
    a side gets the side round trip; anything else — every App Store build up to 33 — is taken as
    before, with the profile side recorded (coordinator, binding)."""
    from padel_app.utils.client_capabilities import JOIN_SIDE, client_declares

    if side in SIDES and client_declares(JOIN_SIDE):
        return side, True
    profile = cp.side if cp is not None and cp.side in SIDES else None
    return profile, False


def profile_side_for(instance, player_id):
    """PAD-672 (rule 20, Q1): the student's side on the coach–player link with this class's coach —
    `left`|`right`|`both`, or None."""
    coach_id = _coach_id_for(instance)
    if coach_id is None:
        return None
    cp = Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=player_id).first()
    return cp.side if cp is not None and cp.side in SIDES else None


def open_spot_sides(instance) -> list:
    """The sides of the class's open vacancies (None for a side-less one)."""
    from padel_app.models.vacancy import Vacancy

    return [v.side for v in Vacancy.query.filter_by(lesson_instance_id=instance.id, status="open")]


def side_has_spot(side, sides) -> bool:
    """Rule 20: is there a spot that ``side`` can take — one of that side, `both` or none (any spot
    for `both`)? A class with no open vacancy yet has no side to refuse on."""
    if not sides:
        return True
    if side == "both":
        return True
    return any(s in (side, "both", None) for s in sides)


def _coach_id_for(instance: LessonInstance):
    # PAD-275 rule 4: one helper answers "who coaches this occurrence".
    from padel_app.services.lesson_service import primary_coach

    coach = primary_coach(instance)
    return coach.id if coach is not None else None


def _is_enrolled(instance: LessonInstance, player_id: int) -> bool:
    return player_id in instance.enrolled_player_ids  # PAD-259


def _is_closed(instance: LessonInstance, now: datetime) -> bool:
    """Rule 14: started, cancelled or completed."""
    if instance.status in ("canceled", "completed"):
        return True
    # PAD-256 (R-023): `now` is the UTC instant; the class time is on the club's clock.
    return instance.start_datetime is not None and instance.start_datetime <= utc_to_wall_naive(now)


def _is_full(instance: LessonInstance) -> bool:
    if instance.effective_max_players is None:
        return False
    return instance.effective_filled_spots >= instance.effective_max_players


def resolve_instance(model: str, original_id, date_str, *, now=None) -> LessonInstance:
    """The instance a request attaches to — materialising a recurrence
    occurrence when needed (rule 2, the one student action that creates one)."""
    from padel_app.services.lesson_service import get_or_materialize_instance, parse_event_target

    kind, target, occ_date = parse_event_target(model, original_id, date_str)
    if kind == "lessoninstance":
        return target
    # PAD-275 rule 7: a date the series does not produce (excluded, or off the
    # rule) cannot be requested — nothing is materialised for it.
    if not target.produces(occ_date):
        abort(404, "No class on that date.")
    return get_or_materialize_instance(target, occ_date)


def _localized(coach_user, pt: str, en: str) -> str:
    lang = getattr(coach_user, "language", None) if coach_user is not None else None
    return pt if (not lang or str(lang).startswith("pt")) else en


def _class_label(instance: LessonInstance, locale: str) -> str:
    from padel_app.services.notification_service import _format_class_when

    title = instance.title or ("a aula" if locale == "pt" else "the class")
    return f"{title}{_format_class_when(instance, locale)}"


def _accepted_text(instance: LessonInstance, locale: str) -> str:
    """PAD-678 (rule 19): the student's "you are in the class" message for an accepted request. It
    leads with the outcome and never says "pedido"/"aceite", which students read as a waiting-list
    place. The pt text is the coach-approved one (2026-10-15); "inscrito/a" is literal."""
    from padel_app.services.notification_service import _format_when

    when = _format_when(getattr(instance, "start_datetime", None), locale, dated=True, weekday_first=True)
    if locale == "pt":
        where = f"em {instance.title}" if instance.title else "nesta aula"
        return f"Está marcado! Estás inscrito/a {where}{when}. Contamos contigo!"
    where = f"in {instance.title}" if instance.title else "in this class"
    return f"You're booked! You're enrolled {where}{when}. See you there!"


def _declined_text(instance: LessonInstance, locale: str) -> str:
    """PAD-678 (rule 19a): the student's message for a refused request, in the same shape as the
    accepted one: the outcome first ("Não ficaste inscrito/a"), then the class and its day. Text
    approved by the coordinator on the owner's behalf (2026-10-22); owner to confirm."""
    from padel_app.services.notification_service import _format_when

    when = _format_when(getattr(instance, "start_datetime", None), locale, dated=True, weekday_first=True)
    if locale == "pt":
        where = f"em {instance.title}" if instance.title else "nesta aula"
        return f"Não ficaste inscrito/a {where}{when}: o treinador não aceitou o pedido desta vez."
    where = f"in {instance.title}" if instance.title else "in this class"
    return f"You're not enrolled {where}{when}: the coach didn't accept the request this time."


# ---------------------------------------------------------------------------
# Student side
# ---------------------------------------------------------------------------

NOTE_MAX_LENGTH = 500


def _clean_note(note):
    """PAD-358 (classes.academy-class-booking rule 5): optional, trimmed, ≤ 500."""
    if note is None:
        return None
    if not isinstance(note, str):
        abort(400, "note must be text")
    note = note.strip()
    if len(note) > NOTE_MAX_LENGTH:
        abort(400, f"note is longer than {NOTE_MAX_LENGTH} characters")
    return note or None


def create_join_request_service(player, model, original_id, date_str, *, note=None, side=None, now=None):
    """Rules 1–3, 14 and 15: validate server-side, then create (or return the
    pending one). Returns ``(row, created)``. PAD-358: an optional ``note`` to
    the coach rides on a new request (a repeated request keeps the first)."""
    from padel_app.services.notification_service import (
        effective_eligibility,
        effective_open_spots_visible,
        passes_eligibility,
    )

    note = _clean_note(note)
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
    side, check_side = requested_side(side, cp)
    if check_side:
        sides = open_spot_sides(instance)
        if not side_has_spot(side, sides):
            _refuse("side_full", "No spot of that side is open", sides=sorted({s for s in sides if s}),
                    requestedSide=side)

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
        note=note,
        side=side,
    )
    db.session.add(row)
    db.session.commit()
    _notify_coach_of_request(row, instance)
    if config is not None and config.auto_accept_join_requests:
        row = _accept_automatically(row, instance, config, now=now)
    return row, True


def _accept_automatically(row, instance, config, *, now):
    """PAD-672 (rule 21): with the coach's automatic acceptance on, a request every coach check
    passes is accepted through the coach's own path at once; anything else waits for the coach.
    Eligibility was checked at creation (rule 3); rule 7's override is never given here."""
    from werkzeug.exceptions import HTTPException

    if config.get_invitation_mode() == "semi_automatic":
        return row
    if config.excluded_players_enabled and str(row.player_id) in {str(p) for p in (config.excluded_player_ids or [])}:
        return row
    if not side_has_spot(row.side or "both", open_spot_sides(instance)):
        return row  # no spot its side can take (rule 20): the coach decides
    from padel_app.models import Coach

    coach = Coach.query.get(row.coach_id)
    try:
        return decide_join_request_service(row.id, coach, accept=True, confirm=False, now=now)
    except HTTPException:
        # A coach check refused it under the lock (full, closed, ineligible): it waits for the coach.
        db.session.rollback()
        return ClassJoinRequest.query.get(row.id)


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
    """Decide, then tell both sides' clients (classes.class-requests rule 19, PAD-488 review):
    an accept puts the student on the class, so an open calendar or home screen on any of their
    devices refreshes. A refusal raises before anything is published."""
    row = _decide_join_request(request_id, coach, accept=accept, confirm=confirm, now=now)
    _publish_join_request_decided(row)
    return row


def _side_for_enrolment(row: ClassJoinRequest, instance) -> None:
    """PAD-672 (rule 20): the side asked for becomes the student's side in this occurrence
    (`presences.side`, PAD-551), written on the presence the enrolment just made."""
    from padel_app.models import Presence

    presence = Presence.query.filter_by(player_id=row.player_id, lesson_instance_id=instance.id).first()
    if presence is not None and presence.side != row.side:
        presence.side = row.side
        db.session.commit()


def _publish_join_request_decided(row: ClassJoinRequest) -> None:
    from padel_app.realtime import publish

    user_ids = {who.user_id for who in (row.coach, row.player) if who is not None and who.user_id is not None}
    publish({"type": "join_request_decided", "payload": {"requestId": row.id, "status": row.status}}, sorted(user_ids))


def _decide_join_request(request_id, coach, *, accept: bool, confirm: bool = False, now=None):
    """Rules 5–10, 13 and 15. Accepting IS a manual add: the bar is re-checked
    and a failure is a named warning the coach may override with ``confirm``."""
    from padel_app.services.notification_service import (
        _add_player_to_instance,
        _broadcast_spot_filled,
        _close_vacancy,
        _lock_vacancy_and_instance,
        _publish_retired,
        _deactivate_standing_entry,
        _send_system_message,
        _user_id_for_coach,
        _user_id_for_player,
        eligibility_failures_for_players,
        vacancy_for_joiner,
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
                _declined_text(instance, locale),
                msg_metadata={"joinRequest": {"id": row.id, "status": "rejected"}},
                class_instance_id=instance.id,
            )
        return row

    # PAD-499 (#527 review item 2): rule 10's lock, vacancy then class, as every accept path. The
    # spot to attribute is picked first and locked, then the class; closed and full are decided on
    # the re-read class, so a yes on another spot cannot slip in before this enrolment commits. If
    # the picked spot was closed meanwhile, the student is enrolled without one (locking another
    # vacancy after the class would break the order) and capacity still decides.
    # PAD-715 (rule 6): the spot of the student's side, not the oldest (`vacancy_for_joiner`).
    vacancy = vacancy_for_joiner(instance, row.coach_id, row.player_id, side=row.side)
    vacancy, instance = _lock_vacancy_and_instance(vacancy, instance)
    if vacancy is not None and vacancy.status != "open":
        vacancy = None

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

    # Rule 6: enrol exactly as the engine does; attribute the vacancy. The
    # vacancy is marked BEFORE the enrolment (PAD-271, invitations rule 13) so
    # enrol()'s own reconciliation finds it closed and closes nothing else.
    retired = []
    if vacancy is not None:
        # PAD-317: closed through the one routine, which also retires the
        # invitations still offering this spot. Rule 10's broadcast below then
        # tells those candidates, working from the list rather than re-querying
        # rows this has just expired.
        # PAD-715: and the class's other spots are re-counted with this student going, as after a
        # "yes" (invitations rule 2d), before PAD-679's moves.
        retired = _close_vacancy(
            vacancy, row.player_id, now=now, rebalance=(row.coach_id, row.player_id, row.side)
        )
        # Rule 13: the request IS the coach's decision — a pending approval
        # prompt for this vacancy has nothing left to guard.
        if vacancy.approval_status == "pending":
            vacancy.approval_status = "approved"
    _publish_retired(retired)  # PAD-499: queued now, sent by the enrolment's commit
    _add_player_to_instance(row.player_id, instance)
    if row.side in SIDES:  # PAD-672 slice 3: `both` too (instance-enrollment rule 13a)
        _side_for_enrolment(row, instance)
    if vacancy is not None:
        vacancy.save()

    # Rule 10: retire the invitations still out for this spot, as a "yes" would.
    if coach_user_id:
        templates = config.get_message_templates(locale) if config is not None else {}
        _broadcast_spot_filled(
            instance, -1, coach_user_id, templates,
            vacancy_id=vacancy.id if vacancy is not None else None, locale=locale,
            events=retired,
        )

    # Rule 8: consume a standing waiting-list credit, if the student holds one — from the entry
    # whose scope covers this class (PAD-547, notifications.waiting-list rule 19): the one that
    # queued them here, else a series entry for this class's series, else the coach-wide one.
    # Never an entry scoped to another series.
    from padel_app.models.waiting_list_entry import WaitingListEntry

    queued = WaitingListEntry.query.filter_by(
        lesson_instance_id=instance.id, player_id=row.player_id, is_active=True
    ).first()
    standing = (
        db.session.get(StandingWaitingListEntry, queued.standing_entry_id)
        if queued is not None and queued.standing_entry_id
        else None
    )
    if standing is None or not standing.is_active:
        candidates = StandingWaitingListEntry.query.filter_by(
            coach_id=row.coach_id, player_id=row.player_id, is_active=True
        ).order_by(StandingWaitingListEntry.id.asc()).all()
        standing = next((e for e in candidates if e.lesson_id == instance.lesson_id), None) or next(
            (e for e in candidates if e.lesson_id is None), None
        )
    if standing is not None:
        standing.credits_used += 1
        standing.save()
        # PAD-721: a NULL credit limit (PAD-560) is no limit, as the engine's own settle reads it.
        if standing.credits_total is not None and standing.credits_used >= standing.credits_total:
            _deactivate_standing_entry(standing)

    row.status = "accepted"
    row.decided_at = now
    row.decided_by_coach_id = coach.id
    db.session.commit()

    if coach_user_id and player_user_id:
        _send_system_message(
            coach_user_id, player_user_id,
            _accepted_text(instance, _localized(coach.user, "pt", "en")),
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

def move_side_requests_to_waiting_list(instance: LessonInstance, *, filled_by_player_id=None, now=None) -> list:
    """PAD-672 (rule 20, owner Q2): a pending request that named a side (`left`/`right`) whose last
    spot of that side was just filled moves to that side's waiting list — `superseded`, plus an
    active waiting-list entry with its side — and the student is told. Runs on rule 10's fill path,
    before rule 11's superseding, which then handles the rest unchanged. Returns the rows moved."""
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services.academy_class_service import _existing_entry, _publish_waiting_list_changed
    from padel_app.services.notification_service import _send_system_message, _user_id_for_player
    from padel_app.models import Coach

    now = now or utcnow_naive()
    pending = [
        r for r in pending_requests_for_instance(instance.id)
        if r.player_id != filled_by_player_id and r.side in ("left", "right")
    ]
    if not pending:
        return []
    full = _is_full(instance)
    sides = open_spot_sides(instance)
    moving = [r for r in pending if full or not side_has_spot(r.side, sides)]
    if not moving:
        return []
    coach = Coach.query.get(moving[0].coach_id)
    coach_user = coach.user if coach else None
    entries = []
    for row in moving:
        row.status = "superseded"
        row.decided_at = now
        entry = _existing_entry(instance.id, row.player_id)
        if entry is None:
            entry = WaitingListEntry(lesson_instance_id=instance.id, player_id=row.player_id,
                                     coach_id=row.coach_id, added_by="student")
            db.session.add(entry)
        entry.is_active = True
        entry.standing_entry_id = None
        entry.side = row.side
        entries.append(entry)
    db.session.commit()
    for row, entry in zip(moving, entries):
        player_user_id = _user_id_for_player(row.player_id)
        if coach_user is not None and player_user_id:
            pt_side = "esquerda" if row.side == "left" else "direita"
            _send_system_message(
                coach_user.id, player_user_id,
                _localized(
                    coach_user,
                    f"A vaga da {pt_side} em {_class_label(instance, 'pt')} foi ocupada. Ficaste em lista de "
                    f"espera da {pt_side}: avisamos-te se abrir uma vaga.",
                    f"The {row.side} spot in {_class_label(instance, 'en')} was taken. You're on the {row.side} "
                    f"waiting list: we'll let you know if a spot opens.",
                ),
                msg_metadata={"joinRequest": {"id": row.id, "status": "superseded"}},
                class_instance_id=instance.id,
            )
        _publish_waiting_list_changed(entry)
    return moving


def supersede_pending_requests(instance: LessonInstance, *, filled_by_player_id=None, now=None) -> list:
    """When ``instance`` is full, close every other pending request as
    ``superseded``; reply to each requester if the coach auto-notifies; alert
    the coach either way. Returns the rows closed."""
    from padel_app.services.notification_service import (
        _get_or_create_direct_conversation,
        _send_system_message,
        _user_id_for_coach,
        _format_template,
        _user_id_for_player,
        publish,
        resolve_message_template,
        template_variables,
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
    spot_taken_template = resolve_message_template(templates, "spot_filled", locale)
    label = _class_label(instance, locale)

    from padel_app.services.player_service import coach_display_name

    names = []
    for row in pending:
        row.status = "superseded"
        row.decided_at = now
        db.session.add(row)
        player_user_id = _user_id_for_player(row.player_id)
        player_name = row.player.user.name if row.player and row.player.user else ""
        # PAD-683 (rule 9c): the push below goes to the coach alone — its names are the coach's
        # display names; the alert Message stored in the student's thread keeps the real name.
        names.append(coach_display_name(coach_user_id, row.player_id, player_name))
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
            # PAD-670 (message-templates rule 3a): the template is about this student and this class.
            spot_taken = _format_template(
                spot_taken_template, **template_variables(row.player, instance, locale)
            )
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
    if row.note:
        # PAD-358: the student's note travels with the request, quoted on its own line.
        text = f"{text}\n\u201c{row.note}\u201d"
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
    # PAD-683 (rule 9c): the push goes to the coach alone — display name; the stored Message
    # (the student's own thread) keeps the real name.
    from padel_app.services.player_service import coach_facing_text

    push_body = coach_facing_text(text, coach_user_id, row.player_id, player_name)[:100]
    send_push_notification(user_id=coach_user_id, title=title, body=push_body, url=f"/messages/{conv.id}?message={msg.id}")
    send_expo_push_to_user(
        coach_user_id, title=title, body=push_body,
        # PAD-324 (messaging.push-notifications rule 7): there IS a message
        # behind this, so the tap opens the thread — the same place the web
        # push points. `{"type": "class"}` is reserved for pushes with no
        # message, and on iOS it routes to /class/<id>, which rebuilds its
        # event from (model, originalId, date) route params a push cannot
        # carry: the screen says "could not find this class" before it ever
        # asks the server. The instance id stays as context, never the target.
        data={
            "type": "message",
            "conversationId": conv.id,
            "messageId": msg.id,
            "classInstanceId": instance.id,
        },
    )


# ---------------------------------------------------------------------------
# Read access (PAD-131 × PAD-257, classes.join-requests rule 16)
# ---------------------------------------------------------------------------

def student_may_view_open_spot(player, instance, *, now=None, allow_full=False) -> bool:
    """Rule 16: may this non-enrolled student read this class instance?

    ``classes.detail-visibility`` rule 5 (PAD-257) limits class reads to the
    class's own people. A student discovering an open spot is not one of them
    yet, so this is the one exception, and it asks exactly what
    ``create_join_request_service`` asks before it lets a student request: on
    the owning coach's roster, and either already holding a request for this
    instance, or the instance is open (not started, cancelled, completed or
    full), advertised (``effective_open_spots_visible``) and the student passes
    its eligibility bar. Pure: no aborts, no writes.

    PAD-664: ``allow_full`` (a client declaring ``full-classes``) drops the
    "not full" condition, so a student can open a full class from their
    calendar and join its waiting list; every other condition stands.
    """
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
    if _is_closed(instance, now or utcnow_naive()):
        return False
    return _advertised_to(cp, instance, coach_id, full=_is_full(instance), allow_full=allow_full)


def _advertised_to(cp, subject, coach_id, *, full, allow_full) -> bool:
    """Rule 16's shared tail, for an instance or a never-materialised occurrence (B-529): room
    (unless ``allow_full``), the coach's open-spot switch, and the student's eligibility."""
    from padel_app.services.notification_service import (
        effective_eligibility,
        effective_open_spots_visible,
        passes_eligibility,
    )

    if full and not allow_full:
        return False
    config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
    if not effective_open_spots_visible(subject, coach_id, config):
        return False
    return bool(passes_eligibility(cp, subject, coach_id, effective_eligibility(subject, coach_id, config)))


def student_may_view_open_occurrence(player, lesson, occ_date, *, now=None, allow_full=False) -> bool:
    """B-529 (rule 16): the same question for an occurrence that was never materialised.

    The calendar advertises such occurrences (``eligibility.open-spot-visibility`` rule 4) as a
    Lesson plus a date, so the class read arrives as a series read. It is answered on that one
    occurrence, with the calendar's own measures (``load_open_spot_events_for_player``): the series
    produces the date, the occurrence has not started, the class is active, visible, has room (or
    ``allow_full``) and the student is eligible. Pure: nothing is materialised (rule 5).
    """
    from padel_app.models import Association_CoachLesson

    if player is None or lesson is None or occ_date is None or lesson.start_datetime is None:
        return False
    if getattr(lesson, "status", None) != "active" or not lesson.produces(occ_date):
        return False
    # The series' own coach rows, first assigned first (`coaches_for`'s order). Not
    # `primary_coach(lesson)`: it reads an id as an instance id, and a lesson id is not one.
    first = (
        Association_CoachLesson.query.filter_by(lesson_id=lesson.id).order_by(Association_CoachLesson.id.asc()).first()
    )
    coach = first.coach if first is not None else None
    if coach is None:
        return False
    cp = Association_CoachPlayer.query.filter_by(coach_id=coach.id, player_id=player.id).first()
    if cp is None:
        return False
    # PAD-256 (R-023): the occurrence is on the club's clock, `now` is a UTC instant.
    occ_start = datetime.combine(occ_date, lesson.start_datetime.time())
    if occ_start <= utc_to_wall_naive(now or utcnow_naive()):
        return False
    if lesson.effective_max_players is None:
        return False
    # The calendar's own measure for an occurrence with no row (open-spot-visibility rule 4).
    full = len(lesson.players_relations) >= lesson.effective_max_players
    return _advertised_to(cp, lesson, coach.id, full=full, allow_full=allow_full)
