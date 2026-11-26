"""PAD-772 (calendar.student-blockers rules 22-23): the student's yes to "mark the classes my block covers".

``decline_covered`` never trusts the list the client sends. The covered set is read again from the
student's blockers as stored now (`blocker_covered_service`, rule 19); each entry that is in it is
declined through the student's own decline path, ``cancel_attendance`` (attendance.confirm rules 5,
13, 14, 18, 30), with the one new source. Every other entry is skipped with a reason and writes nothing.

Each entry runs in its own savepoint with the student's presence row locked before the re-check, so
a repeated or parallel yes for the same class declines it once: the second finds it declined and
skips it as ``already_answered`` (the lock holds until the first entry's commit).
"""
from datetime import date, datetime, time, timedelta

from flask import abort
from werkzeug.exceptions import HTTPException

from padel_app.models import Association_PlayerLesson, LessonInstance, Player, Presence
from padel_app.models.lessons import Lesson
from padel_app.models.presences import DECLINE_SOURCE_AVAILABILITY_BLOCK
from padel_app.services.blocker_covered_service import covered_for_blocks
from padel_app.services.notification_service import cancel_attendance
from padel_app.sql_db import db
from padel_app.tools.unit_of_work import unit_of_work
from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive

MAX_ENTRIES = 200  # calendar.student-blockers rule 22: one call asks about at most this many classes
REASONS = ("not_covered", "not_enrolled", "started", "already_answered")


def _key(entry):
    return (entry["model"], entry["originalId"], entry["date"])


def _parse(raw):
    """``(model, originalId, date)`` of a well-formed entry, else None."""
    if not isinstance(raw, dict):
        return None
    model, original_id, day = raw.get("model"), raw.get("originalId"), raw.get("date")
    if model not in ("Lesson", "LessonInstance"):
        return None
    try:
        return {"model": model, "originalId": int(original_id), "date": date.fromisoformat(str(day)).isoformat()}
    except (TypeError, ValueError):
        return None


def _diagnose(player, entry, now_wall):
    """Why an entry that is not covered fails, in rule 22's order, reading only."""
    day = date.fromisoformat(entry["date"])
    if entry["model"] == "LessonInstance":
        instance = db.session.get(LessonInstance, entry["originalId"])
        presence = (
            Presence.query.filter_by(player_id=player.id, lesson_instance_id=instance.id).first() if instance else None
        )
        if presence is None:
            return "not_enrolled"
        if instance.start_datetime is not None and now_wall >= instance.start_datetime:
            return "started"
        if presence.validated or presence.attendance_state not in ("planned", "coming"):
            return "already_answered"
        return "not_covered"
    lesson = db.session.get(Lesson, entry["originalId"])
    if lesson is None or Association_PlayerLesson.query.filter_by(player_id=player.id, lesson_id=lesson.id).first() is None:
        return "not_enrolled"
    produced = [o for o in lesson.occurrences_between(datetime.combine(day, time.min), datetime.combine(day, time.min) + timedelta(days=1)) if o.date() == day]
    if not produced:
        return "not_enrolled"
    if now_wall >= produced[0].replace(tzinfo=None):
        return "started"
    existing = LessonInstance.query.filter_by(lesson_id=lesson.id, original_lesson_occurence_date=day).first()
    if existing is not None:
        presence = Presence.query.filter_by(player_id=player.id, lesson_instance_id=existing.id).first()
        if presence is None:
            return "not_enrolled"
        if presence.validated or presence.attendance_state not in ("planned", "coming"):
            return "already_answered"
    return "not_covered"


def _decline_one(user, player, entry):
    """One covered entry, inside its savepoint. Returns ``("declined", instance_id)`` or ``("skipped", reason)``."""
    from padel_app.services.lesson_service import get_or_materialize_instance

    day = date.fromisoformat(entry["date"])
    if entry["model"] == "Lesson":
        lesson = db.session.get(Lesson, entry["originalId"])
        instance = get_or_materialize_instance(lesson, day)
    else:
        instance = db.session.get(LessonInstance, entry["originalId"])
    if instance is None:
        return "skipped", "not_enrolled"
    # The row locks, instance first (the engine's store locks the instance row, so a tick at the same moment
    # takes them in the same order); a parallel yes for this class waits here until this entry has committed.
    LessonInstance.query.filter_by(id=instance.id).with_for_update().populate_existing().first()
    presence = (
        Presence.query.filter_by(player_id=player.id, lesson_instance_id=instance.id)
        .with_for_update().populate_existing().first()
    )
    if presence is None:
        return "skipped", "not_enrolled"
    if presence.validated or presence.attendance_state not in ("planned", "coming"):
        return "skipped", "already_answered"
    try:
        cancel_attendance(user.id, lesson_instance_id=instance.id, source=DECLINE_SOURCE_AVAILABILITY_BLOCK)
    except HTTPException as exc:  # 409: the class started meanwhile; 403: no enrolment
        return "skipped", "started" if exc.code == 409 else "not_enrolled"
    return "declined", instance.id


def decline_covered(user, occurrences):
    """Rule 22: ``{declined: [...], skipped: [...]}`` for the entries a student said yes to."""
    if isinstance(occurrences, list) and len(occurrences) > MAX_ENTRIES:
        abort(400, description=f"At most {MAX_ENTRIES} classes in one call.")
    player = Player.query.filter_by(user_id=user.id).first()
    stored = [b for b in _stored_blockers(user.id)]
    covered = {_key(c) for c in covered_for_blocks(user, stored)} if stored else set()
    now_wall = utc_to_wall_naive(utcnow_naive())

    declined, skipped, seen = [], [], set()
    for raw in occurrences if isinstance(occurrences, list) else []:
        entry = _parse(raw)
        if entry is None:
            skipped.append({"model": (raw or {}).get("model") if isinstance(raw, dict) else None,
                            "originalId": (raw or {}).get("originalId") if isinstance(raw, dict) else None,
                            "date": (raw or {}).get("date") if isinstance(raw, dict) else None, "reason": "not_covered"})
            continue
        if _key(entry) in seen:
            continue
        seen.add(_key(entry))
        if _key(entry) not in covered:
            skipped.append({**entry, "reason": _diagnose(player, entry, now_wall)})
            continue
        # One unit of work per entry: the decline path's saves flush, and the entry commits once at the end
        # (the row lock holds until then). Its own savepoint rolls back only this entry on a refusal.
        with unit_of_work():
            savepoint = db.session.begin_nested()
            try:
                outcome, value = _decline_one(user, player, entry)
            except BaseException:
                if savepoint.is_active:
                    savepoint.rollback()
                raise
            if outcome == "declined":
                if savepoint.is_active:
                    savepoint.commit()
            elif savepoint.is_active:
                savepoint.rollback()
        if outcome == "declined":
            declined.append({**entry, "lessonInstanceId": value})
        else:
            skipped.append({**entry, "reason": value})
    return {"declined": declined, "skipped": skipped}


def _stored_blockers(user_id):
    from padel_app.services.student_availability_service import list_student_blockers

    return list_student_blockers(user_id)
