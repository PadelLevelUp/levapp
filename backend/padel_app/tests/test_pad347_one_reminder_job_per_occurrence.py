"""
PAD-347 (B-097) — one reminder job per occurrence.

A materialised occurrence used to carry two reminder jobs firing at the same
instant: ``reminder_lesson_<lesson>_<date>`` (armed per template occurrence)
and ``reminder_<instance>`` (armed on materialisation). Both ran
``send_class_reminders``; only the per-student cap stood between them, so a
coach with ``reminder_count >= 2`` had students reminded twice in one minute,
and every restart / daily window extension / settings save re-created the pair.

Covered spec: notifications.reminders rule 20 and its three criteria.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db


@pytest.fixture
def live_scheduler(app):
    from apscheduler.jobstores.memory import MemoryJobStore
    from apscheduler.schedulers.background import BackgroundScheduler
    from padel_app import scheduler as sched

    sched._scheduler = BackgroundScheduler(
        jobstores={"default": MemoryJobStore()}, timezone="UTC"
    )
    sched._app = app
    try:
        yield sched
    finally:
        sched._scheduler = None
        sched._app = None


def _seed(app, *, reminder_count=1):
    """Coach + club + one enrolled student + a one-off lesson 5 days out."""
    from padel_app.models.users import User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.services.notification_service import get_or_create_config

    with app.app_context():
        cu = User(name="Coach", username="pad347_coach", email="c347@test.com",
                  password="x", status="active")
        su = User(name="Student One", username="pad347_student",
                  email="s347@test.com", password="x", status="active")
        db.session.add_all([cu, su])
        db.session.flush()
        coach = Coach(user_id=cu.id)
        player = Player(user_id=su.id)
        db.session.add_all([coach, player])
        db.session.flush()
        club = Club(name="PAD347 Club", description="", location="x")
        db.session.add(club)
        db.session.flush()

        start = (datetime.utcnow().replace(hour=10, minute=0, second=0, microsecond=0)
                 + timedelta(days=5))
        lesson = Lesson(
            title="One-off", start_datetime=start, end_datetime=start + timedelta(hours=1),
            is_recurring=False, recurrence_rule=None, type="academy", max_players=4,
            status="active", club_id=club.id,
        )
        db.session.add(lesson)
        db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
        db.session.add(Association_PlayerLesson(player_id=player.id, lesson_id=lesson.id))
        db.session.commit()

        cfg = get_or_create_config(coach.id)
        cfg.reminder_count = reminder_count
        db.session.commit()
        return {
            "coach_id": coach.id, "player_id": player.id, "student_user_id": su.id,
            "lesson_id": lesson.id, "date": start.date(), "start": start,
        }


def _reminder_jobs(sched):
    """Every armed reminder job (occurrence, instance and retry ids) by id."""
    return {
        j.id: j for j in sched._scheduler.get_jobs() if j.id.startswith("reminder_")
    }


def _run_job(sched, job):
    """Invoke a job's callable with its args; return reminder sends per student user."""
    import padel_app.services.notification_service as ns

    orig = ns._send_system_message
    with patch("padel_app.services.notification_service.publish"), \
         patch("padel_app.services.notification_service.send_push_notification"), \
         patch("padel_app.utils.expo_push.send_expo_push_to_user"), \
         patch("padel_app.services.notification_service._send_system_message",
               wraps=orig) as m:
        job.func(*job.args)
    sends = {}
    for c in m.call_args_list:
        kw = c.kwargs
        if kw.get("message_type") == "notification_reminder":
            sends[kw["player_user_id"]] = sends.get(kw["player_user_id"], 0) + 1
    return sends


def _arm_and_materialise(app, sched, ids):
    from padel_app.models.lessons import Lesson
    from padel_app.services.lesson_service import get_or_materialize_instance

    sched.schedule_lesson_reminder_jobs(ids["lesson_id"], ids["coach_id"])
    occ_id = f"reminder_lesson_{ids['lesson_id']}_{ids['date'].isoformat()}"
    assert occ_id in _reminder_jobs(sched), "precondition: the occurrence job is armed"
    lesson = db.session.get(Lesson, ids["lesson_id"])
    inst = get_or_materialize_instance(lesson, ids["date"])
    db.session.commit()
    return inst, occ_id, f"reminder_{inst.id}"


