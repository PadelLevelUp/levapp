"""PAD-474 (classes.edit rule 9): `updates.addPlayers` / `updates.removePlayers` on
POST /edit_class are routed by `scope`. "single" (this occurrence) writes or
deletes the occurrence's Presence row only; "future" (this and following) puts
the player on the series roster (Association_PlayerLesson of the lesson the edit
lands on)."""
import json
from datetime import datetime, timedelta
from unittest.mock import patch

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import PATCHES, _seed_coach_and_student
from padel_app.tests.test_pad259_enrolment import _extra_player, _materialise


def _seed_weekly_series(app, coach_id, player_ids):
    """A weekly recurring lesson starting tomorrow, roster = ``player_ids``."""
    from padel_app.models import Association_CoachLesson, Association_PlayerLesson, Club, Lesson

    with app.app_context():
        club = Club(name="Club", description="", location="City")
        db.session.add(club)
        db.session.flush()
        start = datetime.utcnow().replace(minute=0, second=0, microsecond=0) + timedelta(days=1)
        lesson = Lesson(
            title="Weekly class", start_datetime=start, end_datetime=start + timedelta(hours=1),
            is_recurring=True,
            recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": [(start.weekday() + 1) % 7]}),
            recurrence_end=(start + timedelta(weeks=6)).date(),
            type="academy", max_players=4, color="#000", status="active", club_id=club.id,
        )
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=lesson.id))
        for pid in player_ids:
            db.session.add(Association_PlayerLesson(player_id=pid, lesson_id=lesson.id))
        db.session.commit()
        return lesson.id, start.date()


def _roster(lesson_id):
    from padel_app.models import Association_PlayerLesson

    return {r.player_id for r in Association_PlayerLesson.query.filter_by(lesson_id=lesson_id).all()}


def _presences(instance_id):
    from padel_app.models import Presence

    return {p.player_id for p in Presence.query.filter_by(lesson_instance_id=instance_id).all()}


def _edit(app, instance_id, day, scope, updates):
    from padel_app.services.lesson_service import edit_class_service

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]), \
            patch("padel_app.utils.expo_push.send_expo_push_to_user"), \
            patch("padel_app.scheduler._maybe_schedule_instance"), \
            patch("padel_app.scheduler.cancel_lesson_reminder_jobs"), \
            patch("padel_app.scheduler.schedule_lesson_reminder_jobs"), \
            patch("padel_app.scheduler.prune_lesson_reminder_jobs"), \
            patch("padel_app.scheduler.move_lesson_reminder_jobs"):
        result, status = edit_class_service({
            "event": {"model": "LessonInstance", "originalId": instance_id, "date": day.isoformat()},
            "scope": scope,
            "updates": updates,
        })
        db.session.commit()
        return result, status


def _setup(app):
    ids = _seed_coach_and_student(app)
    bruno = _extra_player(app, "Bruno")
    lesson_id, day = _seed_weekly_series(app, ids["coach_id"], [ids["student_id"]])
    instance_id = _materialise(app, lesson_id, day)
    return ids["student_id"], bruno, lesson_id, instance_id, day


def test_single_scope_add_enrols_the_occurrence_only(app):
    ana, bruno, lesson_id, instance_id, day = _setup(app)
    result, status = _edit(app, instance_id, day, "single", {"addPlayers": [bruno]})
    assert status == 200, result
    with app.app_context():
        assert bruno in _presences(instance_id)
        assert bruno not in _roster(lesson_id)
        assert ana in _roster(lesson_id)


def test_future_scope_add_puts_the_player_on_the_series_roster(app):
    ana, bruno, lesson_id, instance_id, day = _setup(app)
    result, status = _edit(app, instance_id, day, "future", {"addPlayers": [bruno]})
    assert status == 201, result
    # First occurrence: event date == lesson start date, so no fork — the edit
    # lands on the original lesson. Asserted via the returned id.
    assert result["id"] == lesson_id
    with app.app_context():
        assert bruno in _roster(result["id"])
        assert ana in _roster(result["id"])


def test_single_scope_remove_drops_the_occurrence_enrolment_only(app):
    ana, bruno, lesson_id, instance_id, day = _setup(app)
    with app.app_context():
        assert ana in _presences(instance_id)
    result, status = _edit(app, instance_id, day, "single", {"removePlayers": [ana]})
    assert status == 200, result
    with app.app_context():
        assert ana not in _presences(instance_id)
        assert ana in _roster(lesson_id)
