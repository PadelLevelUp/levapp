"""attendance.validation rule 30 (PAD-829): the E2E fixture of ended classes.

`POST /api/app/debug/ended-classes` gives the calling coach a day of ended classes, every roster
player on them confirmed, so each one is "ready to confirm" in the validate view and the list is
long enough to drag. Maestro flow 323 confirms them and drags the list; `DELETE` removes them.
Only the debug route calls this, and only under E2E_DEBUG_ENDPOINTS.
"""
from datetime import datetime, timedelta, timezone

from padel_app.models.Association_CoachClub import Association_CoachClub
from padel_app.models.Association_CoachLesson import Association_CoachLesson
from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
from padel_app.models.lesson_instances import LessonInstance
from padel_app.models.lessons import Lesson
from padel_app.models.presences import Presence
from padel_app.services.lesson_service import enrol
from padel_app.sql_db import db

TITLE_PREFIX = "E2E Ended Class "
MAX_ENDED_CLASSES = 30
MAX_WEEKS_AGO = 8
PLAYERS_PER_CLASS = 4
# The classes sit on the day exactly `weeksAgo` weeks before today, from 06:00 in half-hour
# steps: one calendar day, so they land in the same week whatever the client's week start, and
# a day in the past, so every one has ended whatever the clock says now.
FIRST_START_HOUR = 6
CLASS_MINUTES = 30


def _now_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def create_ended_classes(coach, *, count, weeks_ago, now=None):
    """`count` ended classes for `coach`, `weeks_ago` weeks back. Returns their instance ids in
    start order (the first id is the earliest class) and the day they sit on."""
    now = now or _now_naive()
    day = (now - timedelta(days=7 * weeks_ago)).replace(
        hour=FIRST_START_HOUR, minute=0, second=0, microsecond=0
    )
    club = Association_CoachClub.query.filter_by(coach_id=coach.id).first()
    roster = (
        Association_CoachPlayer.query.filter_by(coach_id=coach.id)
        .order_by(Association_CoachPlayer.player_id)
        .limit(PLAYERS_PER_CLASS)
        .all()
    )
    ids = []
    for i in range(count):
        start = day + timedelta(minutes=CLASS_MINUTES * i)
        end = start + timedelta(minutes=CLASS_MINUTES)
        lesson = Lesson(
            title=f"{TITLE_PREFIX}{i + 1:02d}",
            start_datetime=start,
            end_datetime=end,
            is_recurring=False,
            type="academy",
            max_players=PLAYERS_PER_CLASS,
            club_id=club.club_id if club else None,
            color="#0ea5e9",
            status="active",
        )
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
        instance = LessonInstance(
            lesson_id=lesson.id,
            start_datetime=start,
            end_datetime=end,
            max_players=PLAYERS_PER_CLASS,
            status="scheduled",
            level_id=roster[0].level_id if roster else None,
            notifications_enabled=False,
            original_lesson_occurence_date=start.date(),
        )
        db.session.add(instance)
        db.session.flush()
        db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=instance.id))
        for rel in roster:
            # Confirmed, so the class is "ready to confirm" (every player answered).
            enrol(rel.player_id, instance, "roster", invited=True, confirmed=True)
        ids.append(instance.id)
    db.session.commit()
    return {"lessonInstanceIds": ids, "day": day.date().isoformat()}


def delete_ended_classes(coach):
    """Removes every class this module created for `coach`. Returns how many."""
    lessons = (
        Lesson.query.join(Association_CoachLesson, Association_CoachLesson.lesson_id == Lesson.id)
        .filter(Association_CoachLesson.coach_id == coach.id)
        .filter(Lesson.title.like(TITLE_PREFIX + "%"))
        .all()
    )
    lesson_ids = [lesson.id for lesson in lessons]
    if not lesson_ids:
        return {"deleted": 0}
    instance_ids = [
        row.id for row in LessonInstance.query.filter(LessonInstance.lesson_id.in_(lesson_ids)).all()
    ]
    if instance_ids:
        Presence.query.filter(Presence.lesson_instance_id.in_(instance_ids)).delete(synchronize_session=False)
        Association_CoachLessonInstance.query.filter(
            Association_CoachLessonInstance.lesson_instance_id.in_(instance_ids)
        ).delete(synchronize_session=False)
        LessonInstance.query.filter(LessonInstance.id.in_(instance_ids)).delete(synchronize_session=False)
    Association_CoachLesson.query.filter(Association_CoachLesson.lesson_id.in_(lesson_ids)).delete(
        synchronize_session=False
    )
    Lesson.query.filter(Lesson.id.in_(lesson_ids)).delete(synchronize_session=False)
    db.session.commit()
    return {"deleted": len(lesson_ids)}
