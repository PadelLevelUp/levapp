"""The app's entry points into the new invitation engine (swap plan §3.1, §8 step 6; PAD-918).

Each function here is what a route or a service calls when the session it touches runs on the new
engine (``engine_switch.engine_for``): it turns the app's action into an engine request, runs it in
the session's unit (``engine_runner.engine``), and answers in the route's own shape.
"""
from __future__ import annotations

from datetime import datetime

from werkzeug.exceptions import Forbidden, NotFound

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine import requests as rq
from padel_app.sql_db import db
from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive


# --- answers (notifications.invitations NB5, INVITATIONS-119) --------------------------------------


def _answer_state(row, placed: bool) -> str:
    """What happened to an answered invitation, as the route says it."""
    if row.closed_at is not None:
        return "closed_same_hour"
    if row.sorry_at is not None:
        return "sorry"
    if row.answer == "no":
        return "declined"
    return "confirmed" if placed else "reoffered"


def respond_to_invitation(invitation_id: int, action: str, user_id: int, *, now: datetime | None = None,
                          coach_id: int | None = None) -> dict:
    """A Yes or a No to a new-engine invitation, by its id: the student's own (``user_id``), or the
    coach's on their behalf (``coach_id``, ``coach_respond``). Returns ``{action, invitationId}``:
    ``confirmed``, ``declined``, ``sorry``, ``reoffered``, ``closed_same_hour`` or ``class_started``,
    with ``duplicate: true`` for an answer already given. 404 for an unknown id, 403 when the
    invitation is not the caller's."""
    from padel_app.models import EngineInvitation
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.players import Player
    from padel_app.models.presences import Presence
    from padel_app.services.engine_runner import engine
    from padel_app.services.lesson_service import coaches_for

    if action not in ("yes", "no"):
        from flask import abort
        abort(400, "action must be 'yes' or 'no'")
    now = now or utcnow_naive()
    row = db.session.get(EngineInvitation, int(invitation_id))
    if row is None:
        raise NotFound("unknown invitation")
    inst = db.session.get(LessonInstance, row.lesson_instance_id)
    if coach_id is not None:
        if coach_id not in {c.id for c in coaches_for(inst)}:
            raise Forbidden("not your session")
    elif getattr(db.session.get(Player, row.player_id), "user_id", None) != user_id:
        raise Forbidden("not your invitation")

    def placed() -> bool:
        p = Presence.query.filter_by(lesson_instance_id=row.lesson_instance_id, player_id=row.player_id).first()
        return p is not None and p.status != "absent"

    out = {"invitationId": row.id}
    if inst.start_datetime <= utc_to_wall_naive(now):
        return {**out, "action": "class_started"}
    if row.answer is not None or row.closed_at is not None:
        return {**out, "action": _answer_state(row, placed()), "duplicate": True}

    effects = engine(now).handle(str(row.lesson_instance_id),
                                 rq.Answer(str(row.player_id), action == "yes"), now)
    db.session.expire_all()
    student = str(row.player_id)
    if any(isinstance(e, fx.Reoffered) and e.student == student for e in effects):
        return {**out, "action": "reoffered"}
    row = db.session.get(EngineInvitation, int(invitation_id))
    return {**out, "action": _answer_state(row, placed())}


# --- shared ----------------------------------------------------------------------------------------

#: The app's side words and the engine's.
TO_ENGINE_SIDE = {"left": "L", "right": "R"}
TO_APP_SIDE = {"L": "left", "R": "right"}


def handle(instance, request, now: datetime | None = None) -> list:
    """One engine request for the occurrence, in its unit; the outbox goes out after the commit."""
    from padel_app.services.engine_runner import engine

    now = now or utcnow_naive()
    effects = engine(now).handle(str(instance.id), request, now)
    db.session.expire_all()
    return effects


def refusal(effects, student) -> "fx.Refused | None":
    return next((e for e in effects if isinstance(e, fx.Refused) and e.student == str(student)), None)


def refuse(code: str, refused=None, **extra):
    """A ``409 {code, message, ...}`` the clients branch on (classes.join-requests rule 15, NJ1)."""
    from flask import abort, jsonify, make_response

    if refused is not None and code == "side_full":
        extra = {"sides": sorted(TO_APP_SIDE[s] for s in refused.sides), **extra}
    abort(make_response(jsonify({"code": code, "message": code.replace("_", " "), **extra}), 409))


# --- a spot opens: a regular's No, a cancellation (swap plan §3.1) ---------------------------------


def _is_regular(presence) -> bool:
    return presence is not None and presence.enrolment_source == "roster"


def student_not_going(instance, presence, now: datetime | None = None) -> dict:
    """A regular's No (``RegularAbsent``) or a placed student's cancellation (``Cancel``): the engine
    records the absence (its notice by the deadline alone, decision 6) and plans the spot. Answered in
    the cancel route's own shape."""
    student = str(presence.player_id)
    req = rq.RegularAbsent(student) if _is_regular(presence) else rq.Cancel(student)
    handle(instance, req, now)
    return {"action": "declined", "proactive": False}


