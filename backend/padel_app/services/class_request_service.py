"""classes.class-requests (PAD-104): a student books a class in the coach's
free time; the coach accepts, declines or proposes another time.

Free time is inferred from the coach's calendar (rule 1); the requested slot
is held by a plain CalendarBlock while the request is open (rule 3); accept
creates a one-off private class through the same path as "Add class"
(rule 4); every transition is mirrored into the coach ↔ student direct
conversation (rule 6).
"""
from datetime import datetime, timedelta

from flask import abort, jsonify, make_response

from padel_app.models import Association_CoachPlayer, CalendarBlock, ClassRequest, Coach, Player
from padel_app.sql_db import db
from padel_app.utils.dates import club_now_naive, wall_to_utc_naive

# ── Timezone convention (PAD-256, option B; R-023) ──────────────────────────
# A slot is the Lisbon wall-clock the user typed ("2026-09-22", "11:00"),
# stored naive and serialised back unchanged, exactly like a class time. The
# module's one clock, `_now_wall_clock`, is the club's clock, so "has it
# started" and today's free blocks read Lisbon now. A service function's `now`
# is therefore a wall-clock value; `decided_at` is an event timestamp and is
# written in UTC (`wall_to_utc_naive`). Free blocks are computed in the
# calendar's own "HH:MM" strings, so a request never disagrees with the
# calendar it was booked from.


def _now_wall_clock() -> datetime:
    """'Now' on the club's wall clock, the clock slots are stored in (see above)."""
    return club_now_naive()


DAY_START = 8 * 60      # 08:00
DAY_END = 22 * 60       # 22:00
MIN_FREE = 60           # a free block shorter than this is not offered
MIN_LEN, MAX_LEN = 30, 180
HOLD_COLOR = "#94A3B8"


# ── serialisation ────────────────────────────────────────────────────────────

def _name(user) -> str:
    return user.name if user is not None else ""


def serialize_class_request(row: ClassRequest) -> dict:
    return {
        "id": row.id,
        "playerId": str(row.player_id),
        "playerName": _name(row.player.user if row.player else None),
        "coachId": str(row.coach_id),
        "coachName": _name(row.coach.user if row.coach else None),
        "date": row.start_datetime.date().isoformat(),
        "startTime": row.start_datetime.strftime("%H:%M"),
        "endTime": row.end_datetime.strftime("%H:%M"),
        "note": row.note,
        "status": row.status,
        "decidedBy": row.decided_by,
        "decidedAt": row.decided_at.isoformat() if row.decided_at else None,
        "lessonId": str(row.lesson_id) if row.lesson_id else None,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
    }


def _refuse(code: str, message: str, **extra):
    abort(make_response(jsonify({"code": code, "message": message, **extra}), 409))


# ── time helpers (the calendar's local wall-clock strings) ───────────────────

def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _parse_slot(date_str, start_str, end_str):
    try:
        start = datetime.strptime(f"{date_str} {start_str}", "%Y-%m-%d %H:%M")
        end = datetime.strptime(f"{date_str} {end_str}", "%Y-%m-%d %H:%M")
    except (TypeError, ValueError):
        abort(400, "date must be YYYY-MM-DD and times HH:MM")
    if end <= start:
        abort(400, "endTime must be after startTime")
    return start, end


# ── rule 2: whom a student may ask ───────────────────────────────────────────

def coaches_for_player(player_id: int) -> list:
    rows = Association_CoachPlayer.query.filter_by(player_id=player_id).all()
    out = []
    for cp in rows:
        if cp.coach is None:
            continue
        out.append({"id": str(cp.coach.id), "name": _name(cp.coach.user)})
    return out


def _require_roster(player_id: int, coach_id: int):
    cp = Association_CoachPlayer.query.filter_by(player_id=player_id, coach_id=coach_id).first()
    if cp is None:
        abort(403, "Not one of your coaches")
    return cp


# ── rule 1: free blocks ──────────────────────────────────────────────────────

