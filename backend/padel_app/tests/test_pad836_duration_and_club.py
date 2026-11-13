"""
PAD-836 — message templates gain ``{duration}`` and ``{club}``.

notifications.message-templates rules 21-23:
- ``{duration}`` the class's length in whole minutes, "90 min", from the occurrence's own times
  (a series' message uses the lesson's); ``min`` in pt and en alike;
- ``{club}``     the name of the lesson's club; empty, it goes with its connector like ``{court}``;
- both work in every template, no default uses them, and the preview carries an example of each.
"""

from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad430_template_placeholders import PATCHES, _set_templates, _texts
from padel_app.tests.test_pad549_smart_day import coach_auth  # noqa: F401 (fixture)

# A Tuesday far ahead, 18:00 on the club's wall clock.
START = datetime(2027, 3, 9, 18, 0)


def _seed(app, *, language="pt", minutes=(60,)):
    """A coach, a student Ana, a lesson 18:00-19:00 at club "Padel Norte" and one occurrence per
    entry of ``minutes``, a week apart, each lasting that long."""
    from padel_app.models.users import User
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.models.clubs import Club
    from padel_app.models.lessons import Lesson
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance

    with app.app_context():
        coach_user = User(name="Duration Coach", username="pad836-coach", email="pad836-coach@test.com",
                          password="hashed", status="active")
        coach_user.language = language
        student_user = User(name="Ana Silva", username="pad836-student", email="pad836-student@test.com",
                            password="hashed", status="active")
        db.session.add_all([coach_user, student_user])
        db.session.flush()
        coach = Coach(user_id=coach_user.id)
        student = Player(user_id=student_user.id)
        club = Club(name="Padel Norte", description="", location="Porto")
        db.session.add_all([coach, student, club])
        db.session.flush()
        lesson = Lesson(title="Terça 18h", start_datetime=START, end_datetime=START + timedelta(hours=1),
                        is_recurring=False, type="academy", max_players=4, color="#000000",
                        status="active", club_id=club.id)
        db.session.add(lesson)
        db.session.flush()
        instance_ids = []
        for week, length in enumerate(minutes):
            start = START + timedelta(weeks=week)
            instance = LessonInstance(lesson_id=lesson.id, start_datetime=start,
                                      end_datetime=start + timedelta(minutes=length), max_players=4,
                                      status="scheduled", notifications_enabled=True)
            db.session.add(instance)
            db.session.flush()
            db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=instance.id))
            instance_ids.append(instance.id)
        db.session.commit()
        return {"coach_id": coach.id, "student_id": student.id, "lesson_id": lesson.id,
                "instance_ids": instance_ids}


def _invite(app, ids, instance_id):
    from padel_app.services.notification_service import send_manual_notifications

    with app.app_context():
        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_manual_notifications(instance_id, [ids["student_id"]], ids["coach_id"])
    return _texts(app, "notification_invite")[-1]


def _render(template, source, locale):
    from padel_app.models.players import Player
    from padel_app.services.message_text import _format_template, template_variables

    player = Player.query.first()
    return _format_template(template, **template_variables(player, source, locale))


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-21")
def test_duration_is_the_occurrence_length_in_minutes(app):
    from padel_app.models.lessons import Lesson

    ids = _seed(app, minutes=(60, 90, 75))
    _set_templates(app, ids["coach_id"], {"invite": "Aula de {duration} às {time}."})

    assert [_invite(app, ids, i) for i in ids["instance_ids"]] == [
        "Aula de 60 min às 18:00.", "Aula de 90 min às 18:00.", "Aula de 75 min às 18:00.",
    ]
    # A message about the whole series (an `added_to_class` on the lesson) takes the lesson's times.
    with app.app_context():
        lesson = db.session.get(Lesson, ids["lesson_id"])
        assert _render("{class}: {duration}", lesson, "pt") == "Terça 18h: 60 min"


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-22")
def test_duration_unit_is_min_in_pt_and_en(app):
    from padel_app.models.lesson_instances import LessonInstance

    ids = _seed(app, minutes=(90,))
    with app.app_context():
        instance = db.session.get(LessonInstance, ids["instance_ids"][0])
        for locale in ("pt", "en"):
            text = _render("{duration}", instance, locale)
            assert text == "90 min" and "h" not in text, (locale, text)


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-23")
def test_club_is_the_lessons_club(app):
    from padel_app.services.notification_service import send_class_reminders
    from padel_app.services.lesson_service import enrol
    from padel_app.models.lesson_instances import LessonInstance

    ids = _seed(app)
    _set_templates(app, ids["coach_id"], {"reminder": "Lembrete: {weekday} às {time} no {club}."})
    with app.app_context():
        enrol(ids["student_id"], db.session.get(LessonInstance, ids["instance_ids"][0]), "coach")
        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_class_reminders(ids["instance_ids"][0], now=START - timedelta(hours=48))

    (text,) = _texts(app, "notification_reminder")
    assert text.endswith("às 18:00 no Padel Norte."), text


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-24")
@pytest.mark.parametrize("template, expected", [
    ("aula às {time} no {club}.", "aula às 19:00."),
    ("Aula ({club})", "Aula"),
    ("aula de {duration} às {time}", "aula às 19:00"),
    ("No {club}, às {time}.", "Às 19:00."),
])
def test_empty_club_and_duration_take_their_connector(template, expected):
    from padel_app.services.message_text import _format_duration, _format_template

    assert _format_duration(START, None) == "" and _format_duration(START, START) == ""
    assert _format_template(template, time="19:00", club="", duration="") == expected


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-25")
def test_both_render_in_every_template_and_no_default_uses_them(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import (
        DEFAULT_MESSAGE_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES_PT, NotificationConfig,
    )

    for defaults in (DEFAULT_MESSAGE_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES_PT):
        assert not [k for k, t in defaults.items() if "{duration}" in t or "{club}" in t]

    ids = _seed(app)
    stored = {key: "{duration} {club}" for key in DEFAULT_MESSAGE_TEMPLATES_PT}
    _set_templates(app, ids["coach_id"], dict(stored))
    with app.app_context():
        config = NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).one()
        instance = db.session.get(LessonInstance, ids["instance_ids"][0])
        templates = config.get_message_templates("pt")
        for key in stored:
            assert _render(templates[key], instance, "pt") == "60 min Padel Norte", key
        assert "added_to_class" in stored and "added_to_class_coming" in stored
        db.session.refresh(config)
        assert config.message_templates == stored


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-26")
def test_preview_examples_carry_duration_and_club(client, coach_auth):  # noqa: F811
    res = client.post("/api/app/notify/template_preview", headers=coach_auth,
                      json={"template": "{duration} no {club}"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["examples"]["duration"] == "60 min"
    assert body["examples"]["club"]
    assert body["text"] == f"60 min no {body['examples']['club']}"
