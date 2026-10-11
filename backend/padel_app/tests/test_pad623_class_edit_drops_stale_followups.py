"""PAD-623 (PAD-612 R6): a follow-up reminder already armed keeps its old time when the class moves.

`_maybe_rearm_reminder` arms `reminder_<id>_retry_<ts>` hoursBetweenReminders after a pass. A class
edit re-arms the base job for the new time (PAD-478) but left the follow-up where it was, so after a
move it fired on the old schedule (and the base pass at the new time then found the cap spent).
A time or date edit now drops the occurrence's pending follow-ups; the re-armed base pass sends
whatever reminder is still owed, relative to the new class time.
"""
from datetime import datetime, timedelta

import pytest

from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad478_stale_timing_jobs import CLASS_WALL, DAY_BEFORE_18, _set_timing, armed  # noqa: F401

pytestmark = pytest.mark.usefixtures("no_test_may_hang")


def _first_pass_arms_a_followup(armed, monkeypatch):
    from padel_app.models.reminder_attempts import ReminderAttempt
    from padel_app.sql_db import db

    sched = armed["sched"]
    _set_timing(armed["coach"], reminderTiming={
        "firstReminder": DAY_BEFORE_18, "reminderCount": 2, "hoursBetweenReminders": 2,
    })
    first = sched.get_job(f"reminder_{armed['instance']}")
    pin_clock(monkeypatch, datetime(2027, 7, 11, 17, 0))
    first.func(*first.args)
    sched.remove_job(first.id)
    ReminderAttempt.query.update({"sent_at": datetime(2027, 7, 11, 17, 0)})
    db.session.commit()
    retries = [j for j in sched.get_jobs() if j.id.startswith(f"reminder_{armed['instance']}_retry_")]
    assert len(retries) == 1, "the follow-up is armed at the old spacing"
    return retries[0].id


def _move(instance_id, days):
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import edit_lesson_instance_helper
    from padel_app.sql_db import db

    inst = db.session.get(LessonInstance, instance_id)
    new_start = inst.start_datetime + timedelta(days=days)
    new_end = inst.end_datetime + timedelta(days=days)
    edit_lesson_instance_helper({
        "date": new_start.date().isoformat(),
        "start_time": new_start.strftime("%H:%M"), "end_time": new_end.strftime("%H:%M"),
    }, inst)


def test_moving_the_class_drops_the_pending_followup(armed, monkeypatch):
    """OLD-RED (observed: red with the drop removed): the follow-up stayed armed at 07-11 19:00 for a
    class now a week later. The base reminder is armed for the new time (the day before, 18:00
    Lisbon = 07-18 17:00 UTC)."""
    retry_id = _first_pass_arms_a_followup(armed, monkeypatch)
    pin_clock(monkeypatch, datetime(2027, 7, 11, 18, 0))
    _move(armed["instance"], 7)
    sched = armed["sched"]
    assert sched.get_job(retry_id) is None
    base = sched.get_job(f"reminder_{armed['instance']}")
    assert base is not None and base.trigger.run_date.replace(tzinfo=None) == datetime(2027, 7, 18, 17, 0)


@pytest.mark.parametrize("occurrence_key", ["set", "null"], ids=["occurrence-key-set", "occurrence-key-null"])
def test_a_lesson_occurrence_form_followup_is_dropped_too(armed, monkeypatch, occurrence_key):
    """Review of PAD-623: the other id form, ``reminder_lesson_<L>_<date>_retry_<ts>``. With the
    occurrence key set the instance still resolves after the move (PIN). With it NULL (legacy rows),
    the id's date is the OLD start's, which the moved instance no longer has: only the prefix read
    BEFORE the edit finds it (OLD-RED against a resolver-only drop)."""
    from apscheduler.triggers.date import DateTrigger

    from padel_app import scheduler
    from padel_app.models import LessonInstance
    from padel_app.sql_db import db

    inst = db.session.get(LessonInstance, armed["instance"])
    if occurrence_key == "null":
        inst.original_lesson_occurence_date = None
        db.session.commit()
    occ = (inst.original_lesson_occurence_date or inst.start_datetime.date()).isoformat()
    job_id = f"reminder_lesson_{inst.lesson_id}_{occ}_retry_123"
    armed["sched"].add_job(
        func=scheduler._run_send_reminders, args=[armed["instance"]],
        trigger=DateTrigger(run_date=datetime(2027, 7, 11, 19, 0), timezone="UTC"), id=job_id,
    )
    pin_clock(monkeypatch, datetime(2027, 7, 11, 18, 0))
    _move(armed["instance"], 7)
    assert armed["sched"].get_job(job_id) is None


def test_a_failing_drop_does_not_fail_the_edit_or_the_re_arm(armed, monkeypatch):
    """Review of PAD-623: scheduler work after the commit is best-effort (PAD-10)."""
    from padel_app import scheduler

    _first_pass_arms_a_followup(armed, monkeypatch)
    pin_clock(monkeypatch, datetime(2027, 7, 11, 18, 0))
    monkeypatch.setattr(scheduler, "drop_pending_followups", lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("boom")))
    _move(armed["instance"], 7)  # does not raise
    base = armed["sched"].get_job(f"reminder_{armed['instance']}")
    assert base is not None and base.trigger.run_date.replace(tzinfo=None) == datetime(2027, 7, 18, 17, 0)


def test_an_edit_that_keeps_the_time_keeps_the_followup(armed, monkeypatch):
    """PIN: an edit that does not move the class (its title, say) leaves the chain alone."""
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import edit_lesson_instance_helper
    from padel_app.sql_db import db

    retry_id = _first_pass_arms_a_followup(armed, monkeypatch)
    pin_clock(monkeypatch, datetime(2027, 7, 11, 18, 0))
    inst = db.session.get(LessonInstance, armed["instance"])
    edit_lesson_instance_helper({
        "title": "Renamed", "date": inst.start_datetime.date().isoformat(),
        "start_time": inst.start_datetime.strftime("%H:%M"), "end_time": inst.end_datetime.strftime("%H:%M"),
    }, inst)
    assert armed["sched"].get_job(retry_id) is not None
