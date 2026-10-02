"""
PAD-478 (notifications.config rule 10a), found by the review of #496 at 101d095ee.

The reminder pass and the invitation trigger honour ONE configuration per class: its primary
coach's (`lesson_service.primary_coach`: the occurrence's own first coach row, else the
lesson's). The scheduler's derivation, though, ran once per coach who reaches a class, with
THAT coach's configuration: a co-coach through the startup loop over every coach or through
their own settings save, the lesson's coach through the occurrence walk when the occurrence
has a substitute. Once a past time REMOVES a job, deriving from the wrong coach removes the
primary coach's job, and the class gets no reminder. (Before PAD-478 the same mismatch
re-armed the job at the other coach's time, whichever coach was processed last.)

A job is derived from the class's primary coach, whoever triggered the derivation.
Real scheduler (conftest `live_scheduler`), pinned clock, dates in 2027.
"""
from datetime import datetime

import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad256_reminder_clock import _seed

NOW_UTC = datetime(2027, 7, 10, 10, 0)          # Saturday 11:00 in Lisbon
CLASS_WALL = datetime(2027, 7, 12, 18, 0)       # Monday 18:00 in Lisbon
FUTURE = {"type": "days_before_at_time", "days": 1, "time": "18:00"}   # 07-11 17:00 UTC
PAST = {"type": "days_before_at_time", "days": 2, "time": "09:00"}     # 07-10 08:00 UTC
FUTURE_AT = datetime(2027, 7, 11, 17, 0)


def _new_coach(tag):
    from padel_app.models.coaches import Coach
    from padel_app.models.users import User

    user = User(name=f"Coach {tag}", username=f"coach-{tag}", email=f"{tag}@t.test", password="x", status="active")
    db.session.add(user)
    db.session.flush()
    coach = Coach(user_id=user.id)
    db.session.add(coach)
    db.session.commit()
    return coach.id


def _store_timing(coach_id, timing):
    """Save a coach's reminder AND invitation-start timing without running any reschedule,
    so each test decides which pass runs and as whom."""
    from padel_app.services.notification_service import get_or_create_config

    config = get_or_create_config(coach_id)
    config.reminder_timing = {"firstReminder": timing, "invitationStart": timing}
    config.save()


def _fire_times(sched, instance_id):
    def at(job_id):
        job = sched.get_job(job_id)
        return None if job is None else job.trigger.run_date.replace(tzinfo=None)

    return at(f"reminder_{instance_id}"), at(f"invite_start_{instance_id}")


@pytest.fixture
def co_coached(app, live_scheduler, monkeypatch):
    """A class whose own coach rows are P (assigned first: the primary) and S."""
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance

    pin_clock(monkeypatch, NOW_UTC)
    with app.app_context():
        primary, _student, instance_id = _seed(app, CLASS_WALL)
        second = _new_coach("second")
        db.session.add(Association_CoachLessonInstance(coach_id=second, lesson_instance_id=instance_id))
        db.session.commit()
        yield {"primary": primary, "second": second, "instance": instance_id,
               "module": live_scheduler, "sched": live_scheduler._scheduler}


@pytest.fixture
def substituted(app, live_scheduler, monkeypatch):
    """A class of the lesson's coach L whose occurrence is coached by X (its own coach row)."""
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.lesson_instances import LessonInstance

    pin_clock(monkeypatch, NOW_UTC)
    with app.app_context():
        substitute, _student, instance_id = _seed(app, CLASS_WALL)   # X holds the instance row
        lesson_coach = _new_coach("lesson")
        lesson_id = LessonInstance.query.get(instance_id).lesson_id
        db.session.add(Association_CoachLesson(coach_id=lesson_coach, lesson_id=lesson_id))
        db.session.commit()
        yield {"primary": substitute, "lesson_coach": lesson_coach, "instance": instance_id,
               "module": live_scheduler, "sched": live_scheduler._scheduler}


def _run_every_pass_as(module, coach_id):
    """What can reach a class on behalf of `coach_id`: the startup and daily walks, and that
    coach's own settings save."""
    module._reschedule_for_coach(coach_id)
    module._schedule_lesson_occurrences_for_coach(coach_id)
    module.reschedule_all_future_jobs(coach_id)


# ── co-coach ────────────────────────────────────────────────────────────────

