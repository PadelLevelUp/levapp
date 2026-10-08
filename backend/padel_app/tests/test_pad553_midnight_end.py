"""PAD-553 (B-346): a class that ends at midnight ends at 00:00 of the NEXT day.

`build_datetime(date, "00:00")` put the end at the start of the class's own day, so a 22:00-00:00
class was stored ending before it began, and every "has it ended" reader treated it as over from
00:00. Only an end of exactly 00:00 after a later start moves; any other end at or before the start
is a typo the editors refuse (B-294) and is left as it is.
"""
from datetime import date, datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import PATCHES, _seed_coach_and_student
from padel_app.tests.test_pad259_enrolment import _materialise


def test_the_helper_moves_only_a_midnight_end():
    from padel_app.tools.calendar_tools import build_end_datetime

    assert build_end_datetime("2026-11-05", "22:00", "00:00") == "06/11/2026, 00:00"
    assert build_end_datetime("2026-11-05", "18:00", "17:00") == "05/11/2026, 17:00"  # B-294's, not ours
    assert build_end_datetime("2026-11-05", "18:00", "19:30") == "05/11/2026, 19:30"
    assert build_end_datetime("2026-11-05", "00:00", "00:00") == "05/11/2026, 00:00"


def _create(app, start, end, *, recurring=False):
    from padel_app.models.Association_CoachClub import Association_CoachClub
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.services.lesson_service import add_class_service

    ids = _seed_coach_and_student(app)
    with app.app_context():
        club = Club(name="Club", description="", location="City")
        db.session.add(club)
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=ids["coach_id"], club_id=club.id))
        db.session.commit()
        coach = db.session.get(Coach, ids["coach_id"])
        day = (datetime.utcnow() + timedelta(days=3)).date()
        data = {
            "name": "Late", "classType": "academy", "maxPlayers": 4, "date": day.isoformat(),
            "startTime": start, "endTime": end, "isRecurring": recurring, "playerIds": [],
        }
        if recurring:
            data.update({"recurrenceRule": {"frequency": "weekly", "daysOfWeek": [(day.weekday() + 1) % 7]},
                         "endDate": (day + timedelta(weeks=3)).isoformat()})
        with patch(PATCHES[0]), patch(PATCHES[1]), patch("padel_app.utils.expo_push.send_expo_push_to_user"), \
                patch("padel_app.scheduler._maybe_schedule_lesson"):
            lesson = add_class_service(data, coach, club)
        return lesson.id, day


def test_a_class_created_22_to_midnight_ends_the_next_day(app):
    from padel_app.models import Lesson

    lesson_id, day = _create(app, "22:00", "00:00")
    with app.app_context():
        lesson = db.session.get(Lesson, lesson_id)
        assert lesson.start_datetime == datetime.combine(day, datetime.min.time()) + timedelta(hours=22)
        assert lesson.end_datetime == datetime.combine(day + timedelta(days=1), datetime.min.time())


def test_a_backwards_end_is_left_for_b294(app):
    from padel_app.models import Lesson

    lesson_id, day = _create(app, "18:00", "17:00")
    with app.app_context():
        lesson = db.session.get(Lesson, lesson_id)
        assert lesson.end_datetime == datetime.combine(day, datetime.min.time()) + timedelta(hours=17)


def test_an_occurrence_of_a_midnight_series_ends_after_it_starts(app):
    from padel_app.models import LessonInstance

    lesson_id, day = _create(app, "23:00", "00:00", recurring=True)
    instance_id = _materialise(app, lesson_id, day + timedelta(weeks=1))
    with app.app_context():
        inst = db.session.get(LessonInstance, instance_id)
        assert inst.end_datetime > inst.start_datetime
        assert inst.end_datetime - inst.start_datetime == timedelta(hours=1)


def test_an_imported_midnight_class_ends_the_next_day(app):
    """The class import builds its end with the same helper (classes.create rule 8c)."""
    from padel_app.services import import_service

    src = open(import_service.__file__).read()
    assert 'build_end_datetime(day, row.get("start_time"), row.get("end_time"))' in src
    assert 'build_datetime(day, row.get("end_time"))' not in src
