"""notifications.config rule 18, CONFIG-83 (owner, 2026-11-20: the old engine is retired).

A coach whose configuration row is created from now on starts on ``new``, switched at the row's
creation: a new coach (rule 17) and rule 1's row for a coach without one. Their first class is a
new-engine session with no old-engine job armed. A coach without a row whom the operator switches
still gets the whole switch: their existing occurrences are adopted.
"""
import json
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_engine_switch import LATER, _classes, _context, _instance  # noqa: F401 - the fixture
from padel_app.tests.test_pad916_engine_store import NOW, START
from padel_app.tests.test_pad921_cutover import pinned  # noqa: F401 - the fixture

#: The old engine's job families (rule 18's "No old jobs for a new-engine session").
OLD_JOBS = ("invite_start_", "reminder_", "ask_", "past_due_", "pastdue_", "decline_next_", "approval_now_")


def _config(coach_id):
    from padel_app.models.notification_config import NotificationConfig

    return NotificationConfig.query.filter_by(coach_id=coach_id).one()


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-83")
def test_a_coach_created_now_is_on_the_new_engine_and_their_first_class_is_a_new_engine_session(
        app, live_scheduler, pinned):  # noqa: F811
    from padel_app.models import EngineSession, Lesson, User
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.clubs import Club
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.services.coach_service import create_coach_service
    from padel_app.services.engine_switch import engine_for
    from padel_app.services.lesson_service import get_or_materialize_instance

    user = User(name="New Coach", username="config83_coach", password="pw123")
    db.session.add(user)
    db.session.commit()
    coach = create_coach_service({"user": user.id})

    config = _config(coach.id)
    assert (config.engine_version, config.engine_switched_at) == ("new", NOW)

    club = Club(name="Config83 Club", description="", location="Lisboa")
    db.session.add(club)
    db.session.flush()
    first = START + timedelta(days=7)
    level = CoachLevel.query.filter_by(coach_id=coach.id).first()
    lesson = Lesson(title="Weekly", start_datetime=first, end_datetime=first + timedelta(hours=1), is_recurring=True,
                    recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": [(first.weekday() + 1) % 7]}),
                    recurrence_end=(first + timedelta(weeks=4)).date(), type="academy", max_players=4, color="#000",
                    status="active", club_id=club.id, default_level_id=level.id)
    db.session.add(lesson)
    db.session.flush()
    db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
    db.session.commit()

    made = get_or_materialize_instance(lesson, first.date())
    assert db.session.get(EngineSession, made.id) is not None and engine_for(made) == "new"

    live_scheduler.schedule_lesson_reminder_jobs(lesson.id, coach.id, now=NOW)
    live_scheduler.schedule_instance_jobs(made.id, coach.id, now=NOW)
    armed = [j.id for j in live_scheduler._scheduler.get_jobs()
             if j.id.startswith(OLD_JOBS) and (f"_{lesson.id}_" in j.id or j.id.endswith(f"_{made.id}"))]
    assert armed == []


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-83")
def test_a_row_created_for_a_coach_without_one_is_on_the_new_engine(app, pinned):  # noqa: F811
    from padel_app.models import User
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.coach_service import create_coach_service
    from padel_app.services.notification_service import get_or_create_config

    user = User(name="No Row", username="config83_no_row", password="pw123")
    db.session.add(user)
    db.session.commit()
    coach_id = create_coach_service({"user": user.id}).id
    NotificationConfig.query.filter_by(coach_id=coach_id).delete()      # a coach without a row, no classes
    db.session.commit()

    config = get_or_create_config(coach_id)
    assert (config.engine_version, config.engine_switched_at) == ("new", NOW)
    db.session.expire_all()
    assert (_config(coach_id).engine_version, _config(coach_id).engine_switched_at) == ("new", NOW)


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-83")
def test_switching_a_coach_without_a_row_adopts_their_existing_occurrences(app, pinned):  # noqa: F811
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.engine_switch import engine_for, switch_coach

    _, coach_id, opened, not_opened = _classes(app)
    NotificationConfig.query.filter_by(coach_id=coach_id).delete()
    db.session.commit()

    adopted = switch_coach(coach_id, now=NOW)

    assert adopted == [not_opened]                      # existed at the switch, window not open: adopted
    assert engine_for(_instance(not_opened)) == "new"
    assert engine_for(_instance(opened)) == "old"       # its window had opened: it drains
    assert (_config(coach_id).engine_version, _config(coach_id).engine_switched_at) == ("new", NOW)


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-84")
def test_a_row_created_for_a_coach_with_classes_waits_on_old_for_the_switch(app, pinned):  # noqa: F811
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.engine_switch import engine_for, switch_coach
    from padel_app.services.notification_service import get_or_create_config

    _, coach_id, _, not_opened = _classes(app)
    NotificationConfig.query.filter_by(coach_id=coach_id).delete()
    db.session.commit()

    config = get_or_create_config(coach_id)             # an ordinary reader, before the operator's switch
    assert (config.engine_version, config.engine_switched_at) == ("old", None)
    assert engine_for(_instance(not_opened)) == "old"

    assert switch_coach(coach_id, now=NOW + timedelta(minutes=5)) == [not_opened]
    assert engine_for(_instance(not_opened)) == "new"
