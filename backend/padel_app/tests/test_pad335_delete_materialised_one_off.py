"""
PAD-335 — Deleting a one-off class whose attendance was confirmed must delete
the class, not just its materialised instance.

Confirming attendance materialises a ``LessonInstance`` for the occurrence.
``remove_class`` then addressed that instance; ``_dispatch_remove_class``
deleted the instance and — because the parent ``Lesson`` has no
``recurrence_rule`` — left the parent alone. The next calendar fetch
re-projected the parent as a fresh, attendance-less occurrence: the coach was
told the class was permanently removed (200), the class came back, and the
register was gone.

Covered spec: classes.delete (rule 5 / "Delete a materialised one-off").
"""
from datetime import datetime, timedelta

import pytest

from padel_app.sql_db import db


@pytest.fixture
def one_off_with_confirmed_attendance(app):
    """Coach + one-off lesson + one enrolled player whose attendance is
    confirmed on the materialised instance. Returns ids."""
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
        coach_user = User(name="Coach", username="p335_coach", password="x")
        player_user = User(name="Player", username="p335_player", password="x")
        db.session.add_all([coach_user, player_user])
        db.session.flush()
        coach = Coach(user_id=coach_user.id)
        player = Player(user_id=player_user.id)
        db.session.add_all([coach, player])
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=player.id))

        club = Club(name="P335 Club", description="c", location="x")
        db.session.add(club)
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club.id))

        start = (datetime.utcnow().replace(hour=7, minute=0, second=0, microsecond=0)
                 + timedelta(days=3))
        lesson = Lesson(
            title="QA Verify Delete",
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            is_recurring=False,
            type="academy",
            max_players=4,
            status="active",
            club_id=club.id,
        )
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
        db.session.commit()

        # The coach marks attendance from the projected Lesson occurrence —
        # exactly what the web sheet sends before any refetch. This
        # materialises the instance.
        confirm_presences_service(
            {"id": f"lesson-{lesson.id}-{start.date().isoformat()}",
             "originalId": lesson.id, "date": start.date().isoformat()},
            [{"playerId": player.id, "status": "present"}],
        )
        db.session.commit()
        instance = get_or_materialize_instance(lesson, start.date())
        assert instance.confirmed_spots == 1, "precondition: attendance confirmed"
        return coach.id, lesson.id, instance.id, start.date()


def _events_on(app, coach_id, date, title):
    from padel_app.models.coaches import Coach
    from padel_app.services.lesson_service import get_lesson_instances_in_range

    with app.app_context():
        coach = Coach.query.get(coach_id)
        range_start = datetime.combine(date - timedelta(days=1), datetime.min.time())
        range_end = datetime.combine(date + timedelta(days=1), datetime.max.time())
        events = get_lesson_instances_in_range(coach, range_start, range_end)
        return [e for e in events if e.get("title") == title and e.get("date") == date.isoformat()]


def test_delete_materialised_one_off_removes_the_class(app, one_off_with_confirmed_attendance):
    """classes.delete — 'Delete a materialised one-off': the class is gone
    from the calendar, the Lesson row is gone, and the API says ``deleted``."""
    coach_id, lesson_id, instance_id, date = one_off_with_confirmed_attendance
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import remove_class_service

    # After a refetch the card carries the instance id (the ticket's step 3).
    before = _events_on(app, coach_id, date, "QA Verify Delete")
    assert len(before) == 1 and before[0]["model"] == "LessonInstance", before
    assert before[0]["confirmedCount"] == 1

    with app.app_context():
        result, status = remove_class_service({
            "event": {"model": "LessonInstance", "originalId": instance_id,
                      "date": date.isoformat()},
            "scope": "single",
        })
        assert status == 200, result
        assert result == {"status": "deleted"}
        assert LessonInstance.query.get(instance_id) is None
        assert Lesson.query.get(lesson_id) is None, \
            "a one-off's parent Lesson must go with its only occurrence"

    # The resurrection: nothing on that day, attendance-less or otherwise.
    assert _events_on(app, coach_id, date, "QA Verify Delete") == [], \
        "deleted one-off resurrected on the next calendar fetch"


def test_delete_materialised_one_off_cancels_the_lesson_reminder_job(
    app, one_off_with_confirmed_attendance, monkeypatch
):
    """classes.delete rule 4: the parent's occurrence job is cancelled too, not
    only the instance's (a job for a deleted lesson would 404 on fire)."""
    coach_id, lesson_id, instance_id, date = one_off_with_confirmed_attendance
    import padel_app.scheduler as scheduler
    from padel_app.services.lesson_service import remove_class_service

    cancelled = []
    monkeypatch.setattr(scheduler, "cancel_lesson_occurrence_job",
                        lambda lid, d: cancelled.append(("lesson", lid, d)))
    monkeypatch.setattr(scheduler, "_maybe_cancel_instance",
                        lambda iid: cancelled.append(("instance", iid)))

    with app.app_context():
        result, status = remove_class_service({
            "event": {"model": "LessonInstance", "originalId": instance_id,
                      "date": date.isoformat()},
            "scope": "single",
        })
        assert status == 200, result

    assert ("instance", instance_id) in cancelled
    assert ("lesson", lesson_id, date.isoformat()) in cancelled


