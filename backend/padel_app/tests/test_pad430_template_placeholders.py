"""
PAD-430 — message templates gain ``{type}``, ``{date}`` and ``{court}``.

notifications.message-templates rules 12-14:
- ``{type}``  the class type (academy/private) in the coach's locale;
- ``{date}``  the class's start as dd/mm;
- ``{court}`` the lesson's court name, and when there is none it disappears with
  the connector before it (and any empty brackets), leaving no broken text.

Exercised through the real reminder and manual-invite paths against the SQLite
``app`` fixture; ``publish`` and ``send_push_notification`` are patched out.
"""

from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db


PATCHES = [
    "padel_app.services.notification_service.publish",
    "padel_app.services.notification_service.send_push_notification",
]

# A Tuesday, far enough ahead that nothing else in the suite collides with it.
START = datetime(2027, 2, 23, 19, 0)


def _seed(app, *, language, lesson_type, court_name=None, enrol_student=True):
    from padel_app.models.users import User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.models.clubs import Club
    from padel_app.models.courts import Court
    from padel_app.models.coach_levels import CoachLevel
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.Association_CoachLessonInstance import (
        Association_CoachLessonInstance,
    )

    with app.app_context():
        coach_user = User(
            name="Placeholder Coach", username="pad430-coach", email="pad430-coach@test.com",
            password="hashed", status="active",
        )
        coach_user.language = language
        student_user = User(
            name="Ana Silva", username="pad430-student", email="pad430-student@test.com",
            password="hashed", status="active",
        )
        db.session.add_all([coach_user, student_user])
        db.session.flush()
        coach = Coach(user_id=coach_user.id)
        student = Player(user_id=student_user.id)
        club = Club(name="PAD-430 Club", description="", location="Test City")
        db.session.add_all([coach, student, club])
        db.session.flush()

        court_id = None
        if court_name:
            court = Court(club_id=club.id, name=court_name, position=0)
            db.session.add(court)
            db.session.flush()
            court_id = court.id

        level = CoachLevel(coach_id=coach.id, label="Beginner", code="B1", display_order=1)
        db.session.add(level)
        db.session.flush()

        lesson = Lesson(
            title="PAD-430 Class", start_datetime=START, end_datetime=START + timedelta(hours=1),
            is_recurring=False, type=lesson_type, max_players=4, color="#000000",
            status="active", club_id=club.id, court_id=court_id,
        )
        db.session.add(lesson)
        db.session.flush()
        instance = LessonInstance(
            lesson_id=lesson.id, start_datetime=START, end_datetime=START + timedelta(hours=1),
            max_players=4, status="scheduled", level_id=level.id, notifications_enabled=True,
        )
        db.session.add(instance)
        db.session.flush()
        db.session.add(Association_CoachLessonInstance(
            coach_id=coach.id, lesson_instance_id=instance.id,
        ))
        db.session.commit()

        if enrol_student:
            from padel_app.services.lesson_service import enrol

            enrol(student.id, instance, "coach")
        return {"coach_id": coach.id, "student_id": student.id, "instance_id": instance.id}


def _set_templates(app, coach_id, templates):
    from padel_app.services.notification_service import get_or_create_config

    with app.app_context():
        config = get_or_create_config(coach_id)
        config.message_templates = templates
        config.save()


def _texts(app, message_type):
    from padel_app.models.messages import Message

    with app.app_context():
        return [m.text for m in Message.query.filter_by(message_type=message_type).order_by(Message.id)]


def _remind(app, instance_id):
    from padel_app.services.notification_service import send_class_reminders

    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_class_reminders(instance_id, now=START - timedelta(hours=48))
    return _texts(app, "notification_reminder")


def _invite(app, ids):
    from padel_app.services.notification_service import send_manual_notifications

    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_manual_notifications(ids["instance_id"], [ids["student_id"]], ids["coach_id"])
    return _texts(app, "notification_invite")


INVITE_PT = "Olá {name}, abriu uma vaga numa aula {type} no dia {date} às {time} no {court}."


