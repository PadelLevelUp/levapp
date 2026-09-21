"""classes.class-requests (PAD-104): a student books a class in the coach's
free time; the coach accepts, declines or proposes another time.

Free time is inferred from the coach's calendar (rule 1); the requested slot
is held by a plain CalendarBlock while the request is open (rule 3); accept
creates a one-off private class through the same path as "Add class"
(rule 4); every transition is mirrored into the coach ↔ student direct
conversation (rule 6). PAD-281 (rule 10): the student may answer a proposal
with another time, and the loop runs until someone accepts or closes it.
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


# The day window is the coach's working time (settings.coach-working-hours,
# 08:00-22:00 until set) — `availability_service.working_windows_for`; #338
# review F2: one computation for free-blocks, requests, proposals and accepts.
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
        # PAD-357 (rules 12 and 14): the people the requester brings, and the recurrence.
        "participants": _serialize_participants(row),
        "recurrence": row.recurrence,
    }


def _serialize_participants(row: ClassRequest) -> list:
    ids = [int(pid) for pid in (row.invitee_player_ids or [])]
    if not ids:
        return []
    players = {p.id: p for p in Player.query.filter(Player.id.in_(ids)).all()}
    out = []
    for pid in ids:
        p = players.get(pid)
        if p is None or p.user is None:
            continue
        out.append({"playerId": str(p.id), "name": _name(p.user), "username": p.user.username})
    return out


def _invitees(row: ClassRequest) -> list:
    ids = [int(pid) for pid in (row.invitee_player_ids or [])]
    return [p for p in Player.query.filter(Player.id.in_(ids)).all()] if ids else []


# ── PAD-357 rule 14: a weekly request ────────────────────────────────────────

def _parse_recurrence(data: dict):
    """`{weekdays: [1..7, Monday = 1], startDate, endDate}` or None for a single class."""
    rec = data.get("recurrence")
    if not rec:
        return None
    try:
        weekdays = sorted({int(d) for d in rec.get("weekdays") or []})
        start = datetime.strptime(rec["startDate"], "%Y-%m-%d").date()
        end = datetime.strptime(rec["endDate"], "%Y-%m-%d").date()
    except (TypeError, ValueError, KeyError, AttributeError):
        abort(400, "recurrence is {weekdays: [1..7], startDate, endDate}")
    if not weekdays or any(d < 1 or d > 7 for d in weekdays):
        abort(400, "recurrence.weekdays must be 1..7 (Monday = 1)")
    if end < start:
        abort(400, "recurrence.endDate must not be before startDate")
    if (end - start).days > 366:
        abort(400, "a weekly request covers at most a year")
    return {"weekdays": weekdays, "startDate": start.isoformat(), "endDate": end.isoformat()}


def _occurrence_dates(rec: dict) -> list:
    start = datetime.strptime(rec["startDate"], "%Y-%m-%d").date()
    end = datetime.strptime(rec["endDate"], "%Y-%m-%d").date()
    wanted = set(rec["weekdays"])
    out, day = [], start
    while day <= end:
        if day.isoweekday() in wanted:
            out.append(day)
        day += timedelta(days=1)
    return out


def _app_days_of_week(rec: dict) -> list:
    """The calendar's `daysOfWeek` convention (0 = Sunday .. 6 = Saturday) from ISO 1..7."""
    return [d % 7 for d in rec["weekdays"]]


def _reanchored(rec, date_str):
    """Rule 16: a proposal or counter-proposal on a weekly request must land on
    one of its weekdays (`409 off_series` otherwise); the series then starts on
    that date, its weekday set and end date unchanged."""
    if not rec:
        return None
    try:
        day = datetime.strptime(str(date_str), "%Y-%m-%d").date()
    except (TypeError, ValueError):
        abort(400, "date is required (YYYY-MM-DD)")
    if day.isoweekday() not in rec["weekdays"]:
        _refuse("off_series", "A weekly request can only move to one of its weekdays", weekdays=rec["weekdays"])
    if day.isoformat() > rec["endDate"]:
        _refuse("off_series", "That date is after the series ends", weekdays=rec["weekdays"])
    return {**rec, "startDate": day.isoformat()}