# ---------------------------------------------------------------------------
# Review round (Session A, 2026-09-16): two sibling branches of the same defect.
# ---------------------------------------------------------------------------

def _one_off_events(app, coach_id, date):
    return _events_on(app, coach_id, date, "QA Verify Delete")


def test_delete_one_off_with_scope_future_deletes_the_class(app, one_off_with_confirmed_attendance):
    """F3: a one-off has no "future" beyond itself. A stale client (or a crafted
    body) sending scope=future on the Lesson or on its materialised instance
    must get the whole-class delete, never a 200 that leaves the occurrence or
    resurrects it without its register."""
    coach_id, lesson_id, instance_id, date = one_off_with_confirmed_attendance
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import remove_class_service

    with app.app_context():
        result, status = remove_class_service({
            "event": {"model": "LessonInstance", "originalId": instance_id,
                      "date": date.isoformat()},
            "scope": "future",
        })
        assert status == 200, result
        assert result == {"status": "deleted"}
        assert LessonInstance.query.get(instance_id) is None
        assert Lesson.query.get(lesson_id) is None
    assert _one_off_events(app, coach_id, date) == []


def test_delete_one_off_lesson_with_scope_future_deletes_the_class(app, one_off_with_confirmed_attendance):
    coach_id, lesson_id, instance_id, date = one_off_with_confirmed_attendance
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import remove_class_service

    with app.app_context():
        result, status = remove_class_service({
            "event": {"model": "Lesson", "originalId": lesson_id, "date": date.isoformat()},
            "scope": "future",
        })
        assert status == 200, result
        assert result == {"status": "deleted"}
        assert Lesson.query.get(lesson_id) is None
    assert _one_off_events(app, coach_id, date) == []


def test_delete_recurring_occurrence_via_lesson_path_removes_its_materialised_instance(app):
    """F2: the web sheet keeps event.model="Lesson" after confirming attendance,
    so "delete this occurrence" arrives as model=Lesson, scope=single on a date
    that now HAS an instance. The split moved only later instances; the one on
    that date stayed on the old lesson and the projection re-appended it —
    the occurrence came back with its register after a 200 single_removed."""
    import json
    from padel_app.models import User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.models.clubs import Club
    from padel_app.models.Association_CoachClub import Association_CoachClub
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.lesson_service import (
        confirm_presences_service, get_or_materialize_instance, remove_class_service,
    )

    with app.app_context():
        cu = User(name="Coach", username="p335r_coach", password="x")
        pu = User(name="Player", username="p335r_player", password="x")
        db.session.add_all([cu, pu]); db.session.flush()
        coach = Coach(user_id=cu.id); player = Player(user_id=pu.id)
        db.session.add_all([coach, player]); db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=player.id))
        club = Club(name="P335R", description="c", location="x"); db.session.add(club); db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club.id))
        start = (datetime.utcnow().replace(hour=9, minute=0, second=0, microsecond=0) + timedelta(days=2))
        lesson = Lesson(
            title="Weekly", start_datetime=start, end_datetime=start + timedelta(hours=1),
            is_recurring=True,
            recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": [(start.weekday() + 1) % 7]}),
            recurrence_end=(start + timedelta(weeks=5)).date(),
            type="academy", max_players=4, status="active", club_id=club.id,
        )
        db.session.add(lesson); db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
        db.session.commit()
        lesson_id, coach_id = lesson.id, coach.id
        second = (start + timedelta(weeks=1)).date()
        # Confirm attendance from the projected occurrence: materialises it.
        confirm_presences_service(
            {"id": f"lesson-{lesson_id}-{second.isoformat()}", "originalId": lesson_id,
             "date": second.isoformat()},
            [{"playerId": player.id, "status": "present"}],
        )
        db.session.commit()
        instance_id = get_or_materialize_instance(lesson, second).id
        assert LessonInstance.query.get(instance_id).confirmed_spots == 1

        # The sheet's stale event: still model=Lesson.
        result, status = remove_class_service({
            "event": {"model": "Lesson", "originalId": lesson_id, "date": second.isoformat()},
            "scope": "single",
        })
        assert status == 200, result
        assert result == {"status": "single_removed"}
        assert LessonInstance.query.get(instance_id) is None, \
            "the materialised occurrence must go with the exclusion"

    assert _events_on(app, coach_id, second, "Weekly") == [], "the occurrence came back"
    assert _events_on(app, coach_id, start.date(), "Weekly"), "first occurrence remains"
    assert _events_on(app, coach_id, (start + timedelta(weeks=2)).date(), "Weekly"), "third remains"
