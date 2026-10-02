"""
PAD-478 — a timing change must leave no job armed at a time the current
configuration does not imply.

`POST /api/app/notify/config` with a changed `reminderTiming` or
`invitationStartTiming` re-arms the coach's jobs (`reschedule_all_future_jobs`).
`schedule_instance_jobs` replaces a job only when the NEW fire time is still in
the future; when it is already past, the job armed from the previous value is
left in place and fires.

The other scheduler tests hand the module a MagicMock, which cannot show what
REMAINS armed. These use a real APScheduler (memory store, started paused, so
nothing fires by itself) and a pinned clock; the class and "now" are in 2027,
so the real clock never overtakes them (wall-clock-tests-fail-overnight).

Summer dates on purpose: Lisbon is UTC+1, so wall 18:00 is 17:00 UTC.
"""
from datetime import datetime

import pytest

from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad256_reminder_clock import _seed

NOW_UTC = datetime(2027, 7, 10, 10, 0)          # Saturday 11:00 in Lisbon
CLASS_WALL = datetime(2027, 7, 12, 18, 0)       # Monday 18:00 in Lisbon
DAY_BEFORE_18 = {"type": "days_before_at_time", "days": 1, "time": "18:00"}   # fires 07-11 17:00 UTC
TWO_DAYS_18 = {"type": "days_before_at_time", "days": 2, "time": "18:00"}     # fires 07-10 17:00 UTC (future)
TWO_DAYS_09 = {"type": "days_before_at_time", "days": 2, "time": "09:00"}     # fires 07-10 08:00 UTC (PAST)



@pytest.fixture
def armed(app, monkeypatch):
    """A real, paused scheduler wired into the module, and one class two days out."""
    from apscheduler.jobstores.memory import MemoryJobStore
    from apscheduler.schedulers.background import BackgroundScheduler

    from padel_app import scheduler

    sched = BackgroundScheduler(jobstores={"default": MemoryJobStore()}, timezone="UTC")
    sched.start(paused=True)
    monkeypatch.setattr(scheduler, "_scheduler", sched)
    monkeypatch.setattr(scheduler, "_app", app)
    pin_clock(monkeypatch, NOW_UTC)
    with app.app_context():
        coach_id, student_id, instance_id = _seed(app, CLASS_WALL)
        yield {"coach": coach_id, "student": student_id, "instance": instance_id, "sched": sched}
    sched.shutdown(wait=False)


def _fire_time(sched, job_id):
    job = sched.get_job(job_id)
    return None if job is None else job.trigger.run_date.replace(tzinfo=None)


def _set_timing(coach_id, **fields):
    from padel_app.services.notification_service import update_config

    update_config(coach_id, fields)


def test_baseline_a_future_time_replaces_the_job(armed):
    """Trigger absent: both values are in the future, the job moves."""
    _set_timing(armed["coach"], reminderTiming={"firstReminder": DAY_BEFORE_18})
    assert _fire_time(armed["sched"], f"reminder_{armed['instance']}") == datetime(2027, 7, 11, 17, 0)

    _set_timing(armed["coach"], reminderTiming={"firstReminder": TWO_DAYS_18})
    assert _fire_time(armed["sched"], f"reminder_{armed['instance']}") == datetime(2027, 7, 10, 17, 0)


def test_a_reminder_time_moved_into_the_past_leaves_no_job_at_the_old_time(armed):
    job_id = f"reminder_{armed['instance']}"
    _set_timing(armed["coach"], reminderTiming={"firstReminder": DAY_BEFORE_18})
    assert _fire_time(armed["sched"], job_id) == datetime(2027, 7, 11, 17, 0)

    # The coach now wants it two days before at 09:00: for this class that was 08:00 UTC
    # today, two hours ago.
    _set_timing(armed["coach"], reminderTiming={"firstReminder": TWO_DAYS_09})

    assert _fire_time(armed["sched"], job_id) is None, (
        "the job armed from the previous timing is still there, at a time the current "
        "configuration does not imply"
    )


def test_an_intermediate_value_does_not_survive_the_final_one(armed):
    """The web form saves per control: days 1 -> 2 (still 18:00), then the time 18:00 -> 09:00.
    The first save arms TODAY 17:00 UTC; the second is in the past and replaces nothing."""
    job_id = f"reminder_{armed['instance']}"
    _set_timing(armed["coach"], reminderTiming={"firstReminder": DAY_BEFORE_18})
    _set_timing(armed["coach"], reminderTiming={"firstReminder": TWO_DAYS_18})
    _set_timing(armed["coach"], reminderTiming={"firstReminder": TWO_DAYS_09})

    assert _fire_time(armed["sched"], job_id) is None, (
        "a job armed from a value the coach passed through is still there: neither the "
        "first nor the final configuration implies 2027-07-10 17:00 UTC"
    )