def _reslot(row: "ClassRequest", coach: Coach, data: dict, *, now) -> None:
    """Rules 10 and 16: move the request to the proposed slot — validated for
    every person and, on a weekly request, on every occurrence — and re-anchor
    the recurrence; the hold follows (rule 3)."""
    data = data or {}
    recurrence = _reanchored(row.recurrence, data.get("date"))
    start, end = _validated_slot(
        coach, data, now=now, exclude_request_id=row.id,
        people=[row.player, *_invitees(row)], recurrence=recurrence,
    )
    row.start_datetime, row.end_datetime = start, end
    row.recurrence = recurrence
    _place_hold(row, coach, _locale_of(coach.user))


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
    """Rule 1: the coach's working windows minus their calendar, as blocks of at
    least MIN_FREE minutes — the same computation `classes.availability` uses
    with nobody else's calendar subtracted."""
    from padel_app.services.availability_service import free_windows_for

    now = now or _now_wall_clock()
    free = free_windows_for(coach, [], range_start.date(), range_end.date(), now=now,
                            exclude_request_id=exclude_request_id)
    return [
        {"date": day.isoformat(), "startTime": _hhmm(s), "endTime": _hhmm(e)}
        for day in sorted(free)
        for s, e in free[day]
        if e - s >= MIN_FREE
    ]


def _slot_is_free(coach: Coach, start: datetime, end: datetime, *, now, exclude_request_id=None) -> bool:
    from padel_app.services.availability_service import free_windows_for, slot_fits

    free = free_windows_for(coach, [], start.date(), start.date(), now=now, exclude_request_id=exclude_request_id)
    return slot_fits(free, start.date(), start.hour * 60 + start.minute, end.hour * 60 + end.minute)


# ── rule 3: the hold ─────────────────────────────────────────────────────────

def _hold_title(row: ClassRequest, locale: str) -> str:
    from padel_app.models.class_request import HOLD_TITLE_PREFIXES

    who = _name(row.player.user if row.player else None)
    pt, en = HOLD_TITLE_PREFIXES  # the hooks recognise a hold by these (rule 18)
    return f"{pt}{who}" if locale == "pt" else f"{en}{who}"


def _place_hold(row: ClassRequest, coach: Coach, locale: str) -> None:
    from padel_app.services.calendar_service import add_event_service

    _release_hold(row)
    payload = {
        "type": "personal",
        "title": _hold_title(row, locale),
        "description": "",
        "date": row.start_datetime.date().isoformat(),
        "startTime": row.start_datetime.strftime("%H:%M"),
        "endTime": row.end_datetime.strftime("%H:%M"),
        "isRecurring": False,
    }
    if row.recurrence:
        # PAD-357 rule 14: one recurring hold covering every occurrence.
        payload.update({
            "isRecurring": True,
            "recurrenceRule": {"frequency": "weekly", "daysOfWeek": _app_days_of_week(row.recurrence)},
            "endDate": row.recurrence["endDate"],
        })
    block = add_event_service(coach.user_id, payload)
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


def _meta(row: ClassRequest, kind: str) -> dict:
    """The `metadata.classRequest` every class-request message carries (rule 6).

    PAD-281: `slot` is the time the message is about, so a chat bubble can tell
    the live proposal from an older round's — the request itself only knows the
    slot currently on the table."""
    return {"classRequest": {
        "id": row.id, "status": row.status, "kind": kind,
        "slot": {
            "date": row.start_datetime.date().isoformat(),
            "startTime": row.start_datetime.strftime("%H:%M"),
            "endTime": row.end_datetime.strftime("%H:%M"),
        },
    }}


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
        msg_metadata=_meta(row, kind),
    )
    msg.create()
    publish({"type": "message_created", "payload": serialize_message(msg, None)}, message_recipient_ids(msg))
    publish({"type": "class_request_changed", "payload": {"requestId": row.id, "status": row.status}}, [coach_user.id])
    title = "Pedido de aula" if locale == "pt" else "Class request"
    send_push_notification(user_id=coach_user.id, title=title, body=text[:100], url=f"/messages/{conv.id}")
    # PAD-324 (messaging.push-notifications rule 7): the same defect as the
    # join-request push. There is a message behind this — the web push already
    # opens its thread — and `class_request` is not one of the two shapes the
    # contract defines, so `routeForPushData` returns null and the tap opens
    # the app and does nothing. The request id stays as context.
    send_expo_push_to_user(coach_user.id, title=title, body=text[:100],
                           data={
                               "type": "message",
                               "conversationId": conv.id,
                               "classRequestId": row.id,
                           })


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
        msg_metadata=_meta(row, kind),
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


