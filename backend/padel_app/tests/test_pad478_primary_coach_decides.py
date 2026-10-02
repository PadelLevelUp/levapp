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

pytestmark = pytest.mark.usefixtures("no_test_may_hang")

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


# ── the same rule everywhere (second review of #496) ────────────────────────

def test_a_follow_up_is_armed_for_a_class_coached_through_its_lesson(substituted, monkeypatch):
    """`_maybe_rearm_reminder` looked the coach up in the occurrence's OWN coach rows only.
    A class with none (its coach is the lesson's) got its first reminder and never a second."""
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.reminder_attempts import ReminderAttempt

    # No coach row of its own: the lesson's coach is the primary coach now.
    Association_CoachLessonInstance.query.filter_by(lesson_instance_id=substituted["instance"]).delete()
    db.session.commit()
    coach = substituted["lesson_coach"]
    from padel_app.services.notification_service import get_or_create_config

    config = get_or_create_config(coach)
    config.reminder_timing = {"firstReminder": FUTURE, "reminderCount": 2, "hoursBetweenReminders": 3}
    config.save()
    substituted["module"].schedule_instance_jobs(substituted["instance"], coach)

    first = substituted["sched"].get_job(f"reminder_{substituted['instance']}")
    pin_clock(monkeypatch, FUTURE_AT)
    first.func(*first.args)

    assert ReminderAttempt.query.count() == 1
    retries = [j.trigger.run_date.replace(tzinfo=None) for j in substituted["sched"].get_jobs() if "_retry_" in j.id]
    assert retries == [datetime(2027, 7, 11, 20, 0)]     # 17:00 + the primary coach's 3 h


def test_the_follow_up_spacing_is_the_primary_coachs(co_coached, monkeypatch):
    """NOT discriminating, kept as a statement of the rule: with two coach rows the spacing
    comes from the first one assigned. The old lookup (`.first()` with no order) returns the
    lowest junction id on SQLite, which IS the primary coach, so this passes on the old code
    too. The case that tells the two apart is a class with no coach row of its own
    (`test_a_follow_up_is_armed_for_a_class_coached_through_its_lesson`)."""
    from padel_app.services.notification_service import get_or_create_config

    for coach_id, hours in ((co_coached["primary"], 2), (co_coached["second"], 5)):
        config = get_or_create_config(coach_id)
        config.reminder_timing = {"firstReminder": FUTURE, "reminderCount": 2, "hoursBetweenReminders": hours}
        config.save()
    co_coached["module"].schedule_instance_jobs(co_coached["instance"], co_coached["primary"])

    first = co_coached["sched"].get_job(f"reminder_{co_coached['instance']}")
    pin_clock(monkeypatch, FUTURE_AT)
    first.func(*first.args)

    retries = [j.trigger.run_date.replace(tzinfo=None) for j in co_coached["sched"].get_jobs() if "_retry_" in j.id]
    assert retries == [datetime(2027, 7, 11, 19, 0)]


def test_a_co_coachs_derivation_creates_no_configuration_for_the_primary_coach(co_coached):
    """Reading the primary coach's configuration must not write one: the co-coach saved
    THEIR settings, nobody asked for a row for the other coach."""
    from padel_app.models.notification_config import NotificationConfig

    _store_timing(co_coached["second"], FUTURE)
    assert NotificationConfig.query.filter_by(coach_id=co_coached["primary"]).count() == 0

    _run_every_pass_as(co_coached["module"], co_coached["second"])

    assert NotificationConfig.query.filter_by(coach_id=co_coached["primary"]).count() == 0
    # ...and the class is armed from the primary coach's DEFAULTS (48 h before the class),
    # not from the co-coach's "1 day before at 18:00".
    assert _fire_times(co_coached["sched"], co_coached["instance"])[0] == datetime(2027, 7, 10, 17, 0)


def test_the_derivation_runs_under_the_primary_coachs_lock_whoever_triggers_it(co_coached, monkeypatch):
    """Rule 10e: one derivation at a time per PRIMARY coach, for a save, the startup pass and
    the daily pass alike, with the configuration read inside the lock."""
    module = co_coached["module"]
    _store_timing(co_coached["primary"], FUTURE)
    held = []
    real = module._reconcile_date_job

    def spy(job_id, *args, **kwargs):
        held.append((job_id.split("_")[0], module._coach_reschedule_lock(co_coached["primary"]).locked()))
        return real(job_id, *args, **kwargs)

    monkeypatch.setattr(module, "_reconcile_date_job", spy)

    module.reschedule_all_future_jobs(co_coached["second"])      # a co-coach's save
    module._reschedule_for_coach(co_coached["second"])           # the startup walk
    module._schedule_lesson_occurrences_for_coach(co_coached["second"])

    assert held and all(locked for _kind, locked in held), held
    assert not module._coach_reschedule_lock(co_coached["primary"]).locked()