def answer_attendance_request(instance, presence, action: str, now: datetime | None = None) -> dict:
    """Yes or No to the attendance request (the reminder): a Yes confirms, or brings a regular who had
    said No back (``RegularReturns``); a No is ``student_not_going``. In the reminder route's shape."""
    if action == "no":
        student_not_going(instance, presence, now)
        return {"action": "declined"}
    student = str(presence.player_id)
    returning = _is_regular(presence) and presence.status == "absent"
    handle(instance, rq.RegularReturns(student) if returning else rq.ConfirmAttendance(student), now)
    return {"action": "confirmed"}


# --- waiting lists (notifications.waiting-list; engine-settings rule 4) ----------------------------


def _sides_choice(requested: str | None, own_sides: frozenset[str]) -> str:
    """The student's own/other/both choice from the side the app sent (engine-settings rule 4)."""
    if requested in (None, "both") or len(own_sides) != 1:
        return "both" if requested == "both" else "own"
    return "own" if TO_ENGINE_SIDE.get(requested) in own_sides else "other"


def student_joins_waiting_list(player, instance, side: str | None, now: datetime | None = None):
    """The student's own join of the students' list, with the side they sent as their own/other/both
    choice (none sent, none passed). A refusal is a 409 with the engine's code.
    Returns ``(entry, created)`` as the route expects."""
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services.engine_store import TableStore

    student = str(player.id)
    before = WaitingListEntry.query.filter_by(lesson_instance_id=instance.id, player_id=player.id,
                                              is_active=True).first()
    if before is not None:
        return before, False
    sides = None
    if side is not None:
        # The side the student sent (the join route's side round trip since PAD-672), in the engine's
        # own/other/both terms; none sent, none passed.
        own = TableStore()._students(_coach_of(instance), [], {}, extra=[player.id])[student].sides
        sides = _sides_choice(side, own)
    effects = handle(instance, rq.JoinWaitingList(student, "students", sides=sides), now)
    refused = refusal(effects, student)
    if refused is not None:
        refuse(refused.reason, refused)
    entry = WaitingListEntry.query.filter_by(lesson_instance_id=instance.id, player_id=player.id,
                                             is_active=True).first()
    return entry, True


def coach_adds_to_waiting_list(instance, player_id: int, side: str | None, now: datetime | None = None) -> dict:
    """The coach puts a student on the coach's list for this occurrence, with a side (rule 18)."""
    from padel_app.models.waiting_list_entry import WaitingListEntry

    student = str(player_id)
    effects = handle(instance, rq.JoinWaitingList(student, "coach", side=TO_ENGINE_SIDE.get(side)), now)
    refused = refusal(effects, student)
    row = WaitingListEntry.query.filter_by(lesson_instance_id=instance.id, player_id=player_id).first()
    if refused is not None:
        if refused.reason == "already_on_list":
            return {"action": "already_on_list", "entryId": row.id if row else None}
        refuse(refused.reason, refused)
    return {"action": "added", "entryId": row.id if row else None}


def leaves_waiting_list(instance, entry, now: datetime | None = None) -> None:
    """The student leaves, or the coach takes them off: the list the entry is on."""
    lst = "coach" if entry.added_by == "coach" else "students"
    handle(instance, rq.LeaveWaitingList(str(entry.player_id), lst), now)


def _coach_of(instance) -> int:
    from padel_app.services.lesson_service import primary_coach

    return primary_coach(instance).id


def coach_marks_absent(instance, presence, now: datetime | None = None) -> None:
    """The coach's attendance sheet marks a student absent: after the class started it is a no-show
    (``NoShow``, the engine records the absence); before it, the spot opens as for the student's own No."""
    now = now or utcnow_naive()
    if instance.start_datetime is not None and utc_to_wall_naive(now) >= instance.start_datetime:
        handle(instance, rq.NoShow(str(presence.player_id)), now)
    else:
        student_not_going(instance, presence, now)


def coach_excludes(instance, player_id: int, now: datetime | None = None) -> None:
    """The coach keeps a student out of this session's invitations (``CoachExcludes``)."""
    handle(instance, rq.CoachExcludes(str(player_id)), now)


# --- re-plans: a class edit, a config save (engine-planning rule 1; engine-settings rule 9) ----------


def replan(sessions, now: datetime | None = None) -> list:
    """Plan the named sessions now (``UpdateSettings`` naming them: each reads its coach's stored
    settings again through the lookup), rather than at the next tick."""
    from padel_app.invitation_engine.settings import EngineSettings
    from padel_app.services.engine_runner import engine

    sessions = tuple(str(s) for s in sessions)
    if not sessions:
        return []
    now = now or utcnow_naive()
    effects = engine(now).handle(sessions[0], rq.UpdateSettings(EngineSettings(), sessions), now)
    db.session.expire_all()
    return effects