def _validated_slot(coach: Coach, data: dict, *, now, exclude_request_id=None, people=(), recurrence=None):
    """Rules 2 and 7: a well-formed slot of 30–180 minutes, not started, inside
    a free block (the request's own hold excluded when re-slotting one).
    PAD-357 (rules 13 and 15): free for every person in `people` as well, and
    for a weekly request on every occurrence date — the first refusal names it."""
    start, end = _parse_slot(data.get("date"), data.get("startTime"), data.get("endTime"))
    length = (end - start).total_seconds() / 60
    if length < MIN_LEN or length > MAX_LEN:
        abort(400, f"a class is between {MIN_LEN} and {MAX_LEN} minutes")
    if start < now:
        _refuse("in_the_past", "That time has already passed")
    if not people and not recurrence:
        if not _slot_is_free(coach, start, end, now=now, exclude_request_id=exclude_request_id):
            _refuse("slot_taken", "That time is not free any more")
        return start, end
    from padel_app.services.availability_service import free_windows_for, slot_fits

    days = _occurrence_dates(recurrence) if recurrence else [start.date()]
    if not days:
        abort(400, "the recurrence has no occurrence between its dates")
    free = free_windows_for(coach, list(people), days[0], days[-1], now=now, exclude_request_id=exclude_request_id)
    s_min, e_min = start.hour * 60 + start.minute, end.hour * 60 + end.minute
    for day in days:
        if not slot_fits(free, day, s_min, e_min):
            _refuse("slot_taken", "That time is not free for everyone", date=day.isoformat())
    return start, end