def test_an_invitation_start_moved_into_the_past_leaves_no_job_at_the_old_time(armed):
    job_id = f"invite_start_{armed['instance']}"
    _set_timing(armed["coach"], invitationStartTiming=DAY_BEFORE_18)
    assert _fire_time(armed["sched"], job_id) == datetime(2027, 7, 11, 17, 0)

    _set_timing(armed["coach"], invitationStartTiming=TWO_DAYS_09)

    assert _fire_time(armed["sched"], job_id) is None


def test_no_reminder_goes_out_at_a_time_the_current_configuration_does_not_imply(armed, monkeypatch):
    """The consequence, measured by running whatever is still armed at its own fire time:
    nothing in the reminder pass re-checks the coach's timing, so a surviving job SENDS."""
    from padel_app.services import reminder_attempt_service as attempts

    _set_timing(armed["coach"], reminderTiming={"firstReminder": DAY_BEFORE_18})
    _set_timing(armed["coach"], reminderTiming={"firstReminder": TWO_DAYS_09})

    for job in armed["sched"].get_jobs():
        if job.id.startswith("reminder_"):
            pin_clock(monkeypatch, job.trigger.run_date.replace(tzinfo=None))
            job.func(*job.args)

    assert attempts.count_attempts(armed["instance"], armed["student"]) == 0, (
        "the student was reminded at the previous timing's instant, after the coach had "
        "replaced that timing"
    )


def _seed_lesson_without_instance(coach_id):
    """A one-off class that has NOT been materialised: its reminder is an occurrence job."""
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson
    from padel_app.sql_db import db

    club = Club.query.first()
    start = datetime(2027, 7, 13, 18, 0)     # Tuesday 18:00 in Lisbon
    lesson = Lesson(title="Occurrence only", start_datetime=start, end_datetime=start.replace(hour=19),
                    is_recurring=False, type="academy", max_players=4, color="#000000",
                    status="active", club_id=club.id)
    db.session.add(lesson)
    db.session.flush()
    db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=lesson.id))
    db.session.commit()
    return lesson.id


def test_an_occurrence_job_does_not_survive_a_time_moved_into_the_past(armed):
    """Same class of defect one level up: `reminder_lesson_<lesson>_<date>` (scheduler.py,
    `schedule_lesson_reminder_jobs` skips a past time and leaves the job)."""
    lesson_id = _seed_lesson_without_instance(armed["coach"])
    job_id = f"reminder_lesson_{lesson_id}_2027-07-13"
    two_days_18 = {"type": "days_before_at_time", "days": 2, "time": "18:00"}    # 07-11 17:00 UTC
    three_days_09 = {"type": "days_before_at_time", "days": 3, "time": "09:00"}  # 07-10 08:00 UTC (past)
    _set_timing(armed["coach"], reminderTiming={"firstReminder": two_days_18})
    assert _fire_time(armed["sched"], job_id) == datetime(2027, 7, 11, 17, 0)

    _set_timing(armed["coach"], reminderTiming={"firstReminder": three_days_09})

    assert _fire_time(armed["sched"], job_id) is None


def test_a_timing_of_type_none_leaves_no_job(armed):
    """`none` implies no job at all (`_fire_time_utc` returns None for it)."""
    _set_timing(armed["coach"], reminderTiming={"firstReminder": DAY_BEFORE_18})
    _set_timing(armed["coach"], invitationStartTiming=DAY_BEFORE_18)

    _set_timing(armed["coach"], reminderTiming={"firstReminder": {"type": "none"}})
    _set_timing(armed["coach"], invitationStartTiming={"type": "none"})

    assert _fire_time(armed["sched"], f"reminder_{armed['instance']}") is None
    assert _fire_time(armed["sched"], f"invite_start_{armed['instance']}") is None