def test_a_co_coach_with_a_past_time_does_not_remove_the_primary_coachs_jobs(co_coached):
    _store_timing(co_coached["primary"], FUTURE)
    _store_timing(co_coached["second"], PAST)
    co_coached["module"].schedule_instance_jobs(co_coached["instance"], co_coached["primary"])
    assert _fire_times(co_coached["sched"], co_coached["instance"]) == (FUTURE_AT, FUTURE_AT)

    _run_every_pass_as(co_coached["module"], co_coached["second"])

    assert _fire_times(co_coached["sched"], co_coached["instance"]) == (FUTURE_AT, FUTURE_AT)


def test_a_co_coach_with_a_future_time_does_not_arm_jobs_the_primary_coach_does_not_imply(co_coached):
    _store_timing(co_coached["primary"], PAST)
    _store_timing(co_coached["second"], FUTURE)

    _run_every_pass_as(co_coached["module"], co_coached["second"])

    assert _fire_times(co_coached["sched"], co_coached["instance"]) == (None, None)


def test_the_startup_loop_over_every_coach_leaves_the_primary_coachs_jobs(co_coached, app):
    """`_startup_reschedule` walks Coach.query.all(): the co-coach is reached after the primary."""
    _store_timing(co_coached["primary"], FUTURE)
    _store_timing(co_coached["second"], PAST)

    co_coached["module"]._startup_reschedule(app)

    assert _fire_times(co_coached["sched"], co_coached["instance"]) == (FUTURE_AT, FUTURE_AT)


# ── substitute ──────────────────────────────────────────────────────────────

def test_the_lessons_coach_with_a_past_time_does_not_remove_the_substitutes_jobs(substituted):
    _store_timing(substituted["primary"], FUTURE)
    _store_timing(substituted["lesson_coach"], PAST)
    substituted["module"].schedule_instance_jobs(substituted["instance"], substituted["primary"])
    assert _fire_times(substituted["sched"], substituted["instance"]) == (FUTURE_AT, FUTURE_AT)

    _run_every_pass_as(substituted["module"], substituted["lesson_coach"])

    assert _fire_times(substituted["sched"], substituted["instance"]) == (FUTURE_AT, FUTURE_AT)


def test_the_lessons_coach_with_a_future_time_does_not_arm_jobs_the_substitute_does_not_imply(substituted):
    _store_timing(substituted["primary"], PAST)
    _store_timing(substituted["lesson_coach"], FUTURE)

    _run_every_pass_as(substituted["module"], substituted["lesson_coach"])

    assert _fire_times(substituted["sched"], substituted["instance"]) == (None, None)


def test_the_invitation_job_carries_the_primary_coach(co_coached):
    """`_run_trigger_invitations(instance_id, coach_id)` runs with the coach in the job's args."""
    _store_timing(co_coached["primary"], FUTURE)
    _store_timing(co_coached["second"], FUTURE)

    co_coached["module"].schedule_instance_jobs(co_coached["instance"], co_coached["second"])

    job = co_coached["sched"].get_job(f"invite_start_{co_coached['instance']}")
    assert list(job.args) == [co_coached["instance"], co_coached["primary"]]


def test_an_occurrence_job_follows_the_lessons_first_coach(app, live_scheduler, monkeypatch):
    """A class not materialised yet, with two coaches on the lesson: its occurrence job is
    derived from the first one assigned, whoever's walk reaches it."""
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson

    pin_clock(monkeypatch, NOW_UTC)
    with app.app_context():
        first, second = _new_coach("lesson-first"), _new_coach("lesson-second")
        club = Club(name="Club occ", description="", location="Lisboa")
        db.session.add(club)
        db.session.flush()
        lesson = Lesson(title="Two coaches", start_datetime=CLASS_WALL, end_datetime=CLASS_WALL.replace(hour=19),
                        is_recurring=False, type="academy", max_players=4, color="#000000",
                        status="active", club_id=club.id)
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=first, lesson_id=lesson.id))
        db.session.add(Association_CoachLesson(coach_id=second, lesson_id=lesson.id))
        db.session.commit()
        _store_timing(first, FUTURE)
        _store_timing(second, PAST)
        job_id = f"reminder_lesson_{lesson.id}_2027-07-12"

        live_scheduler._schedule_lesson_occurrences_for_coach(first)
        assert live_scheduler._scheduler.get_job(job_id).trigger.run_date.replace(tzinfo=None) == FUTURE_AT

        live_scheduler._schedule_lesson_occurrences_for_coach(second)
        live_scheduler.reschedule_all_future_jobs(second)

        job = live_scheduler._scheduler.get_job(job_id)
        assert job is not None and job.trigger.run_date.replace(tzinfo=None) == FUTURE_AT

