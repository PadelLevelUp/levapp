"""PAD-622 (PAD-612 R5): with 2+ reminders, a coach who marks a student and then clears the mark
(PAD-567) must not make the next reminder pass ask a student who already answered.

The clear writes the never-answered shape (`confirmed=False`, `response="none"`), but the reminder
attempt the student answered stays counted below `reminderCount`, so the next scheduled pass sees
"1 sent < 2" and asked again (OLD-RED: 2 attempts). Since PAD-622 an answered attempt stands.
"""
from datetime import timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad567_clear_presence import START, _fire, _mark, _row, world  # noqa: F401,F811 — `world` is a fixture


def _attempts(app, iid, player_id):
    from padel_app.models.reminder_attempts import ReminderAttempt

    with app.app_context():
        return ReminderAttempt.query.filter_by(lesson_instance_id=iid, player_id=player_id).count()


def test_a_clear_after_an_answer_does_not_bring_back_the_question(app, world, monkeypatch):
    from padel_app.services.notification_service import get_or_create_config, respond_to_reminder, send_class_reminders

    ids, iid = world
    with app.app_context():
        cfg = get_or_create_config(ids["coach_id"])
        cfg.reminder_count = 2
        db.session.commit()

    first = _fire()
    pin_clock(monkeypatch, first)
    with app.app_context():
        send_class_reminders(iid, now=first, scheduled=True)
    assert _attempts(app, iid, ids["student_id"]) == 1, "reminder 1 went out"
    with app.app_context():
        respond_to_reminder(iid, "yes", ids["student_user_id"])  # she answered
    _mark(app, iid, ids["student_id"], status="present")
    _mark(app, iid, ids["student_id"], clear=True)

    later = first + timedelta(hours=25)  # past hoursBetweenReminders (24 by default)
    pin_clock(monkeypatch, later)
    with app.app_context():
        send_class_reminders(iid, now=later, scheduled=True)
    assert _attempts(app, iid, ids["student_id"]) == 1, "she answered: no second question"


def test_a_clear_on_a_student_who_never_answered_still_gets_the_next_reminder(app, world, monkeypatch):
    """PIN (PAD-567, rule 23): a student who was asked, did NOT answer, and whose mark the coach
    cleared is asked again by the next pass — only an answer stops the questions."""
    from padel_app.services.notification_service import get_or_create_config, send_class_reminders

    ids, iid = world
    with app.app_context():
        get_or_create_config(ids["coach_id"]).reminder_count = 2
        db.session.commit()
    first = _fire()
    pin_clock(monkeypatch, first)
    with app.app_context():
        send_class_reminders(iid, now=first, scheduled=True)
    assert _attempts(app, iid, ids["student_id"]) == 1, "reminder 1 went out"
    _mark(app, iid, ids["student_id"], status="present")
    _mark(app, iid, ids["student_id"], clear=True)
    from padel_app.services import reminder_attempt_service as attempts
    with app.app_context():
        assert attempts.has_answered(iid, ids["student_id"]) is False, "she never answered"
    assert _row(app, iid, ids["student_id"]).confirmed is False, "the clear took"
    later = first + timedelta(hours=25)
    pin_clock(monkeypatch, later)
    with app.app_context():
        send_class_reminders(iid, now=later, scheduled=True)
    assert _attempts(app, iid, ids["student_id"]) == 2



def test_the_coachs_manual_send_also_leaves_an_answer_standing(app, world, monkeypatch):
    """Rule 23 (PAD-622): the coach's "Enviar lembretes" (a non-scheduled pass) does not re-ask an
    answered student whose mark was cleared either."""
    from padel_app.services.notification_service import get_or_create_config, respond_to_reminder, send_class_reminders

    ids, iid = world
    with app.app_context():
        get_or_create_config(ids["coach_id"]).reminder_count = 2
        db.session.commit()
    first = _fire()
    pin_clock(monkeypatch, first)
    with app.app_context():
        send_class_reminders(iid, now=first, scheduled=True)
        respond_to_reminder(iid, "yes", ids["student_user_id"])
    _mark(app, iid, ids["student_id"], status="present")
    _mark(app, iid, ids["student_id"], clear=True)
    with app.app_context():
        send_class_reminders(iid, now=first + timedelta(minutes=5), scheduled=False)
    assert _attempts(app, iid, ids["student_id"]) == 1


def test_a_stale_not_enrolled_tap_does_not_silence_a_student_the_coach_re_adds(app, world, monkeypatch):
    """Review of PAD-622: a student removed from the date who taps the stale reminder gets
    "not_enrolled" — not an answer. Re-added by the coach, they are asked (rules 18, 19)."""
    from padel_app.models import LessonInstance
    from padel_app.services.lesson_service import enrol, unenrol
    from padel_app.services.notification_service import get_or_create_config, respond_to_reminder, send_class_reminders

    ids, iid = world
    with app.app_context():
        get_or_create_config(ids["coach_id"]).reminder_count = 2
        db.session.commit()
    first = _fire()
    pin_clock(monkeypatch, first)
    with app.app_context():
        send_class_reminders(iid, now=first, scheduled=True)
        unenrol(ids["student_id"], db.session.get(LessonInstance, iid))
        db.session.commit()
        # The stale tap of a student taken off this date while on the series roster: respond_to_reminder
        # records "not_enrolled" on the attempt (PAD-259 branch). Recorded here the same way.
        from padel_app.services import reminder_attempt_service as attempts
        attempts.mark_responded(attempts.latest_attempt(iid, ids["student_id"]), "not_enrolled", when=first)
        enrol(ids["student_id"], db.session.get(LessonInstance, iid), "coach")
        db.session.commit()
    later = first + timedelta(hours=25)
    pin_clock(monkeypatch, later)
    with app.app_context():
        send_class_reminders(iid, now=later, scheduled=True)
    assert _attempts(app, iid, ids["student_id"]) == 2
