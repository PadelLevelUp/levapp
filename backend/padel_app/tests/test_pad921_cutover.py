"""notifications.config rule 18, the cutover (PAD-921, swap plan §7): a switched coach's sessions drain
from the old engine to the new one.

The old engine never acts on a new-engine session; no old-engine job is armed for one; at drain the
coach's remaining old jobs are removed; the engine's tick materialises a switched coach's recurring
occurrences; ``flask engine drain-state`` reports how far a coach has drained. The coach and its classes
come from the switch tests' helpers (``test_engine_switch``).
"""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_engine_switch import LATER, _classes, _context, _instance  # noqa: F401 - the fixture
from padel_app.tests.test_pad916_engine_store import NOW


def _vacancy(session, coach_id, **fields):
    """An old-engine vacancy on ``session``, open, as one left from before the switch."""
    from padel_app.models.vacancy import Vacancy

    vacancy = Vacancy(lesson_instance_id=int(session), coach_id=coach_id, status="open", **fields)
    db.session.add(vacancy)
    db.session.commit()
    return vacancy


def _events(session):
    from padel_app.models.notification_event import NotificationEvent

    return NotificationEvent.query.filter_by(lesson_instance_id=int(session)).count()


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-81")
def test_the_old_engine_never_acts_on_a_new_engine_session(app):
    """An open old-engine vacancy left on an occurrence that now has an engine session row: the old tick
    (``process_invitation_batches``) and an old decline or approval job firing for it send, open and
    close nothing for that occurrence; the coach's old-engine occurrence is processed as today."""
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.engine_switch import engine_for, switch_coach
    from padel_app.services.notification_service import process_invitation_batches, send_next_on_decline_for
    from padel_app.services.replacement_approval_service import create_vacancy_approval_prompt

    store, coach_id, opened, not_opened = _classes(app)
    switch_coach(coach_id, now=NOW)
    assert (engine_for(_instance(opened)), engine_for(_instance(not_opened))) == ("old", "new")
    leftover = _vacancy(not_opened, coach_id, approval_status="not_required")
    pending = _vacancy(not_opened, coach_id, approval_status="pending")
    draining = _vacancy(opened, coach_id, approval_status="not_required")

    process_invitation_batches(now=NOW)
    process_invitation_batches(now=LATER - timedelta(hours=12))      # its window is open by now
    send_next_on_decline_for(leftover.id)
    assert create_vacancy_approval_prompt(pending.id, coach_id) is None

    for vacancy in (leftover, pending):
        db.session.refresh(vacancy)
        assert (vacancy.status, vacancy.last_activity_at, vacancy.invite_not_before) == ("open", None, None)
    assert _events(not_opened) == 0
    db.session.refresh(draining)
    assert draining.last_activity_at is not None and _events(opened) > 0      # the old engine, as today
    assert Vacancy.query.filter_by(lesson_instance_id=int(not_opened)).count() == 2   # none opened


@pytest.fixture()
def pinned(monkeypatch):
    """The scheduler's clocks at NOW (they read the real clock; the seeded classes are in November)."""
    from padel_app import scheduler
    from padel_app.utils import dates
    from padel_app.utils.dates import utc_to_wall_naive

    for module in (dates, scheduler):
        monkeypatch.setattr(module, "utcnow_naive", lambda: NOW)
    monkeypatch.setattr(scheduler, "club_now_naive", lambda: utc_to_wall_naive(NOW))