def _first_reminder_then_retry(armed, monkeypatch, *, new_spacing_hours, new_count=None):
    """Two reminders 2 h apart: send the first at its time, optionally change the spacing,
    then fire whatever retry is armed. Returns (reminders sent, reminder jobs still armed)."""
    from padel_app.models.reminder_attempts import ReminderAttempt
    from padel_app.services import reminder_attempt_service as attempts
    from padel_app.sql_db import db

    sched = armed["sched"]
    _set_timing(armed["coach"], reminderTiming={
        "firstReminder": DAY_BEFORE_18, "reminderCount": 2, "hoursBetweenReminders": 2,
    })
    first = sched.get_job(f"reminder_{armed['instance']}")
    pin_clock(monkeypatch, datetime(2027, 7, 11, 17, 0))
    first.func(*first.args)
    sched.remove_job(first.id)                      # a DateTrigger job is gone once it has run
    assert attempts.count_attempts(armed["instance"], armed["student"]) == 1
    # `record_attempt` stamps `sent_at` from the REAL clock (`datetime.utcnow()`), which
    # `pin_clock` does not reach. Put the attempt on the pinned clock, or the spacing check
    # compares 2027 with today and never sees the student inside the window (this test
    # passed for that reason on its first run).
    ReminderAttempt.query.update({"sent_at": datetime(2027, 7, 11, 17, 0)})
    db.session.commit()
    retries = [j for j in sched.get_jobs() if "_retry_" in j.id]
    assert len(retries) == 1
    assert retries[0].trigger.run_date.replace(tzinfo=None) == datetime(2027, 7, 11, 19, 0)

    # The coach changes the setting ONE HOUR after the first reminder, so "the last reminder
    # sent plus the spacing" and "now plus the spacing" are different instants.
    if new_spacing_hours is not None or new_count is not None:
        pin_clock(monkeypatch, datetime(2027, 7, 11, 18, 0))
    if new_spacing_hours is not None:
        _set_timing(armed["coach"], reminderTiming={"hoursBetweenReminders": new_spacing_hours})
    if new_count is not None:
        _set_timing(armed["coach"], reminderTiming={"reminderCount": new_count})
    armed["retimed_to"] = sorted(
        j.trigger.run_date.replace(tzinfo=None) for j in sched.get_jobs() if "_retry_" in j.id
    )

    for job in [j for j in sched.get_jobs() if "_retry_" in j.id]:
        pin_clock(monkeypatch, job.trigger.run_date.replace(tzinfo=None))
        job.func(*job.args)
        sched.remove_job(job.id)

    sent = attempts.count_attempts(armed["instance"], armed["student"])
    still_armed = [j.id for j in sched.get_jobs() if j.id.startswith("reminder_")]
    return sent, still_armed


def test_baseline_an_unchanged_spacing_sends_the_follow_up(armed, monkeypatch):
    """Trigger absent: the retry fires 2 h after the first reminder and sends the second."""
    sent, _armed = _first_reminder_then_retry(armed, monkeypatch, new_spacing_hours=None)
    assert sent == 2


def test_raising_the_spacing_does_not_lose_a_pending_follow_up(armed, monkeypatch):
    """The opposite direction (B-250): `reschedule_all_future_jobs` never touches the retry
    jobs. The coach raises the spacing from 2 h to 6 h while a retry is pending. The retry
    fires at the OLD spacing, the scheduled pass finds the student inside the NEW window,
    sends nothing and reports nothing more due, so no further job is armed: the follow-up
    is never sent."""
    sent, _still_armed = _first_reminder_then_retry(armed, monkeypatch, new_spacing_hours=6)
    # Re-timed to the first reminder (17:00 UTC) plus the new spacing, NOT to the moment of
    # the change (18:00) plus the spacing, and sent there.
    assert armed["retimed_to"] == [datetime(2027, 7, 11, 23, 0)]
    assert sent == 2, "the second reminder was never sent"


def test_lowering_the_spacing_brings_the_follow_up_forward_but_never_before_now(armed, monkeypatch):
    """First reminder 17:00, new spacing 1 h, changed at 18:00: 17:00 + 1 h is not in the
    future any more, so the follow-up goes a minute from now instead of at 19:00."""
    sent, _still_armed = _first_reminder_then_retry(armed, monkeypatch, new_spacing_hours=1)
    assert armed["retimed_to"] == [datetime(2027, 7, 11, 18, 1)]
    assert sent == 2


def test_lowering_the_count_to_what_was_sent_removes_the_follow_up(armed, monkeypatch):
    sent, still_armed = _first_reminder_then_retry(armed, monkeypatch, new_spacing_hours=None, new_count=1)
    assert armed["retimed_to"] == [], "no further reminder is owed, so no follow-up job may remain"
    assert sent == 1 and still_armed == []


# ── the implied job itself, merely due ──────────────────────────────────────

def test_a_job_due_at_its_implied_time_is_left_to_fire(armed, monkeypatch):
    """A restart can land seconds after a reminder's instant, inside its grace time. The
    re-arm must not remove THAT job: it is the one the configuration implies."""
    from padel_app import scheduler

    job_id = f"reminder_{armed['instance']}"
    _set_timing(armed["coach"], reminderTiming={"firstReminder": DAY_BEFORE_18})
    pin_clock(monkeypatch, datetime(2027, 7, 11, 17, 0, 20))     # 20 s after its instant

    scheduler._reschedule_for_coach(armed["coach"])
    scheduler._schedule_lesson_occurrences_for_coach(armed["coach"])

    assert _fire_time(armed["sched"], job_id) == datetime(2027, 7, 11, 17, 0)