def _busy_by_day(coach: Coach, range_start: datetime, range_end: datetime, *, exclude_request_id=None) -> dict:
    """``{date -> [(start_min, end_min)]}`` of everything on the coach's calendar
    in the range — classes, calendar blocks (which include the holds of other
    open requests, rule 3)."""
    from padel_app.helpers.calendar_helpers import build_coach_calendar_events

    events = build_coach_calendar_events(coach.id, coach.user_id, range_start, range_end)
    excluded_hold = None
    if exclude_request_id is not None:
        me = db.session.get(ClassRequest, exclude_request_id)
        excluded_hold = me.hold_block_id if me else None
    busy: dict = {}
    for ev in events:
        if ev.get("type") == "class" and ev.get("status") == "canceled":
            continue
        if ev.get("type") == "block" and excluded_hold is not None and ev.get("originalId") == excluded_hold:
            continue
        if not ev.get("date") or not ev.get("startTime") or not ev.get("endTime"):
            continue
        busy.setdefault(ev["date"], []).append((_minutes(ev["startTime"]), _minutes(ev["endTime"])))
    return busy


def free_blocks(coach: Coach, range_start: datetime, range_end: datetime, *, now=None, exclude_request_id=None) -> list:
    now = now or _now_wall_clock()
    busy = _busy_by_day(coach, range_start, range_end, exclude_request_id=exclude_request_id)
    out = []
    day = range_start.date()
    last = range_end.date()
    while day <= last:
        if day < now.date():
            day += timedelta(days=1)
            continue
        windows = sorted(busy.get(day.isoformat(), []))
        cursor = DAY_START
        free = []
        for s, e in windows:
            if s > cursor:
                free.append((cursor, min(s, DAY_END)))
            cursor = max(cursor, e)
        if cursor < DAY_END:
            free.append((cursor, DAY_END))
        for s, e in free:
            # Never offer time that has already started (today: from the next quarter hour).
            if day == now.date():
                s = max(s, ((now.hour * 60 + now.minute + 14) // 15) * 15)
            if e - s >= MIN_FREE:
                out.append({"date": day.isoformat(), "startTime": _hhmm(s), "endTime": _hhmm(e)})
        day += timedelta(days=1)
    return out


def _slot_is_free(coach: Coach, start: datetime, end: datetime, *, now, exclude_request_id=None) -> bool:
    blocks = free_blocks(coach, start.replace(hour=0, minute=0), start.replace(hour=23, minute=59),
                         now=now, exclude_request_id=exclude_request_id)
    s, e = start.hour * 60 + start.minute, end.hour * 60 + end.minute
    return any(b["date"] == start.date().isoformat() and _minutes(b["startTime"]) <= s and e <= _minutes(b["endTime"]) for b in blocks)


# ── rule 3: the hold ─────────────────────────────────────────────────────────

def _hold_title(row: ClassRequest, locale: str) -> str:
    who = _name(row.player.user if row.player else None)
    return f"Pedido de aula · {who}" if locale == "pt" else f"Class request · {who}"


def _place_hold(row: ClassRequest, coach: Coach, locale: str) -> None:
    from padel_app.services.calendar_service import add_event_service

    _release_hold(row)
    block = add_event_service(coach.user_id, {
        "type": "personal",
        "title": _hold_title(row, locale),
        "description": "",
        "date": row.start_datetime.date().isoformat(),
        "startTime": row.start_datetime.strftime("%H:%M"),
        "endTime": row.end_datetime.strftime("%H:%M"),
        "isRecurring": False,
    })
    row.hold_block_id = block.id


def _release_hold(row: ClassRequest) -> None:
    if row.hold_block_id is None:
        return
    block = db.session.get(CalendarBlock, row.hold_block_id)
    row.hold_block_id = None
    if block is not None:
        db.session.delete(block)
    db.session.flush()


# ── rule 6: telling the other side ───────────────────────────────────────────

def _locale_of(user) -> str:
    lang = getattr(user, "language", None) if user is not None else None
    return "pt" if (not lang or str(lang).startswith("pt")) else "en"


def _when(row: ClassRequest, locale: str) -> str:
    from padel_app.services.notification_service import _format_weekday

    d = row.start_datetime
    weekday = _format_weekday(d, locale)
    span = f"{d.strftime('%H:%M')}–{row.end_datetime.strftime('%H:%M')}"
    return f"{weekday} {d.strftime('%d/%m')} {span}"


def _tell_coach(row: ClassRequest, pt: str, en: str, *, kind: str) -> None:
    """A message from the student's side in the direct conversation, pushed to the coach."""
    from padel_app.models import Message
    from padel_app.realtime import publish
    from padel_app.serializers.message import serialize_message
    from padel_app.services.conversation_access import message_recipient_ids
    from padel_app.services.notification_service import _get_or_create_direct_conversation
    from padel_app.utils.expo_push import send_expo_push_to_user
    from padel_app.utils.push_notifications import send_push_notification

    coach_user = row.coach.user if row.coach else None
    player_user = row.player.user if row.player else None
    if coach_user is None or player_user is None:
        return
    locale = _locale_of(coach_user)
    text = pt if locale == "pt" else en
    conv = _get_or_create_direct_conversation(coach_user.id, player_user.id)
    msg = Message(
        text=text, sender_id=player_user.id, conversation_id=conv.id, message_type="text",
        msg_metadata={"classRequest": {"id": row.id, "status": row.status, "kind": kind}},
    )
    msg.create()
    publish({"type": "message_created", "payload": serialize_message(msg, None)}, message_recipient_ids(msg))
    publish({"type": "class_request_changed", "payload": {"requestId": row.id, "status": row.status}}, [coach_user.id])
    title = "Pedido de aula" if locale == "pt" else "Class request"
    send_push_notification(user_id=coach_user.id, title=title, body=text[:100], url=f"/messages/{conv.id}")
    send_expo_push_to_user(coach_user.id, title=title, body=text[:100],
                           data={"type": "class_request", "classRequestId": row.id})


def _tell_student(row: ClassRequest, pt: str, en: str, *, kind: str) -> None:
    """A system message from the coach's side; `_send_system_message` pushes."""
    from padel_app.realtime import publish
    from padel_app.services.notification_service import _send_system_message

    coach_user = row.coach.user if row.coach else None
    player_user = row.player.user if row.player else None
    if coach_user is None or player_user is None:
        return
    text = pt if _locale_of(player_user) == "pt" else en
    _send_system_message(
        coach_user.id, player_user.id, text,
        msg_metadata={"classRequest": {"id": row.id, "status": row.status, "kind": kind}},
    )
    publish({"type": "class_request_changed", "payload": {"requestId": row.id, "status": row.status}}, [player_user.id])


# ── student side ─────────────────────────────────────────────────────────────

def list_requests_for(user) -> list:
    """Rule 8: a student's own, or everything addressed to the coach."""
    q = ClassRequest.query
    if user.coach is not None:
        q = q.filter_by(coach_id=user.coach.id)
    elif user.player is not None:
        q = q.filter_by(player_id=user.player.id)
    else:
        abort(403, "No coach or player profile")
    return q.order_by(ClassRequest.id.desc()).all()


def create_class_request_service(player: Player, data: dict, *, now=None) -> ClassRequest:
    now = now or _now_wall_clock()
    try:
        coach_id = int(data.get("coachId"))
    except (TypeError, ValueError):
        abort(400, "coachId is required")
    coach = Coach.query.get_or_404(coach_id)
    _require_roster(player.id, coach.id)
    start, end = _parse_slot(data.get("date"), data.get("startTime"), data.get("endTime"))
    length = (end - start).total_seconds() / 60
    if length < MIN_LEN or length > MAX_LEN:
        abort(400, f"a class is between {MIN_LEN} and {MAX_LEN} minutes")
    if start < now:
        _refuse("in_the_past", "That time has already passed")
    if not _slot_is_free(coach, start, end, now=now):
        _refuse("slot_taken", "That time is not free any more")

    row = ClassRequest(
        player_id=player.id, coach_id=coach.id, start_datetime=start, end_datetime=end,
        note=(data.get("note") or "").strip() or None, status="pending",
    )
    db.session.add(row)
    db.session.flush()
    _place_hold(row, coach, _locale_of(coach.user))
    db.session.commit()
    who = _name(player.user)
    note = f" — “{row.note}”" if row.note else ""
    _tell_coach(
        row,
        f"{who} pediu uma aula: {_when(row, 'pt')}{note}.",
        f"{who} asked for a class: {_when(row, 'en')}{note}.",
        kind="requested",
    )
    return row


def _close(row: ClassRequest, status: str, by: str, now) -> None:
    _release_hold(row)
    row.status = status
    row.decided_by = by
    row.decided_at = wall_to_utc_naive(now)  # PAD-256: an event timestamp, in UTC
    db.session.commit()


def withdraw_class_request_service(request_id, player, *, now=None) -> ClassRequest:
    row = ClassRequest.query.get_or_404(request_id)
    if player is None or row.player_id != player.id:
        abort(403, "Not your request")
    if not row.is_open:
        _refuse("not_open", "This request was already decided")
    _close(row, "withdrawn", "student", now or _now_wall_clock())
    who = _name(row.player.user)
    _tell_coach(row, f"{who} retirou o pedido de aula de {_when(row, 'pt')}.",
                f"{who} withdrew the class request for {_when(row, 'en')}.", kind="withdrawn")
    return row


def answer_proposal_service(request_id, player, *, accept: bool, now=None) -> ClassRequest:
    """Rule 5: the student answers the coach's counter-proposal."""
    now = now or _now_wall_clock()
    row = ClassRequest.query.get_or_404(request_id)
    if player is None or row.player_id != player.id:
        abort(403, "Not your request")
    if row.status != "countered":
        _refuse("not_countered", "There is no proposal to answer")
    if accept:
        _create_class_and_accept(row, by="student", now=now)
        who = _name(row.player.user)
        _tell_coach(row, f"{who} aceitou a proposta: aula marcada para {_when(row, 'pt')}.",
                    f"{who} accepted the proposal: class booked for {_when(row, 'en')}.", kind="accepted")
    else:
        _close(row, "declined", "student", now)
        who = _name(row.player.user)
        _tell_coach(row, f"{who} recusou a proposta de {_when(row, 'pt')}.",
                    f"{who} declined the proposal for {_when(row, 'en')}.", kind="declined")
    return row


# ── coach side ───────────────────────────────────────────────────────────────

def _require_owner(row: ClassRequest, coach):
    if coach is None or row.coach_id != coach.id:
        abort(403, "Not your request")


def _create_class_and_accept(row: ClassRequest, *, by: str, now) -> None:
    """Rule 4: a one-off private class at the slot, the student enrolled, via
    the same service the coach's own "Add class" uses."""
    from padel_app.services.lesson_service import add_class_service

    coach = row.coach
    club = coach.current_club if coach else None
    if club is None:
        _refuse("NO_CLUB", "Join or create a club before accepting a class request")
    if not _slot_is_free(coach, row.start_datetime, row.end_datetime, now=now, exclude_request_id=row.id):
        _refuse("slot_taken", "That time is no longer free on your calendar")
    _release_hold(row)
    lesson = add_class_service(
        {
            "name": _name(row.player.user if row.player else None) or "Class",
            "classType": "private",
            "maxPlayers": 1,
            "color": HOLD_COLOR,
            "date": row.start_datetime.date().isoformat(),
            "startTime": row.start_datetime.strftime("%H:%M"),
            "endTime": row.end_datetime.strftime("%H:%M"),
            "isRecurring": False,
            "playerIds": [row.player_id],
        },
        coach,
        club,
    )
    row.lesson_id = lesson.id
    row.status = "accepted"
    row.decided_by = by
    row.decided_at = wall_to_utc_naive(now)  # PAD-256: an event timestamp, in UTC
    db.session.commit()


def decide_class_request_service(request_id, coach, *, action: str, data=None, now=None) -> ClassRequest:
    """Rule 4: ``accept`` | ``decline`` | ``propose``."""
    now = now or _now_wall_clock()
    data = data or {}
    row = ClassRequest.query.get_or_404(request_id)
    _require_owner(row, coach)
    if not row.is_open:
        _refuse("not_open", "This request was already decided")

    if action == "accept":
        if row.status != "pending":
            _refuse("not_pending", "Only a pending request can be accepted; the student is answering your proposal")
        _create_class_and_accept(row, by="coach", now=now)
        _tell_student(row, f"Aula marcada: {_when(row, 'pt')}. O treinador aceitou o teu pedido.",
                      f"Class booked: {_when(row, 'en')}. The coach accepted your request.", kind="accepted")
        return row

    if action == "decline":
        _close(row, "declined", "coach", now)
        _tell_student(row, f"O treinador não pode dar a aula de {_when(row, 'pt')}.",
                      f"The coach cannot do the class on {_when(row, 'en')}.", kind="declined")
        return row

    if action == "propose":
        start, end = _parse_slot(data.get("date"), data.get("startTime"), data.get("endTime"))
        if start < now:
            _refuse("in_the_past", "That time has already passed")
        if not _slot_is_free(coach, start, end, now=now, exclude_request_id=row.id):
            _refuse("slot_taken", "That time is not free on your calendar")
        row.start_datetime, row.end_datetime = start, end
        row.status = "countered"
        _place_hold(row, coach, _locale_of(coach.user))
        db.session.commit()
        _tell_student(row, f"O treinador propôs outro horário: {_when(row, 'pt')}. Aceitas?",
                      f"The coach proposed another time: {_when(row, 'en')}. Do you accept?", kind="proposed")
        return row

    abort(400, "action must be accept, decline or propose")
