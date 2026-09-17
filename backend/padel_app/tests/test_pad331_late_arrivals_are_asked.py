"""PAD-331: anyone who joins a class after the reminder chain has stopped.

Reminder passes are a chain — `_maybe_rearm_reminder` schedules the next only
while the current reports `more_due`. With the default `reminderCount` of 1 the
first pass reports False, so the chain ends after one pass and the occurrence's
job is spent. Every later arrival is silent: a coach's fresh add, a re-add
(PAD-318), any late join, with no cancellation in the story.

These tests assert something is ASKED to send, not that the service sends when
called by hand — the distinction that hid this (ledger B-083).
"""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import (
    PATCHES, _seed_coach_and_student, _seed_instance,
)


@pytest.fixture
def live_scheduler(app):
    """A real APScheduler with a memory store, not started: jobs sit pending."""
    from apscheduler.jobstores.memory import MemoryJobStore
    from apscheduler.schedulers.background import BackgroundScheduler

    from padel_app import scheduler as sched

    sched._scheduler = BackgroundScheduler(jobstores={"default": MemoryJobStore()}, timezone="UTC")
    sched._app = app
    try:
        yield sched
    finally:
        sched._scheduler = None
        sched._app = None


def _ask_jobs(sched, instance_id):
    return [j for j in sched._scheduler.get_jobs() if j.id.startswith("ask_{}_".format(instance_id))]


def _world(app, hours=24):
    ids = _seed_coach_and_student(app)
    return ids, _seed_instance(app, ids["coach_id"], ids["student_id"], start_offset_hours=hours)


def test_the_chain_really_does_stop_after_one_pass(app):
    """The premise, pinned — if this ever stops being true, the fix is moot."""
    from padel_app.services.notification_service import send_class_reminders

    ids, iid = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            first = send_class_reminders(iid)
    assert first["sent"] == 1
    assert first["more_due"] is False, (
        "one reminder each is the default, so nothing re-arms and the chain ends here"
    )


def test_a_student_added_after_the_chain_stopped_is_asked(app, live_scheduler):
    """The case with no cancellation anywhere in it."""
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import send_class_reminders
    from padel_app.tests.test_pad259_readers import _second_student

    ids, iid = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_class_reminders(iid)
            # only what the NEXT action arms is under test
            live_scheduler._scheduler.remove_all_jobs()
            carol, _uid = _second_student(app, ids["coach_id"], "carol")
            enrol(carol, db.session.get(LessonInstance, iid), "coach")

        assert len(_ask_jobs(live_scheduler, iid)) == 1, (
            "a pass is armed for the newcomer; nothing else would ask"
        )


def test_a_re_added_student_is_asked(app, live_scheduler):
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import (
        cancel_attendance, respond_to_reminder, send_class_reminders,
    )

    ids, iid = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_class_reminders(iid)
            respond_to_reminder(iid, "yes", ids["student_user_id"])
            cancel_attendance(ids["student_user_id"], lesson_instance_id=iid)
            live_scheduler._scheduler.remove_all_jobs()
            enrol(ids["student_id"], db.session.get(LessonInstance, iid), "coach")

        assert len(_ask_jobs(live_scheduler, iid)) == 1


def test_asking_a_newcomer_creates_no_coach_settings(app, live_scheduler):
    """Arming runs inside every enrolment, so reading the coach's timing must
    not CREATE their settings — the row collides with the one a caller makes
    next (PAD-330's lesson). A coach without settings is still asked for on
    the defaults, as the reminder pass would."""
    from padel_app.models import LessonInstance, NotificationConfig
    from padel_app.services.lesson_service import enrol
    from padel_app.tests.test_pad259_readers import _second_student

    ids, iid = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).delete()
            db.session.commit()
            live_scheduler._scheduler.remove_all_jobs()
            carol, _uid = _second_student(app, ids["coach_id"], "carol")
            enrol(carol, db.session.get(LessonInstance, iid), "coach")

        assert NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).count() == 0
        assert len(_ask_jobs(live_scheduler, iid)) == 1, (
            "the default timing has passed for a class 24h out, so they are asked"
        )


def test_nobody_is_asked_twice_while_a_reminder_is_still_live(app):
    """PAD-49/94: asking again while a Yes/No is outstanding is the noise we removed."""
    from padel_app.models import LessonInstance
    from padel_app.services.notification_service import next_ask_time, send_class_reminders

    ids, iid = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_class_reminders(iid)  # leaves a live, unanswered reminder
        assert next_ask_time(db.session.get(LessonInstance, iid), ids["student_id"]) is None


def test_a_student_who_answered_is_not_asked_again(app):
    from padel_app.models import LessonInstance
    from padel_app.services.notification_service import (
        next_ask_time, respond_to_reminder, send_class_reminders,
    )

    ids, iid = _world(app)
    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_class_reminders(iid)
            respond_to_reminder(iid, "yes", ids["student_user_id"])
        assert next_ask_time(db.session.get(LessonInstance, iid), ids["student_id"]) is None


def test_quiet_hours_defer_to_the_morning_and_never_to_a_past_time(app):
    """The correction the coordinator made: defer FORWARD, to the next permitted
    instant — never back to the occurrence's configured fire time, which is in
    the past for exactly the cases this fixes."""
    from padel_app.models import LessonInstance
    from padel_app.services.notification_service import get_or_create_config, next_ask_time
    from padel_app.utils.dates import CLUB_TZ

    ids, iid = _world(app, hours=24)
    with app.app_context():
        config = get_or_create_config(ids["coach_id"])
        restrictions = dict(config.get_restrictions())
        restrictions["quietHours"] = {"enabled": True}
        config.restrictions = restrictions
        db.session.commit()

        instance = db.session.get(LessonInstance, iid)
        # 02:00 on the club's clock — inside quiet hours
        night_local = (datetime.utcnow() + timedelta(days=1)).replace(
            hour=2, minute=0, second=0, microsecond=0)
        night = night_local  # naive UTC is close enough for the hour arithmetic here
        # B-100: the class is pinned RELATIVE TO the pinned "now", never to the
        # real clock. _world() seeds it at real-now + 24h, which between 00:00
        # and ~08:00 club-local is at or before the deferred morning slot, so
        # next_ask_time() rightly returned None and this test failed by the
        # hour of the day. Midday the day after the night keeps the ask
        # (~08:00 the next morning) safely before the class at any wall-clock.
        instance.start_datetime = night + timedelta(hours=34)
        instance.end_datetime = instance.start_datetime + timedelta(hours=1)
        db.session.commit()

        when = next_ask_time(instance, ids["student_id"], config=config, now=night)
        assert when is not None, "quiet hours defer the ask, they do not cancel it"
        assert when > night, "deferred forward, never to a time already past"
        local_hour = when.replace(tzinfo=None).hour
        assert 6 <= local_hour <= 9, (
            "the ask lands at the end of quiet hours, not at 03:00: got hour {}".format(local_hour)
        )
