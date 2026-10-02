"""
PAD-478 part 2 (notifications.config rule 10f; owner's decision 2026-10-02).

A timing save can leave upcoming classes whose reminder time, under the saved configuration,
is already past. The save sends nothing for them. It LISTS them, the form asks the coach, and
only an explicit yes sends, through the ordinary reminder pass.

Two entry points, one predicate. `past_due` answers the question the coach is asked;
`send_past_due` checks every requested class again with that same predicate before it
sends, for the calling coach only. Nothing here is called at startup or by the daily pass.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from padel_app.models import Lesson, LessonInstance
from padel_app.utils import dates
from padel_app.utils.dates import utc_to_wall_naive, wall_to_utc_naive

# The clock is read as `dates.utcnow_naive()`, through the module, not bound by name: this
# module is imported lazily, and a module first imported while a test has the clock pinned
# would otherwise keep that test's frozen time for the rest of the session.

# How far ahead a class can be and still have a reminder time in the past: the form allows
# at most 30 days (days before) or 168 hours (hours before).
_LOOKAHEAD = timedelta(days=32)


def _saved_config(coach_id: int):
    """The coach's configuration as saved, read without creating one."""
    from padel_app.models.notification_config import NotificationConfig

    return NotificationConfig.query.filter_by(coach_id=coach_id).first() or NotificationConfig(coach_id=coach_id)


def _send_time(wall_start: datetime, restrictions: dict, now: datetime) -> datetime | None:
    """When a confirmed past-due reminder would go: now, or the end of the coach's quiet hours
    (`notifications.reminders` rule 18: deferred forward, never back). ``None`` when the class
    starts before that."""
    from padel_app.services.notification_service import _next_quiet_hours_end

    when = now
    if restrictions.get("quietHours", {}).get("enabled"):
        when = _next_quiet_hours_end(now, restrictions)
    if when >= wall_to_utc_naive(wall_start):
        return None
    return when


def _iso_utc(when: datetime) -> str:
    return when.strftime("%Y-%m-%dT%H:%M:%SZ")


def _candidates(coach_id: int, now: datetime) -> list[dict]:
    """Every class the coach could be asked about, with what a yes would do."""
    from padel_app.models import Association_CoachLesson, Association_CoachLessonInstance
    from padel_app.models.coaches import Coach
    from padel_app.scheduler import _fire_time_utc, _lesson_primary_coach_id
    from padel_app.services.lesson_service import primary_coach
    from padel_app.services.notification_service import _reminder_recipients
    from padel_app.sql_db import db

    coach = db.session.get(Coach, coach_id)
    if coach is None:
        return []
    config = _saved_config(coach_id)
    timing = config.get_reminder_timing()
    restrictions = config.get_restrictions()
    wall_now = utc_to_wall_naive(now)
    found: list[dict] = []
    seen_instances: set[int] = set()

    def consider_instance(instance) -> None:
        if instance.id in seen_instances:
            return
        seen_instances.add(instance.id)
        if instance.status in ("canceled", "completed") or instance.start_datetime is None:
            return
        if instance.start_datetime <= wall_now:
            return
        primary = primary_coach(instance)
        if primary is None or primary.id != coach_id:
            return
        fire = _fire_time_utc(instance.start_datetime, timing)
        if fire is None or fire > now:
            return
        when = _send_time(instance.start_datetime, restrictions, now)
        if when is None:
            return
        # The same list the pass itself sends to, judged at the moment it would run.
        due, _blocked = _reminder_recipients(instance, config, coach.user_id, when, scheduled=True)
        if not due:
            return
        found.append({
            "key": f"i:{instance.id}",
            "title": instance.lesson.title if instance.lesson else "",
            "startsAt": instance.start_datetime.isoformat(),
            "students": len(due),
            "_when": when,
            "_instance_id": instance.id,
        })

    # Materialised classes: the coach's own rows, and the instances of their lessons.
    own = (
        LessonInstance.query
        .join(Association_CoachLessonInstance,
              LessonInstance.id == Association_CoachLessonInstance.lesson_instance_id)
        .filter(Association_CoachLessonInstance.coach_id == coach_id,
                LessonInstance.start_datetime > wall_now,
                LessonInstance.start_datetime <= wall_now + _LOOKAHEAD)
        .all()
    )
    for instance in own:
        consider_instance(instance)

    lessons = (
        Lesson.query
        .join(Association_CoachLesson, Lesson.id == Association_CoachLesson.lesson_id)
        .filter(Association_CoachLesson.coach_id == coach_id, Lesson.status == "active")
        .all()
    )
    for lesson in lessons:
        materialised = {}
        for inst in LessonInstance.query.filter_by(lesson_id=lesson.id).all():
            key = inst.original_lesson_occurence_date or (
                inst.start_datetime.date() if inst.start_datetime else None
            )
            if key is not None:
                materialised[key] = inst
        for occ in lesson.occurrences_between(wall_now, wall_now + _LOOKAHEAD):
            occ_wall = occ.replace(tzinfo=None) if occ.tzinfo else occ
            instance = materialised.get(occ_wall.date())
            if instance is not None:
                consider_instance(instance)
                continue
            # Not materialised yet: nobody can have been reminded, and listing must not
            # write. It is past due when the lesson's primary coach is this coach, the time
            # is past, and there is a roster to remind.
            if _lesson_primary_coach_id(lesson.id) != coach_id or occ_wall <= wall_now:
                continue
            fire = _fire_time_utc(occ_wall, timing)
            if fire is None or fire > now:
                continue
            when = _send_time(occ_wall, restrictions, now)
            roster = len(list(lesson.players_relations))
            if when is None or roster == 0:
                continue
            found.append({
                "key": f"o:{lesson.id}:{occ_wall.date().isoformat()}",
                "title": lesson.title,
                "startsAt": occ_wall.isoformat(),
                "students": roster,
                "_when": when,
                "_lesson_id": lesson.id,
                "_date": occ_wall.date(),
            })

    found.sort(key=lambda c: c["startsAt"])
    return found


