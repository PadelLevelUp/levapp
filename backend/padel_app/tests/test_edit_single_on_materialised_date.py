"""B-046 / PAD-303 follow-up: editing "this occurrence" of a Lesson on a date
that ALREADY has a materialised instance must edit that instance, not create a
second one.

The web sheet keeps event.model="Lesson" after confirming attendance (the same
seam as PAD-335's delete fix), so an edit can arrive as model=Lesson,
scope=single on a materialised date. The Lesson branch called
create_lesson_instance_helper with no lookup: before #228 that silently
duplicated the occurrence (B-046); with uq_lesson_instance_occurrence live it
raises IntegrityError and the request 500s.

Covered spec: classes.edit (single occurrence), classes.instances rule 9.
"""
from datetime import datetime, timedelta

import pytest

from padel_app.sql_db import db


@pytest.fixture
def one_off_with_confirmed_attendance(app):
    from padel_app.models import User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.models.clubs import Club
    from padel_app.models.Association_CoachClub import Association_CoachClub
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import (
        confirm_presences_service,
        get_or_materialize_instance,
    )

    with app.app_context():
        cu = User(name="Coach", username="edit1_coach", password="x")
        pu = User(name="Player", username="edit1_player", password="x")
        db.session.add_all([cu, pu]); db.session.flush()
        coach = Coach(user_id=cu.id); player = Player(user_id=pu.id)
        db.session.add_all([coach, player]); db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=player.id))
        club = Club(name="Edit1 Club", description="c", location="x"); db.session.add(club); db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club.id))
        start = (datetime.utcnow().replace(hour=7, minute=0, second=0, microsecond=0) + timedelta(days=3))
        lesson = Lesson(
            title="Edit Me", start_datetime=start, end_datetime=start + timedelta(hours=1),
            is_recurring=False, type="academy", max_players=4, status="active", club_id=club.id,
        )
        db.session.add(lesson); db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
        db.session.commit()
        confirm_presences_service(
            {"id": f"lesson-{lesson.id}-{start.date().isoformat()}", "originalId": lesson.id,
             "date": start.date().isoformat()},
            [{"playerId": player.id, "status": "present"}],
        )
        db.session.commit()
        instance = get_or_materialize_instance(lesson, start.date())
        assert instance.confirmed_spots == 1
        return coach.id, lesson.id, instance.id, start.date()


def test_single_edit_on_a_materialised_date_edits_that_instance(app, one_off_with_confirmed_attendance):
    coach_id, lesson_id, instance_id, date = one_off_with_confirmed_attendance
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import edit_class_service

    with app.app_context():
        result, status = edit_class_service({
            "event": {"model": "Lesson", "originalId": lesson_id, "date": date.isoformat()},
            "scope": "single",
            "updates": {"name": "Edited Once"},
        })
        assert status == 200, result
        assert result == {"id": instance_id}
        rows = LessonInstance.query.filter_by(lesson_id=lesson_id).all()
        assert [r.id for r in rows] == [instance_id], "one instance on that date, the same one"
        edited = LessonInstance.query.get(instance_id)
        assert edited.overwrite_title == "Edited Once"
        assert edited.confirmed_spots == 1, "the register survives the edit"
