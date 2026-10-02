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

MAX_KEYS = 200


def _lookahead(timing: dict) -> timedelta:
    """How far ahead a class can start and still have its reminder time in the past: the
    timing's own offset. A class further away than that cannot be past due, so it is never
    loaded."""
    if timing.get("type") == "hours_before":
        return timedelta(hours=int(timing.get("value", 24)))
    if timing.get("type") in ("days_before", "days_before_at_time"):
        return timedelta(days=int(timing.get("days", 1)) + 1)
    return timedelta(0)


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
    """Every class the coach could be asked about, with what a yes would do.

    Cost (review of #499): only classes that start inside the timing's own offset are loaded
    (never a lesson's past instances), the primary coach of every loaded class comes from two
    queries in all, and the per-student questions are asked only for a class whose reminder
    time really is past.
    """
    from sqlalchemy import and_, or_

    from padel_app.models import Association_CoachLesson, Association_CoachLessonInstance
    from padel_app.models.coaches import Coach
    from padel_app.scheduler import _fire_time_utc
    from padel_app.services.notification_service import _reminder_recipients
    from padel_app.sql_db import db

    coach = db.session.get(Coach, coach_id)
    if coach is None:
        return []
    config = _saved_config(coach_id)
    timing = config.get_reminder_timing()
    restrictions = config.get_restrictions()
    wall_now = utc_to_wall_naive(now)
    window_end = wall_now + _lookahead(timing)
    if window_end <= wall_now:
        return []

    # The coach's lessons (one query), then every class in the window that is theirs through
    # its own coach row or through one of those lessons (one query).
    lesson_rows = (
        db.session.query(Association_CoachLesson.lesson_id)
        .filter(Association_CoachLesson.coach_id == coach_id)
        .all()
    )
    lesson_ids = [row.lesson_id for row in lesson_rows]
    own_instance_ids = db.session.query(Association_CoachLessonInstance.lesson_instance_id).filter(
        Association_CoachLessonInstance.coach_id == coach_id
    )
    in_window = or_(
        and_(LessonInstance.start_datetime > wall_now, LessonInstance.start_datetime <= window_end),
        and_(LessonInstance.original_lesson_occurence_date >= wall_now.date(),
             LessonInstance.original_lesson_occurence_date <= window_end.date()),
    )
    reach = [LessonInstance.id.in_(own_instance_ids)]
    if lesson_ids:
        reach.append(LessonInstance.lesson_id.in_(lesson_ids))
    instances = LessonInstance.query.filter(in_window, or_(*reach)).all()

    # Primary coach of each: its own first coach row, else its lesson's first (two queries).
    own_primary: dict[int, int] = {}
    if instances:
        for row in (
            db.session.query(Association_CoachLessonInstance)
            .filter(Association_CoachLessonInstance.lesson_instance_id.in_([i.id for i in instances]))
            .order_by(Association_CoachLessonInstance.id.asc())
        ):
            own_primary.setdefault(row.lesson_instance_id, row.coach_id)
    lesson_primary: dict[int, int] = {}
    wanted_lessons = set(lesson_ids) | {i.lesson_id for i in instances}
    if wanted_lessons:
        for row in (
            db.session.query(Association_CoachLesson)
            .filter(Association_CoachLesson.lesson_id.in_(wanted_lessons))
            .order_by(Association_CoachLesson.id.asc())
        ):
            lesson_primary.setdefault(row.lesson_id, row.coach_id)

    # What the per-student questions need, read once for every class in the window instead of
    # once per student: the counted attempts, and the students themselves (loaded into the
    # session, so the per-class code finds them there).
    from sqlalchemy.orm import joinedload

    from padel_app.models import Player
    from padel_app.models.presences import Presence
    from padel_app.services import reminder_attempt_service as attempts

    instance_ids = [i.id for i in instances]
    sent_counts = attempts.count_attempts_bulk(instance_ids)
    if instance_ids:
        player_ids = {
            row.player_id
            for row in db.session.query(Presence.player_id).filter(Presence.lesson_instance_id.in_(instance_ids))
        }
        if player_ids:
            _held = Player.query.options(joinedload(Player.user)).filter(Player.id.in_(player_ids)).all()  # noqa: F841 — kept alive for the identity map

    found: list[dict] = []
    materialised: dict[tuple[int, object], LessonInstance] = {}
    for instance in instances:
        key = instance.original_lesson_occurence_date or (
            instance.start_datetime.date() if instance.start_datetime else None
        )
        if key is not None:
            materialised[(instance.lesson_id, key)] = instance

        if instance.status in ("canceled", "completed") or instance.start_datetime is None:
            continue
        if instance.start_datetime <= wall_now:
            continue
        if own_primary.get(instance.id, lesson_primary.get(instance.lesson_id)) != coach_id:
            continue
        fire = _fire_time_utc(instance.start_datetime, timing)
        if fire is None or fire > now:
            continue
        when = _send_time(instance.start_datetime, restrictions, now)
        if when is None:
            continue
        # The same list the pass itself sends to, judged at the moment it would run.
        due, _blocked = _reminder_recipients(
            instance, config, coach.user_id, when, scheduled=True, sent_counts=sent_counts,
        )
        if not due:
            continue
        found.append({
            "key": f"i:{instance.id}",
            "title": instance.lesson.title if instance.lesson else "",
            "startsAt": instance.start_datetime.isoformat(),
            "students": len(due),
            "_when": when,
            "_instance_id": instance.id,
        })

    # Classes not materialised yet: nobody can have been reminded, and listing must not
    # write. Past due when the lesson's primary coach is this coach, the time is past, and
    # there is a roster to remind.
    my_lessons = [lid for lid in lesson_ids if lesson_primary.get(lid) == coach_id]
    lessons = Lesson.query.filter(Lesson.id.in_(my_lessons), Lesson.status == "active").all() if my_lessons else []
    for lesson in lessons:
        roster = None
        for occ in lesson.occurrences_between(wall_now, window_end):
            occ_wall = occ.replace(tzinfo=None) if occ.tzinfo else occ
            if (lesson.id, occ_wall.date()) in materialised or occ_wall <= wall_now:
                continue
            fire = _fire_time_utc(occ_wall, timing)
            if fire is None or fire > now:
                continue
            when = _send_time(occ_wall, restrictions, now)
            if when is None:
                continue
            if roster is None:
                roster = len(list(lesson.players_relations))
            if roster == 0:
                break
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
    # A count, never the keys: a class that is not the caller's, or does not exist, is not
    # named back, and every reason for skipping looks the same from outside.
    skipped = 0

    for key in dict.fromkeys(str(k) for k in (keys or [])):
        candidate = by_key.get(key)
        if candidate is None:
            skipped += 1
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