def _public(candidate: dict) -> dict:
    return {k: v for k, v in candidate.items() if not k.startswith("_")}


def past_due(coach_id: int, *, now: datetime | None = None) -> dict:
    """What the form asks the coach about. Reads only: writes nothing, sends nothing."""
    _now = now or dates.utcnow_naive()
    candidates = _candidates(coach_id, _now)
    deferred = [c["_when"] for c in candidates if c["_when"] > _now]
    return {
        "reminders": [_public(c) for c in candidates],
        "quietUntil": _iso_utc(min(deferred)) if deferred else None,
    }


def send_past_due(coach_id: int, keys, *, now: datetime | None = None) -> dict:
    """The coach's explicit yes. Every key is checked again against what is past due for
    THIS coach now; anything else is skipped and reported. Each class gets the ordinary
    reminder pass (count, spacing and PAD-407's lock apply), so a repeated request sends
    nothing more. Inside quiet hours the pass is armed for their end instead."""
    from padel_app import scheduler
    from padel_app.services.lesson_service import get_or_materialize_instance
    from padel_app.sql_db import db

    _now = now or dates.utcnow_naive()
    by_key = {c["key"]: c for c in _candidates(coach_id, _now)}
    sent = 0
    scheduled_for: datetime | None = None
    classes: list[dict] = []
    skipped: list[dict] = []

    for key in dict.fromkeys(str(k) for k in (keys or [])):
        candidate = by_key.get(key)
        if candidate is None:
            skipped.append({"key": key, "reason": "not_past_due"})
            continue

        instance_id = candidate.get("_instance_id")
        if instance_id is None:
            # Materialise it as its own reminder job would, without arming a late-arrival
            # ask per enrolled student (PAD-407): this pass asks the whole roster.
            lesson = db.session.get(Lesson, candidate["_lesson_id"])
            with scheduler._asks_suppressed():
                instance_id = get_or_materialize_instance(lesson, candidate["_date"]).id

        when = candidate["_when"]
        if when > _now:
            scheduler.arm_past_due_pass(instance_id, when)
            scheduled_for = when if scheduled_for is None else min(scheduled_for, when)
            classes.append({"key": key, "sent": 0, "scheduledFor": _iso_utc(when)})
            continue

        result = scheduler.run_reminder_pass(instance_id) or {}
        sent += int(result.get("sent", 0))
        classes.append({"key": key, "sent": int(result.get("sent", 0)), "scheduledFor": None})

    return {
        "sent": sent,
        "scheduledFor": _iso_utc(scheduled_for) if scheduled_for else None,
        "classes": classes,
        "skipped": skipped,
    }
