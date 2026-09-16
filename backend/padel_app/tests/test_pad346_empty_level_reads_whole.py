"""
PAD-346 (B-098) — a class with no level must read whole, connector included.

Every Portuguese default template puts ``{level}`` after the genitive "de";
rendering the empty level as an empty string left "aula de esta quarta-feira"
and "aula de de quarta-feira" — the double space was already collapsed
(PAD-38), the dangling noun phrase was not.

Covered spec: notifications.message-templates rule 7.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db

_LEVEL_TEMPLATES = ("invite", "reminder", "reminder_followup", "waiting_list_placed", "class_cancelled")


def _render(template):
    from padel_app.services.notification_service import _format_template
    return _format_template(template, name="Ana", level="", weekday="quarta-feira", time="10:00")


@pytest.mark.parametrize("key", _LEVEL_TEMPLATES)
def test_pt_defaults_drop_the_level_phrase_whole(key):
    from padel_app.models.notification_config import DEFAULT_MESSAGE_TEMPLATES_PT
    text = _render(DEFAULT_MESSAGE_TEMPLATES_PT[key])
    for artifact in ("de esta", "de na", "de de", "de quarta" if key != "class_cancelled" else "de de", "  ", "{level}"):
        assert artifact not in text, f"{key}: {artifact!r} in {text!r}"
    assert "aula" in text


def test_pt_reminder_exact_text():
    from padel_app.models.notification_config import DEFAULT_MESSAGE_TEMPLATES_PT
    assert _render(DEFAULT_MESSAGE_TEMPLATES_PT["reminder"]) == \
        "Olá Ana, lembrete: tens a aula esta quarta-feira às 10:00. Vens?"
    assert _render(DEFAULT_MESSAGE_TEMPLATES_PT["class_cancelled"]) == \
        "Olá Ana, a tua aula de quarta-feira às 10:00 foi cancelada. Pedimos desculpa pelo incómodo!"


@pytest.mark.parametrize("key", _LEVEL_TEMPLATES)
def test_en_defaults_still_read_whole(key):
    from padel_app.models.notification_config import DEFAULT_MESSAGE_TEMPLATES
    text = _render(DEFAULT_MESSAGE_TEMPLATES[key])
    assert "  " not in text and "{level}" not in text and " class" in text


def test_a_level_keeps_its_connector():
    """With a level the phrase is untouched — the connector is only dropped
    when the placeholder is empty."""
    from padel_app.services.notification_service import _format_template
    assert _format_template("tens a aula de {level} esta {weekday}", level="M2", weekday="terça") == \
        "tens a aula de M2 esta terça"
    # A coach's own connector that is not a genitive is left alone.
    assert _format_template("aula com nível {level} amanhã", level="") == "aula com nível amanhã"


def test_reminder_for_a_level_less_class_reads_whole_end_to_end(app):
    """Through send_class_reminders, in pt, on the default template."""
    from padel_app.models.users import User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.messages import Message
    from padel_app.services.lesson_service import enrol
    from padel_app.services.notification_service import send_class_reminders

    with app.app_context():
        cu = User(name="Coach", username="p346_coach", email="c346@t.com", password="x",
                  status="active", language="pt")
        su = User(name="Ana Silva", username="p346_student", email="s346@t.com", password="x",
                  status="active", language="pt")
        db.session.add_all([cu, su]); db.session.flush()
        coach = Coach(user_id=cu.id); player = Player(user_id=su.id)
        db.session.add_all([coach, player]); db.session.flush()
        club = Club(name="P346", description="", location="x"); db.session.add(club); db.session.flush()
        start = datetime.utcnow().replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=2)
        lesson = Lesson(title="Sem nível", start_datetime=start, end_datetime=start + timedelta(hours=1),
                        is_recurring=False, type="academy", max_players=4, status="active",
                        club_id=club.id)
        db.session.add(lesson); db.session.flush()
        db.session.add(Association_CoachLesson(coach_id=coach.id, lesson_id=lesson.id))
        inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                              original_lesson_occurence_date=start.date(), max_players=4, level_id=None)
        db.session.add(inst); db.session.flush()
        db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))
        enrol(player.id, inst, "roster")
        db.session.commit()

        with patch("padel_app.services.notification_service.publish"), \
             patch("padel_app.services.notification_service.send_push_notification"), \
             patch("padel_app.utils.expo_push.send_expo_push_to_user"):
            send_class_reminders(inst.id, now=datetime.utcnow())

        msg = Message.query.filter_by(message_type="notification_reminder").first()
        assert msg is not None
        assert "aula de esta" not in msg.text and "  " not in msg.text, msg.text
        assert "tens a aula esta" in msg.text, msg.text