class TestEmptyCourtLeavesNoBrokenText:
    """Rule 14 — the formatter drops an empty ``{court}`` with its connector."""

    @pytest.mark.parametrize("template, expected", [
        ("aula às {time} no {court}.", "aula às 19:00."),
        ("aula às {time} na {court}!", "aula às 19:00!"),
        ("class at {time} on {court}.", "class at 19:00."),
        ("class at {time} at {court}.", "class at 19:00."),
        ("Aula {type} ({court})", "Aula academia"),
        ("Aula {type} ( {court} ), às {time}", "Aula academia, às 19:00"),
        ("Aula {type} [{court}]", "Aula academia"),
        ("No {court}, às {time}.", "Às 19:00."),
        ("{court}: aula às {time}", "Aula às 19:00"),
    ])
    def test_empty_court_goes_with_its_connector(self, template, expected):
        from padel_app.services.notification_service import _format_template

        assert _format_template(template, type="academia", time="19:00", court="") == expected

    @pytest.mark.parametrize("court", ["Campo 2", ""])
    @pytest.mark.parametrize("template, expected", [
        ("- Lembrete: aula às {time}.", "- Lembrete: aula às 19:00."),
        ("— {name}, aula às {time}.", "— Rui, aula às 19:00."),
        ("...e a aula às {time}", "...e a aula às 19:00"),
        ("!! Atenção: aula às {time}", "!! Atenção: aula às 19:00"),
    ])
    def test_a_template_that_opens_on_punctuation_keeps_it(self, template, expected, court):
        """B's review of #455: only what the empty placeholder exposed is stripped."""
        from padel_app.services.notification_service import _format_template

        assert _format_template(template, name="Rui", time="19:00", court=court) == expected

    def test_a_named_court_keeps_its_connector(self):
        from padel_app.services.notification_service import _format_template

        assert _format_template("às {time} no {court}.", time="19:00", court="Campo 2") == (
            "às 19:00 no Campo 2."
        )


class TestNewPlaceholdersRender:
    """Rules 12-14 on the real send paths."""

    def test_invite_renders_type_date_and_court_in_pt(self, app):
        ids = _seed(app, language="pt", lesson_type="private", court_name="Campo 2", enrol_student=False)
        _set_templates(app, ids["coach_id"], {"invite": INVITE_PT})

        assert _invite(app, ids) == [
            "Olá Ana, abriu uma vaga numa aula privada no dia 23/02 às 19:00 no Campo 2."
        ]

    def test_invite_without_a_court_leaves_no_dangling_connector(self, app):
        ids = _seed(app, language="pt", lesson_type="academy", enrol_student=False)
        _set_templates(app, ids["coach_id"], {"invite": INVITE_PT})

        assert _invite(app, ids) == [
            "Olá Ana, abriu uma vaga numa aula academia no dia 23/02 às 19:00."
        ]

    def test_reminder_renders_type_in_the_coach_locale_en(self, app):
        ids = _seed(app, language="en", lesson_type="academy", court_name="Court 1")
        _set_templates(app, ids["coach_id"], {
            "reminder": "Hi {name}, your {type} class on {date} at {time} is on {court}. Coming?",
        })

        assert _remind(app, ids["instance_id"]) == [
            "Hi Ana, your academy class on 23/02 at 19:00 is on Court 1. Coming?"
        ]

    def test_reminder_private_en(self, app):
        ids = _seed(app, language="en", lesson_type="private")
        _set_templates(app, ids["coach_id"], {"reminder": "Your {type} class ({court}) on {date}."})

        assert _remind(app, ids["instance_id"]) == ["Your private class on 23/02."]

    def test_no_raw_token_survives_on_any_class_template(self, app):
        """Every class-describing key substitutes the new tokens (rule 5)."""
        ids = _seed(app, language="pt", lesson_type="academy", court_name="Campo 1")
        _set_templates(app, ids["coach_id"], {"reminder": "{type} {date} {court}"})

        texts = _remind(app, ids["instance_id"])
        assert texts == ["academia 23/02 Campo 1"]
        for t in texts:
            assert "{" not in t