def _jobs(sched, session):
    """The old-engine jobs keyed on this occurrence (its own, its lesson's dates, its vacancies')."""
    from padel_app.models.vacancy import Vacancy

    inst = _instance(session)
    vacancies = [v.id for v in Vacancy.query.filter_by(lesson_instance_id=inst.id).all()]
    return sorted(j.id for j in sched.old_engine_jobs(instance_ids={inst.id}, lesson_ids={inst.lesson_id},
                                                      vacancy_ids=vacancies))


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-78")
def test_no_old_engine_job_is_armed_for_a_new_engine_session(app, live_scheduler, pinned):
    """A switched coach with a new-engine occurrence: when the scheduler starts (``_reschedule_for_coach``)
    and ``extend_schedule_window`` runs, no old-engine job exists for it (its reminder, invitation start,
    past-due, ask, approval and decline jobs, those armed before the switch included), while the coach's
    old-engine occurrence keeps its jobs."""
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services.engine_switch import engine_for, switch_coach

    store, coach_id, opened, not_opened = _classes(app)
    config = NotificationConfig.query.filter_by(coach_id=coach_id).one()
    config.reminder_type, config.reminder_value = "hours_before", 1       # both reminders still ahead
    for session in (opened, not_opened):
        db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=_instance(session).lesson_id))
    db.session.commit()
    live_scheduler._reschedule_for_coach(coach_id)
    assert _jobs(live_scheduler, opened) and _jobs(live_scheduler, not_opened)           # armed before

    switch_coach(coach_id, now=NOW)
    assert (engine_for(_instance(opened)), engine_for(_instance(not_opened))) == ("old", "new")
    leftover = _vacancy(not_opened, coach_id, approval_status="pending")   # left over, with its jobs
    live_scheduler._scheduler.add_job(func=print, id=live_scheduler.past_due_job_id(int(not_opened)),
                                      trigger="date", run_date=LATER)
    live_scheduler._scheduler.add_job(func=print, id=live_scheduler.approval_now_job_id(int(not_opened), leftover.id),
                                      trigger="date", run_date=LATER)
    live_scheduler._scheduler.add_job(func=print, id=live_scheduler.decline_next_job_id(leftover.id, 1),
                                      trigger="date", run_date=LATER)
    assert len(_jobs(live_scheduler, not_opened)) >= 4

    live_scheduler._reschedule_for_coach(coach_id)                          # the scheduler starts
    live_scheduler._run_extend_schedule_window()
    assert _jobs(live_scheduler, not_opened) == []
    assert f"reminder_{opened}" in _jobs(live_scheduler, opened)            # the draining one keeps its own
    assert live_scheduler.arm_invitations_now(int(not_opened), coach_id) is False
    assert live_scheduler.arm_approval_now(int(not_opened), coach_id, leftover.id) is False
    assert live_scheduler.arm_next_on_decline(leftover.id, 2) is False
    live_scheduler.arm_past_due_pass(int(not_opened), LATER)
    assert _jobs(live_scheduler, not_opened) == []


@pytest.mark.criterion("NOTIFICATIONS-CONFIG-80")
def test_the_tick_materialises_a_switched_coachs_recurring_occurrences(app, live_scheduler, pinned):
    """A switched coach's weekly class, invitations 2 days before: ``engine_tick`` 3 days before an
    occurrence leaves it unmaterialised; 2 days before (just past the window), it is materialised and
    adopted (an engine session row), and no ``invite_start_lesson_*`` job is armed for the lesson."""
    import json

    from padel_app.models import Lesson
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.services import engine_runner
    from padel_app.services.engine_switch import engine_for, switch_coach
    from padel_app.tests.test_pad916_engine_store import START

    store, coach_id, opened, _ = _classes(app)
    config = NotificationConfig.query.filter_by(coach_id=coach_id).one()
    config.invitation_start_timing = {"type": "hours_before", "value": 48}
    config.reminder_type, config.reminder_value = "hours_before", 24
    first = START + timedelta(days=7)                       # the series' first occurrence, a week out
    template = _instance(opened).lesson
    lesson = Lesson(title="Weekly", start_datetime=first, end_datetime=first + timedelta(hours=1), is_recurring=True,
                    recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": [(first.weekday() + 1) % 7]}),
                    recurrence_end=(first + timedelta(weeks=4)).date(), type="academy", max_players=4, color="#000",
                    status="active", club_id=template.club_id, default_level_id=template.default_level_id)
    db.session.add(lesson)
    db.session.flush()
    db.session.add(Association_CoachLesson(coach_id=coach_id, lesson_id=lesson.id))
    db.session.commit()
    switch_coach(coach_id, now=NOW)

    def occurrences():
        return LessonInstance.query.filter_by(lesson_id=lesson.id).all()

    from padel_app.utils.dates import wall_to_utc_naive

    starts = wall_to_utc_naive(first)
    engine_runner.run_tick(starts - timedelta(days=3))
    assert occurrences() == []
    engine_runner.run_tick(starts - timedelta(days=2) + timedelta(minutes=1))
    [made] = occurrences()
    assert made.start_datetime == first and engine_for(made) == "new"
    live_scheduler.schedule_lesson_reminder_jobs(lesson.id, coach_id, now=starts - timedelta(days=2))
    assert [j.id for j in live_scheduler._scheduler.get_jobs() if j.id.startswith(f"invite_start_lesson_{lesson.id}_")] == []