def replan_coach(coach_id: int, now: datetime | None = None) -> list:
    """A config save: every new-engine session of the coach that the engine lists."""
    from padel_app.models import EngineSession
    from padel_app.services.engine_store import TableStore

    listed = set(TableStore(clock=lambda: now or utcnow_naive()).sessions())
    mine = [str(r.lesson_instance_id) for r in EngineSession.query.filter_by(coach_id=coach_id).all()]
    return replan([s for s in mine if s in listed], now)


# --- the coach's add at a busy hour (classes.instance-enrollment rule 15) --------------------------


def _overlaps(a_start, a_end, b_start, b_end) -> bool:
    """Any overlap of two intervals; one ending as the other starts is none (decision 11)."""
    return a_start < b_end and b_start < a_end


def _going_elsewhere(player_ids, exclude_instance_id, now):
    """Each student's going occurrences that have not ended: on the roster or presences, not absent."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.presences import Presence

    wall = utc_to_wall_naive(now)
    return (db.session.query(Presence, LessonInstance)
            .join(LessonInstance, LessonInstance.id == Presence.lesson_instance_id)
            .filter(Presence.player_id.in_([int(p) for p in player_ids] or [-1]),
                    (Presence.status.is_(None)) | (Presence.status != "absent"),
                    LessonInstance.status != "canceled",
                    LessonInstance.end_datetime > wall,
                    LessonInstance.id != (exclude_instance_id or -1))
            .all())


def _series_coaches(lesson) -> list[int]:
    """A series' coaches in assignment order (``coaches_for`` reads an occurrence, not a series)."""
    from padel_app.models.Association_CoachLesson import Association_CoachLesson

    return [r.coach_id for r in Association_CoachLesson.query.filter_by(lesson_id=lesson.id)
            .order_by(Association_CoachLesson.id).all()]


def _series_is_new_engine(lesson) -> bool:
    """An occurrence not yet materialised is new-engine when its class's coach is on ``new`` (rule 18
    assigns it so when it first exists)."""
    from padel_app.models.notification_config import NotificationConfig

    coaches = _series_coaches(lesson)
    if not coaches:
        return False
    config = NotificationConfig.query.filter_by(coach_id=coaches[0]).first()
    return config is not None and config.engine_version == "new"


def same_hour_clashes(player_ids, *, instance=None, lesson=None, on_date=None, coach_ids=None,
                      series_new: bool | None = None, now: datetime | None = None) -> list[dict]:
    """Rule 15: for a coach's add of ``player_ids`` to one occurrence (``instance``) or a series
    (``lesson``; ``on_date`` narrows it to one occurrence not yet materialised; ``coach_ids`` and
    ``series_new`` stand in for a series not saved yet), every clash: another class the student is going to that overlaps the target and is
    the same coach's, or starts at the same time (any coach); at least one of the two new-engine.
    Empty when the add may go through."""
    from padel_app.models.players import Player
    from padel_app.services.engine_switch import engine_for
    from padel_app.services.lesson_service import coaches_for

    now = now or utcnow_naive()
    target = instance if instance is not None else lesson
    target_coaches = (set(coach_ids) if coach_ids is not None
                      else {c.id for c in coaches_for(instance)} if instance is not None
                      else set(_series_coaches(lesson)))
    duration = target.end_datetime - target.start_datetime
    target_new_series = lesson is not None and (series_new if series_new is not None
                                                else _series_is_new_engine(lesson))
    clashes = []
    for presence, other in _going_elsewhere(player_ids, getattr(instance, "id", None), now):
        other_new = engine_for(other) == "new"
        same_coach = bool(target_coaches & {c.id for c in coaches_for(other)})
        if instance is not None:
            starts = [(instance.start_datetime, engine_for(instance) == "new")]
        else:
            # The series' starts are wall-clock times expand_occurrences labels UTC: naive, as stored.
            starts = [(occ.replace(tzinfo=None), target_new_series) for occ in lesson.occurrences_between(
                other.start_datetime - duration, other.end_datetime)
                if on_date is None or occ.date() == on_date]
        for start, target_new in starts:
            if not (target_new or other_new):
                continue
            end = start + duration
            if start == other.start_datetime or (same_coach and _overlaps(start, end, other.start_datetime,
                                                                           other.end_datetime)):
                player = db.session.get(Player, presence.player_id)
                clashes.append({"playerId": presence.player_id, "playerName": getattr(player, "name", None),
                                "lessonInstanceId": other.id, "title": other.title,
                                "start": other.start_datetime.isoformat()})
                break
    return clashes


def busy_same_hour(clashes: list[dict]) -> tuple[dict, int]:
    """The refusal body (rule 15): ``409 {code: busy_same_hour, clashes}``."""
    return {"code": "busy_same_hour", "message": "busy same hour", "clashes": clashes}, 409
