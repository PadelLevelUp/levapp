"""
PAD-830 — no default message puts the class level in front of the student.

The level is the coach's own grading; the seven student defaults that carried
``{level}`` now name the class by its day and time only. ``{level}`` stays a
placeholder, so a coach who writes it into their own text still gets it.

Covered spec: notifications.message-templates rule 20.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db

_KEYS = ("invite", "reminder", "reminder_followup", "waiting_list_invite", "class_cancelled",
         "waiting_list_added", "side_moved")
_LEVEL = "6-"


def _class_with_level(app):
    """A pt coach, a student Ana enrolled in a class with level "6-" two days out at 10:00."""
    from padel_app.models.users import User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.models.clubs import Club
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.services.lesson_service import enrol

    cu = User(name="Coach", username="p830_coach", email="c830@t.com", password="x",
              status="active", language="pt")
    su = User(name="Ana Silva", username="p830_student", email="s830@t.com", password="x",
              status="active", language="pt")
    db.session.add_all([cu, su]); db.session.flush()
    coach = Coach(user_id=cu.id); player = Player(user_id=su.id)
    db.session.add_all([coach, player]); db.session.flush()
    level = CoachLevel(coach_id=coach.id, label="Seis menos", code=_LEVEL)
    club = Club(name="P830", description="", location="x")
    db.session.add_all([level, club]); db.session.flush()
    start = datetime.utcnow().replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=2)
    lesson = Lesson(title="Quarta 10h", start_datetime=start, end_datetime=start + timedelta(hours=1),
                    is_recurring=False, type="academy", max_players=4, status="active",
                    club_id=club.id, default_level_id=level.id)
    db.session.add(lesson); db.session.flush()
    db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
    inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                          original_lesson_occurence_date=start.date(), max_players=4, level_id=level.id)
    db.session.add(inst); db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))
    enrol(player.id, inst, "roster")
    db.session.commit()
    return coach, player, inst


def _render(templates, key, player, inst, locale):
    from padel_app.models.notification_config import resolve_message_template
    from padel_app.services.message_text import _format_template, template_variables

    variables = template_variables(player, inst, locale)
    assert variables["level"] == _LEVEL  # the class has the level; only the text decides
    return _format_template(resolve_message_template(templates, key, locale), sideName="direito", **variables)


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-20")
def test_no_default_shows_the_class_level(app):
    from padel_app.models.notification_config import DEFAULT_MESSAGE_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES_PT

    for defaults in (DEFAULT_MESSAGE_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES_PT):
        assert not [k for k, text in defaults.items() if "{level}" in text]
    with app.app_context():
        _, player, inst = _class_with_level(app)
        for locale in ("pt", "en"):
            for key in _KEYS:
                text = _render(None, key, player, inst, locale)
                assert _LEVEL not in text and "{" not in text, f"{locale}/{key}: {text!r}"


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-20")
def test_a_coachs_own_level_still_renders(app):
    from padel_app.models.notification_config import NotificationConfig

    with app.app_context():
        coach, player, inst = _class_with_level(app)
        stored = {key: f"Olá {{name}}, aula de {{level}} ({key})." for key in _KEYS}
        config = NotificationConfig(coach_id=coach.id, message_templates=dict(stored))
        db.session.add(config); db.session.commit()
        for key in _KEYS:
            text = _render(config.get_message_templates("pt"), key, player, inst, "pt")
            assert text == f"Olá Ana, aula de {_LEVEL} ({key}).", text
        db.session.refresh(config)
        assert config.message_templates == stored


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-20")
def test_the_default_reminder_reaches_the_student_without_the_level(app):
    """End to end through send_class_reminders, in pt, on the default template."""
    from padel_app.models.messages import Message
    from padel_app.services.notification_service import send_class_reminders

    with app.app_context():
        _, _, inst = _class_with_level(app)
        with patch("padel_app.services.notification_service.publish"), \
             patch("padel_app.services.notification_service.send_push_notification"), \
             patch("padel_app.utils.expo_push.send_expo_push_to_user"):
            send_class_reminders(inst.id, now=datetime.utcnow())

        msg = Message.query.filter_by(message_type="notification_reminder").first()
        assert msg is not None
        assert _LEVEL not in msg.text and "tens a aula esta" in msg.text, msg.text