def test_materialising_leaves_one_reminder_job(app, live_scheduler):
    """Criterion 'Materialising an occurrence leaves one reminder job'."""
    ids = _seed(app)
    with app.app_context():
        inst, occ_id, inst_id = _arm_and_materialise(app, live_scheduler, ids)
        jobs = _reminder_jobs(live_scheduler)
        assert inst_id in jobs, jobs
        assert occ_id not in jobs, \
            f"the occurrence job survived materialisation: {sorted(jobs)}"
        assert sorted(jobs) == [inst_id]


def test_rearm_does_not_bring_the_pair_back(app, live_scheduler):
    """Criterion 'The re-arm does not bring the pair back': the startup re-arm
    and the daily window extension both go through the lesson-occurrence
    scheduler; a materialised date must not get its occurrence job back."""
    ids = _seed(app)
    with app.app_context():
        inst, occ_id, inst_id = _arm_and_materialise(app, live_scheduler, ids)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson_id"], ids["coach_id"])
        live_scheduler._schedule_lesson_occurrences_for_coach(ids["coach_id"])
        jobs = _reminder_jobs(live_scheduler)
        assert sorted(jobs) == [inst_id], sorted(jobs)
        # And the survivor still fires at the instance's own reminder time.
        cfg_dt = jobs[inst_id].trigger.run_date.replace(tzinfo=None)
        assert cfg_dt < ids["start"]


def test_canceled_instance_gets_no_reminder_job(app, live_scheduler):
    """Rule 20: a canceled instance gets no job at all, and the re-arm must not
    give it the occurrence job either."""
    ids = _seed(app)
    with app.app_context():
        inst, occ_id, inst_id = _arm_and_materialise(app, live_scheduler, ids)
        inst.status = "canceled"
        db.session.commit()
        live_scheduler.cancel_instance_jobs(inst.id)
        live_scheduler.schedule_lesson_reminder_jobs(ids["lesson_id"], ids["coach_id"])
        assert _reminder_jobs(live_scheduler) == {}, sorted(_reminder_jobs(live_scheduler))


def test_two_reminders_are_two_passes_not_one_minute(app, live_scheduler):
    """Criterion 'Two reminders are two passes, not one minute': with
    reminder_count=2, running every armed job once sends ONE reminder; the
    second arrives later, hours_between_reminders apart, from the instance
    runner's retry chain — the duplicate goes, the feature stays."""
    from padel_app.models import ReminderAttempt

    ids = _seed(app, reminder_count=2)
    with app.app_context():
        inst, occ_id, inst_id = _arm_and_materialise(app, live_scheduler, ids)

        armed = list(_reminder_jobs(live_scheduler).values())
        total = 0
        for job in armed:
            total += _run_job(live_scheduler, job).get(ids["student_user_id"], 0)
        assert total == 1, f"one pass must send one reminder, sent {total}"
        assert ReminderAttempt.query.filter_by(
            lesson_instance_id=inst.id, player_id=ids["player_id"]).count() == 1

        # The chain: one retry, from the instance runner, hours_between later.
        retries = {k: v for k, v in _reminder_jobs(live_scheduler).items() if "_retry_" in k}
        assert len(retries) == 1, sorted(retries)
        retry_id, retry = next(iter(retries.items()))
        assert retry_id.startswith(f"{inst_id}_retry_"), retry_id
        from padel_app.services.notification_service import get_or_create_config
        hours = get_or_create_config(ids["coach_id"]).get_hours_between_reminders()
        expected = datetime.utcnow() + timedelta(hours=hours)
        assert abs((retry.trigger.run_date.replace(tzinfo=None) - expected).total_seconds()) < 120

        # The retry delivers the second reminder.
        second = _run_job(live_scheduler, retry).get(ids["student_user_id"], 0)
        assert second == 1
        assert ReminderAttempt.query.filter_by(
            lesson_instance_id=inst.id, player_id=ids["player_id"]).count() == 2