def test_the_startup_and_daily_passes_send_nothing(armed, monkeypatch):
    """Deploying the fix: the re-arm removes what the configuration no longer implies and
    sends nothing, even for a class whose reminder time is past and who was never reminded."""
    from padel_app import scheduler
    from padel_app.services import reminder_attempt_service as attempts

    _set_timing(armed["coach"], reminderTiming={"firstReminder": TWO_DAYS_09})   # already past
    assert _fire_time(armed["sched"], f"reminder_{armed['instance']}") is None

    scheduler._reschedule_for_coach(armed["coach"])
    scheduler._schedule_lesson_occurrences_for_coach(armed["coach"])

    assert attempts.count_attempts(armed["instance"], armed["student"]) == 0
    assert [j.id for j in armed["sched"].get_jobs() if j.id.startswith("reminder_")] == []


# ── any sequence of saves: the saved configuration alone decides ────────────

def test_a_reschedule_that_runs_late_arms_what_is_saved(armed):
    """Save A, then save B. A's reschedule running AFTER B's (requests overlap on threads)
    must still leave B's jobs: the reschedule takes no values from its caller, it reads the
    saved row. A pin of that property: it held before PAD-478 too."""
    from padel_app import scheduler

    _set_timing(armed["coach"], reminderTiming={"firstReminder": TWO_DAYS_18})    # A
    _set_timing(armed["coach"], reminderTiming={"firstReminder": DAY_BEFORE_18})  # B, saved last

    scheduler.reschedule_all_future_jobs(armed["coach"])                           # A's, late

    assert _fire_time(armed["sched"], f"reminder_{armed['instance']}") == datetime(2027, 7, 11, 17, 0)


def test_one_reschedule_at_a_time_per_coach(armed, monkeypatch):
    """Two overlapping reschedules of one coach would interleave their per-class loops and
    leave a mix of two configurations armed. The whole reschedule runs under the coach's lock."""
    from padel_app import scheduler

    held = []
    real = scheduler.schedule_instance_jobs

    def spy(instance_id, coach_id, **kwargs):
        held.append(scheduler._coach_reschedule_lock(coach_id).locked())
        return real(instance_id, coach_id, **kwargs)

    monkeypatch.setattr(scheduler, "schedule_instance_jobs", spy)
    scheduler.reschedule_all_future_jobs(armed["coach"])

    assert held and all(held)
    assert not scheduler._coach_reschedule_lock(armed["coach"]).locked()


# ── a failed reschedule is reported ─────────────────────────────────────────

def test_a_failed_reschedule_is_reported_and_the_configuration_is_still_saved(armed, monkeypatch, caplog):
    import logging

    from padel_app import scheduler
    from padel_app.services.notification_service import get_config_dict, update_config

    def boom(_coach_id):
        raise RuntimeError("job store unreachable")

    monkeypatch.setattr(scheduler, "reschedule_all_future_jobs", boom)
    with caplog.at_level(logging.ERROR):
        config = update_config(armed["coach"], {"reminderTiming": {"firstReminder": TWO_DAYS_18}})

    assert getattr(config, "reschedule_failed", None) is True
    assert get_config_dict(armed["coach"])["reminderTiming"]["firstReminder"] == TWO_DAYS_18
    assert any("job store unreachable" in r.getMessage() for r in caplog.records)


def test_a_successful_reschedule_is_not_reported_as_failed(armed):
    from padel_app.services.notification_service import update_config

    config = update_config(armed["coach"], {"reminderTiming": {"firstReminder": TWO_DAYS_18}})
    assert getattr(config, "reschedule_failed", None) is False


def test_the_route_tells_the_client_when_the_reschedule_failed(app, armed, monkeypatch, client):
    from flask_jwt_extended import create_access_token

    from padel_app import scheduler
    from padel_app.models.coaches import Coach

    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    headers = {"Authorization": f"Bearer {create_access_token(identity=str(Coach.query.get(armed['coach']).user_id))}"}
    ok = client.post("/api/app/notify/config", json={"reminderTiming": {"firstReminder": TWO_DAYS_18}}, headers=headers)
    assert ok.status_code == 200 and "rescheduleFailed" not in ok.get_json()

    def boom(_coach_id):
        raise RuntimeError("job store unreachable")

    monkeypatch.setattr(scheduler, "reschedule_all_future_jobs", boom)
    failed = client.post("/api/app/notify/config", json={"reminderTiming": {"firstReminder": DAY_BEFORE_18}}, headers=headers)

    assert failed.status_code == 200
    body = failed.get_json()
    assert body["rescheduleFailed"] is True
    assert body["reminderTiming"]["firstReminder"] == DAY_BEFORE_18
