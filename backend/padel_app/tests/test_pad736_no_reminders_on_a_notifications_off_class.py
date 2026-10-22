"""PAD-736 (B-620) — a class with notifications off sends no reminders.

notifications.toggle-class rule 3 (owner, 2026-10-22: "off means off"): `send_class_reminders`
never read `notifications_enabled`, so a class the coach had switched off still asked its students
"are you coming?". The automatic passes (the scheduler's, and the past-due "send now") now send
nothing for it, and the past-due listing no longer offers it. The coach's own "Enviar lembretes" and
a manual invitation are explicit sends and still go out (rule 3b, PAD-732).

    pytest padel_app/tests/test_pad736_no_reminders_on_a_notifications_off_class.py -v
"""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_notification_integration import PATCHES
from padel_app.tests.test_pad429_private_class_defaults import _class_with_a_candidate, _set
from padel_app.tests.test_pad478_ask_before_sending import PAST, _listed, _save, klass  # noqa: F401


def _a_class(app, name, *, on):
    from padel_app.models.lesson_instances import LessonInstance

    ids = _class_with_a_candidate(app, lesson_type="academy", name=name)
    if not on:
        _set(app, LessonInstance, ids["instance_id"], notifications_enabled=False)
    return ids


def _remind(app, ids, *, scheduled):
    from padel_app.services.notification_service import send_class_reminders

    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        return send_class_reminders(ids["instance_id"], now=datetime.utcnow() + timedelta(hours=30),
                                    scheduled=scheduled)


def _attempts(app, ids):
    from padel_app.models.reminder_attempts import ReminderAttempt

    with app.app_context():
        return ReminderAttempt.query.filter_by(lesson_instance_id=ids["instance_id"]).count()


def test_an_off_class_gets_no_automatic_reminder(app):
    ids = _a_class(app, "pad736-off", on=False)

    result = _remind(app, ids, scheduled=True)

    assert result["sent"] == 0
    assert result["more_due"] is False, "the chain is not re-armed"
    assert _attempts(app, ids) == 0


def test_the_coachs_own_send_on_an_off_class_goes_out(app):
    """Rule 3 (coordinator for the owner, 2026-10-22): "Enviar lembretes" is an explicit send."""
    ids = _a_class(app, "pad736-coach-send", on=False)

    assert _remind(app, ids, scheduled=False)["sent"] == 1
    assert _attempts(app, ids) == 1


def test_an_on_class_still_gets_its_reminder(app):
    ids = _a_class(app, "pad736-on", on=True)

    assert _remind(app, ids, scheduled=True)["sent"] == 1
    assert _attempts(app, ids) == 1


def test_a_manual_invitation_on_the_off_class_still_goes_out(app):
    """Rule 3b (PAD-732): the switch governs the engine's sends, not the coach's invitation."""
    from padel_app.services.notification_service import send_manual_notifications

    ids = _a_class(app, "pad736-manual", on=False)
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        sent = send_manual_notifications(ids["instance_id"], [ids["candidate_id"]], ids["coach_id"])
        assert len(sent) == 1
    assert _remind(app, ids, scheduled=True)["sent"] == 0


# ── the past-due listing (notifications.config rule 10f) ────────────────────

def test_a_past_due_off_class_is_not_offered(klass):
    from padel_app.models.lesson_instances import LessonInstance

    LessonInstance.query.get(klass["instance"]).notifications_enabled = False
    db.session.commit()
    _save(klass["coach"], PAST)

    assert _listed(klass["coach"])["reminders"] == []


def test_a_past_due_off_lesson_not_materialised_yet_is_not_offered(klass):
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson

    start = datetime(2027, 7, 11, 20, 0)
    lesson = Lesson(title="Off, not materialised", start_datetime=start, end_datetime=start.replace(hour=21),
                    is_recurring=False, type="academy", max_players=4, color="#000000",
                    status="active", club_id=Club.query.first().id, notifications_enabled=False)
    db.session.add(lesson)
    db.session.flush()
    db.session.add(Association_CoachLesson(coach_id=klass["coach"], lesson_id=lesson.id))
    db.session.add(Association_PlayerLesson(player_id=klass["student"], lesson_id=lesson.id))
    db.session.commit()
    _save(klass["coach"], PAST)

    assert [c["key"] for c in _listed(klass["coach"])["reminders"]] == [klass["key"]]