def test_the_configuration_is_read_again_inside_the_lock(co_coached):
    """A pass that loaded the configuration before a save committed must not arm the old
    time afterwards: inside the lock the row is read again, not taken from the session."""
    from sqlalchemy import text

    from padel_app.services.notification_service import get_or_create_config

    _store_timing(co_coached["primary"], FUTURE)                 # 1 day before at 18:00
    stale = get_or_create_config(co_coached["primary"])
    assert stale.reminder_time == "18:00"                        # loaded in this session
    # Another request commits "1 day before at 06:00" behind this session's back.
    db.session.execute(
        text("UPDATE notification_configs SET reminder_time = '06:00', invitation_start_time = '06:00' WHERE coach_id = :c"),
        {"c": co_coached["primary"]},
    )

    co_coached["module"].schedule_instance_jobs(co_coached["instance"], co_coached["primary"])

    assert _fire_times(co_coached["sched"], co_coached["instance"])[0] == datetime(2027, 7, 11, 5, 0)


def test_the_configuration_is_read_with_the_lock_already_held(co_coached):
    """Reading the configuration and then taking the lock would let a save commit and
    re-arm in between, and this derivation would then arm the older value."""
    module = co_coached["module"]
    _store_timing(co_coached["primary"], FUTURE)
    held = []
    real = module._saved_config

    def spy(coach_id):
        held.append(module._coach_reschedule_lock(coach_id).locked())
        return real(coach_id)

    import pytest as _pytest

    with _pytest.MonkeyPatch.context() as patch:
        patch.setattr(module, "_saved_config", spy)
        module.schedule_instance_jobs(co_coached["instance"], co_coached["second"])
        module._schedule_lesson_occurrences_for_coach(co_coached["primary"])
        module.reschedule_all_future_jobs(co_coached["primary"])

    assert held and all(held), held


def test_a_lessons_lock_is_released_before_its_instances_are_derived(substituted, monkeypatch):
    """The lesson's coach is L, the occurrence's is X. Deriving the instance (X's lock) while
    still holding the lesson's (L's) would nest two coaches' locks; with the mirror-image
    class on another thread that is a deadlock, broken only by the 30 s bound."""
    module = substituted["module"]
    _store_timing(substituted["primary"], FUTURE)
    _store_timing(substituted["lesson_coach"], FUTURE)
    lesson_lock_held = []
    real = module.schedule_instance_jobs

    def spy(instance_id, coach_id, **kwargs):
        lesson_lock_held.append(module._coach_reschedule_lock(substituted["lesson_coach"]).locked())
        return real(instance_id, coach_id, **kwargs)

    monkeypatch.setattr(module, "schedule_instance_jobs", spy)
    module._schedule_lesson_occurrences_for_coach(substituted["lesson_coach"])

    assert lesson_lock_held == [False]


def test_the_lesson_walk_reads_the_configuration_with_the_lock_already_held(app, live_scheduler, monkeypatch):
    """The same order for a class that is not materialised yet (`schedule_lesson_reminder_jobs`)."""
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson

    pin_clock(monkeypatch, NOW_UTC)
    with app.app_context():
        coach = _new_coach("walk")
        club = Club(name="Club walk", description="", location="Lisboa")
        db.session.add(club)
        db.session.flush()
        lesson = Lesson(title="Walked", start_datetime=CLASS_WALL, end_datetime=CLASS_WALL.replace(hour=19),
                        is_recurring=False, type="academy", max_players=4, color="#000000",
                        status="active", club_id=club.id)
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach, lesson_id=lesson.id))
        db.session.commit()
        _store_timing(coach, FUTURE)
        held = []
        real = live_scheduler._saved_config

        def spy(coach_id):
            held.append(live_scheduler._coach_reschedule_lock(coach_id).locked())
            return real(coach_id)

        monkeypatch.setattr(live_scheduler, "_saved_config", spy)
        assert live_scheduler.schedule_lesson_reminder_jobs(lesson.id, coach) == 1

        assert held == [True]