def create_class_request_service(player: Player, data: dict, *, now=None) -> ClassRequest:
    now = now or _now_wall_clock()
    try:
        coach_id = int(data.get("coachId"))
    except (TypeError, ValueError):
        abort(400, "coachId is required")
    coach = Coach.query.get_or_404(coach_id)
    _require_roster(player.id, coach.id)
    # PAD-357 rules 12 and 14: who comes, and whether it repeats.
    from padel_app.services.availability_service import participants_or_refuse
    invitee_ids = participants_or_refuse(player, coach, data.get("participants") or [])
    recurrence = _parse_recurrence(data)
    if recurrence:
        first = next(iter(_occurrence_dates(recurrence)), None)
        if first is None:
            abort(400, "the recurrence has no occurrence between its dates")
        data = {**data, "date": first.isoformat()}
    people = [player, *[db.session.get(Player, pid) for pid in invitee_ids]]
    start, end = _validated_slot(coach, data, now=now, people=people, recurrence=recurrence)

    row = ClassRequest(
        player_id=player.id, coach_id=coach.id, start_datetime=start, end_datetime=end,
        note=(data.get("note") or "").strip() or None, status="pending",
        invitee_player_ids=invitee_ids or None, recurrence=recurrence,
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


def _lock(request_id) -> ClassRequest:
    """The request row, locked for update (B-051 pattern): every decision is a
    check-then-write, and two answers racing for the same slot must serialise."""
    row = ClassRequest.query.filter_by(id=request_id).with_for_update().first()
    if row is None:
        abort(404)
    return row


def _require_slot_match(row: ClassRequest, data: dict | None) -> None:
    """Rule 5 (PAD-281 review): an accept that names a slot books only that slot.
    A stale bubble (cached list, second device, a push tapped late) sends the slot
    it showed; when it is no longer the one on the table, nothing is booked."""
    slot = (data or {}).get("slot")
    if not slot:
        return
    live = (row.start_datetime.date().isoformat(), row.start_datetime.strftime("%H:%M"), row.end_datetime.strftime("%H:%M"))
    if (slot.get("date"), slot.get("startTime"), slot.get("endTime")) != live:
        _refuse("slot_changed", "That proposal is no longer the one on the table")


def _close(row: ClassRequest, status: str, by: str, now) -> None:
    _release_hold(row)
    row.status = status
    row.decided_by = by
    row.decided_at = wall_to_utc_naive(now)  # PAD-256: an event timestamp, in UTC
    db.session.commit()


def close_open_requests_silently(*, status: str, by: str, player_id=None, coach_id=None, now_utc=None) -> int:
    """Rule 18 (PAD-360, B-135): the person behind a request is going away.

    Every open request of ``player_id`` (as the requester) and/or to ``coach_id``
    (both given narrows to that pair) closes with its hold released. Silent: no notification in either direction —
    one side no longer exists. No commit; the caller owns the transaction.
    """
    from padel_app.utils.dates import utcnow_naive

    if player_id is None and coach_id is None:
        raise ValueError("close_open_requests_silently needs a player_id or a coach_id")
    query = ClassRequest.query.filter(ClassRequest.status.in_(("pending", "countered")))
    if player_id is not None:
        query = query.filter(ClassRequest.player_id == player_id)
    if coach_id is not None:
        query = query.filter(ClassRequest.coach_id == coach_id)
    rows = query.with_for_update().all()
    for row in rows:
        _release_hold(row)
        row.status = status
        row.decided_by = by
        row.decided_at = now_utc or utcnow_naive()
    return len(rows)


def drop_invitee_from_open_requests(player_id: int) -> int:
    """Rule 18: an accept never enrols a deleted account. No commit.

    No row lock: nothing else rewrites `invitee_player_ids` after a request is
    created, and locking every open group request table-wide let two concurrent
    account deletions deadlock (#345 review F3). Ids are compared as text, so a
    malformed value in someone else's request cannot fail this deletion.
    """
    rows = ClassRequest.query.filter(
        ClassRequest.status.in_(("pending", "countered")), ClassRequest.invitee_player_ids.isnot(None)
    ).all()
    changed = 0
    for row in rows:
        current = row.invitee_player_ids if isinstance(row.invitee_player_ids, list) else []
        kept = [pid for pid in current if str(pid) != str(player_id)]
        if len(kept) != len(current):
            row.invitee_player_ids = kept or None
            changed += 1
    return changed


def release_holds_of_players(player_ids) -> int:
    """Rule 18: these players are about to be deleted in bulk (`Query.delete()`
    runs no ORM hook), and ON DELETE CASCADE will take their requests. No commit."""
    ids = [int(pid) for pid in (player_ids or [])]
    if not ids:
        return 0
    from padel_app.models.class_request import HOLD_TITLE_PREFIXES

    rows = ClassRequest.query.filter(
        ClassRequest.player_id.in_(ids), ClassRequest.hold_block_id.isnot(None)
    ).all()
    released = 0
    for row in rows:
        if not row.is_open:
            # A closed request's leftover pointer: only a block that is still a hold goes.
            block = db.session.get(CalendarBlock, row.hold_block_id)
            if block is None or block.type != "personal" or not (block.title or "").startswith(HOLD_TITLE_PREFIXES):
                row.hold_block_id = None
                continue
        _release_hold(row)
        released += 1
    db.session.flush()
    return released


def withdraw_class_request_service(request_id, player, *, now=None) -> ClassRequest:
    row = _lock(request_id)
    if player is None or row.player_id != player.id:
        abort(403, "Not your request")
    if not row.is_open:
        _refuse("not_open", "This request was already decided")
    _close(row, "withdrawn", "student", now or _now_wall_clock())
    who = _name(row.player.user)
    _tell_coach(row, f"{who} retirou o pedido de aula de {_when(row, 'pt')}.",
                f"{who} withdrew the class request for {_when(row, 'en')}.", kind="withdrawn")
    return row


def answer_proposal_service(request_id, player, *, accept: bool, data=None, now=None) -> ClassRequest:
    """Rule 5: the student answers the coach's counter-proposal (`data.slot`, when
    sent, must be the slot on the table)."""
    now = now or _now_wall_clock()
    row = _lock(request_id)
    if player is None or row.player_id != player.id:
        abort(403, "Not your request")
    if row.status != "countered":
        _refuse("not_countered", "There is no proposal to answer")
    _require_slot_match(row, data)
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


def counter_proposal_service(request_id, player, data: dict, *, now=None) -> ClassRequest:
    """Rule 10 (PAD-281): the student answers the coach's proposal with another
    time. The slot is validated like a new request (the request's own hold does
    not count as busy), the hold moves, the request is `pending` again and the
    coach is told from the student's side. Rounds are unlimited."""
    now = now or _now_wall_clock()
    row = _lock(request_id)
    if player is None or row.player_id != player.id:
        abort(403, "Not your request")
    if row.status != "countered":
        _refuse("not_countered", "There is no proposal to answer")
    coach = row.coach
    _reslot(row, coach, data, now=now)
    row.status = "pending"
    db.session.commit()
    who = _name(row.player.user)
    _tell_coach(row, f"{who} propôs outro horário: {_when(row, 'pt')}. Aceitas?",
                f"{who} proposed another time: {_when(row, 'en')}. Do you accept?", kind="counter_proposal")
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
    invitees = _invitees(row)
    if row.recurrence:
        # Rule 17 (#338 review F4): occurrences that have started are skipped; the
        # series starts at the first future one; in_the_past only when none is left.
        t0, t1 = row.start_datetime.time(), row.end_datetime.time()
        future = [d for d in _occurrence_dates(row.recurrence) if datetime.combine(d, t0) >= now]
        if not future:
            _refuse("in_the_past", "Every occurrence of this request has passed")
        if future[0] != row.start_datetime.date():
            row.recurrence = {**row.recurrence, "startDate": future[0].isoformat()}
            row.start_datetime = datetime.combine(future[0], t0)
            row.end_datetime = datetime.combine(future[0], t1)
    _validated_slot(
        coach,
        {"date": row.start_datetime.date().isoformat(), "startTime": row.start_datetime.strftime("%H:%M"),
         "endTime": row.end_datetime.strftime("%H:%M")},
        now=now, exclude_request_id=row.id, people=[row.player, *invitees], recurrence=row.recurrence,
    )
    _release_hold(row)
    people_ids = [row.player_id, *[p.id for p in invitees]]
    payload = {
        "name": _name(row.player.user if row.player else None) or "Class",
        "classType": "private",
        "maxPlayers": len(people_ids),
        "color": HOLD_COLOR,
        "date": row.start_datetime.date().isoformat(),
        "startTime": row.start_datetime.strftime("%H:%M"),
        "endTime": row.end_datetime.strftime("%H:%M"),
        "isRecurring": False,
        "playerIds": people_ids,
    }
    if row.recurrence:
        # PAD-357 rule 14: ONE weekly series to the given end date (classes.recurrence rule 6).
        payload.update({
            "isRecurring": True,
            "recurrenceRule": {"frequency": "weekly", "daysOfWeek": _app_days_of_week(row.recurrence)},
            "endDate": row.recurrence["endDate"],
        })
    lesson = add_class_service(
        payload,
        coach,
        club,
        # PAD-330: the student ASKED for this class and already gets the
        # acceptance message. Telling them a coach added them would be a second
        # message for one event, about something they initiated.
        notify_students=False,
    )
    # PAD-357 rule 14: the people they brought did not ask — they are told.
    from padel_app.services.notification_service import notify_student_added_to_class
    for p in invitees:
        try:
            notify_student_added_to_class(coach, p.id, lesson=lesson)
        except Exception:  # never fail an accept because a notice failed (PAD-10 posture)
            pass
    row.lesson_id = lesson.id
    row.status = "accepted"
    row.decided_by = by
    row.decided_at = wall_to_utc_naive(now)  # PAD-256: an event timestamp, in UTC
    db.session.commit()


def decide_class_request_service(request_id, coach, *, action: str, data=None, now=None) -> ClassRequest:
    """Rule 4: ``accept`` | ``decline`` | ``propose``."""
    now = now or _now_wall_clock()
    data = data or {}
    row = _lock(request_id)
    _require_owner(row, coach)
    if not row.is_open:
        _refuse("not_open", "This request was already decided")

    if action == "accept":
        if row.status != "pending":
            _refuse("not_pending", "Only a pending request can be accepted; the student is answering your proposal")
        _require_slot_match(row, data)
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
        # The same validation as a new request (rules 2, 7, 13 and 16), the request's own hold excluded.
        _reslot(row, coach, data, now=now)
        row.status = "countered"
        db.session.commit()
        _tell_student(row, f"O treinador propôs outro horário: {_when(row, 'pt')}. Aceitas?",
                      f"The coach proposed another time: {_when(row, 'en')}. Do you accept?", kind="proposed")
        return row

    abort(400, "action must be accept, decline or propose")
