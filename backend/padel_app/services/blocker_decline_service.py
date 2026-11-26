"""PAD-772 (calendar.student-blockers rules 19-25): a student's availability block marks the classes it covers.

``mark_saved`` runs after a blocker save has been committed: the covered set of the saved rows minus the
covered set of the same rows before the write (`blocker_covered_service`, rules 19-20) is declined, one
occurrence at a time, through the student's own decline path, ``cancel_attendance`` (attendance.confirm
rules 5, 13, 14, 18, 30), with the one new source. An occurrence that fails is logged and left; the block
stays saved and the others are still marked (rule 19).

``decline_covered`` is the legacy call of rule 25. It never trusts the list the client sends: the covered
set is read again from the student's blockers as stored now; each entry that is in it is declined the same
way. Every other entry is skipped with a reason and writes nothing.

Each entry runs in its own savepoint with the class's instance row and then the student's presence row
locked before the re-check, so a repeated or parallel mark for the same class declines it once: the
second finds it declined and skips it as ``already_answered`` (the lock holds until the first entry's commit).
"""
import logging

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


def _entry_on_new_engine(entry):
    """Is the entry's occurrence run by the new engine (an ``engine_sessions`` row, or, for an occurrence
    not yet materialised, a series whose coach is on ``new``)?"""
    from padel_app.models import EngineSession
    from padel_app.services.engine_entry import _series_is_new_engine

    if entry["model"] == "LessonInstance":
        return db.session.get(EngineSession, entry["originalId"]) is not None
    lesson = db.session.get(Lesson, entry["originalId"])
    if lesson is None:
        return False
    existing = LessonInstance.query.filter_by(
        lesson_id=lesson.id, original_lesson_occurence_date=date.fromisoformat(entry["date"])).first()
    if existing is not None:
        return db.session.get(EngineSession, existing.id) is not None
    return _series_is_new_engine(lesson)


def _run_new_engine_entry(user, player, entry):
    """A new-engine entry runs outside the unit of work: the engine commits its own unit (the absence is
    durable) and only then sends its outbox, as for the student's own No. The row locks the entry takes are
    released by those commits; the re-check before the decline has already decided (rule 22)."""
    try:
        outcome, value = _decline_one(user, player, entry)
    except BaseException:
        db.session.rollback()
        raise
    if outcome == "declined":
        db.session.commit()
    else:
        db.session.rollback()  # release the locks, change nothing
    return outcome, value


def _run_entry(user, player, entry):
    """One covered entry in its own unit of work and savepoint: ``("declined", instance_id)`` or
    ``("skipped", reason)``. Anything unexpected is raised after rolling back only this entry."""
    if _entry_on_new_engine(entry):
        return _run_new_engine_entry(user, player, entry)
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
    return outcome, value


def mark_saved(user, before, after):
    """Rules 19-20, 22: mark what the saved block rows (``after``) newly cover compared with the same rows
    as they were (``before``, snapshots; none for a new block) and return those occurrences as the save's
    ``markedClasses``, ordered by start. Call it once the block is committed: an occurrence that fails is
    logged with its ``(model, originalId, date)`` and left, and never unsaves the block."""
    from padel_app.services.blocker_covered_service import covered_for_blocks, newly_covered

    # The block is committed already: nothing here may fail the save (the client would retry and duplicate
    # it). Reading what it covers is guarded like each occurrence's decline: a failure is logged and the save
    # answers its ordinary success with no marked class.
    try:
        player = Player.query.filter_by(user_id=user.id).first()
        if player is None or not after:
            return []
        covered = covered_for_blocks(user, after)
        newly = newly_covered(covered, covered_for_blocks(user, before) if before else [])
    except Exception:
        db.session.rollback()
        logging.getLogger(__name__).exception("PAD-772: reading the classes a saved block covers failed; the block stays saved")
        return []
    marked = []
    for item in newly:
        entry = {"model": item["model"], "originalId": item["originalId"], "date": item["date"]}
        try:
            outcome, value = _run_entry(user, player, entry)
        except Exception:
            logging.getLogger(__name__).exception(
                "PAD-772: marking %s %s on %s failed; the block stays saved", entry["model"], entry["originalId"], entry["date"])
            continue
        if outcome == "declined":
            marked.append({**item, "lessonInstanceId": value})
    return marked


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
        outcome, value = _run_entry(user, player, entry)
        if outcome == "declined":
            declined.append({**entry, "lessonInstanceId": value})
        else:
            skipped.append({**entry, "reason": value})
    return {"declined": declined, "skipped": skipped}


def _stored_blockers(user_id):
    from padel_app.services.student_availability_service import list_student_blockers

    return list_student_blockers(user_id)
