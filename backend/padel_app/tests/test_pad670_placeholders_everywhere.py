"""
PAD-670 — every placeholder works in every template (notifications.message-templates rule 3a).

Before, `confirm`, `decline`, `spot_filled`, `reminder_confirmed`, `reminder_declined`,
`waiting_list_offer` and `waiting_list_confirm` were sent raw: a `{day}` typed there reached the
student as `{day}`. Each is now rendered through `_format_template` with `template_variables`.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad430_template_placeholders import PATCHES, START, _seed as _seed430, _set_templates

# The evening before the class (Lisbon winter: wall clock == UTC), so `{day}` is "amanhã".
EVE = START - timedelta(days=1, hours=9)

RAW_TEMPLATE = "Oi {name}, {day} {class} {weekday} às {time} {type} {date} {court} {level} {when}!"


def _all_texts(app=None):
    from padel_app.models.messages import Message

    return [m.text for m in Message.query.order_by(Message.id).all()]


def _no_raw_token(text):
    assert "{" not in text and "}" not in text, f"raw placeholder left in: {text!r}"


# ── template_variables ─────────────────────────────────────────────────────────────────────────

class TestTemplateVariables:
    def test_an_occurrence_is_dated_and_a_series_is_weekday_only(self, app, monkeypatch):
        from padel_app.models.lesson_instances import LessonInstance
        from padel_app.models.players import Player
        from padel_app.services.notification_service import template_variables

        pin_clock(monkeypatch, EVE)
        ids = _seed430(app, language="pt", lesson_type="academy", court_name="Campo 2")
        with app.app_context():
            instance = db.session.get(LessonInstance, ids["instance_id"])
            player = db.session.get(Player, ids["student_id"])
            occ = template_variables(player, instance, "pt")
            series = template_variables(player, instance.lesson, "pt")

        assert occ["name"] == "Ana"  # the real first name
        assert occ["time"] == "19:00" and occ["weekday"] == "terça-feira"
        assert occ["day"] == "amanhã" and occ["date"] == "23/02"
        assert occ["court"] == "Campo 2" and occ["type"] == "academia"
        assert occ["class"] == "PAD-430 Class"
        assert occ["when"] == " no dia 23/02 (terça-feira) às 19:00"
        assert series["when"] == " na terça-feira às 19:00"
        assert "side" not in occ

    def test_side_is_passed_only_when_given(self, app):
        from padel_app.services.notification_service import template_variables

        with app.app_context():
            assert template_variables(None, None, "pt", side=" (lado esquerdo)")["side"] == " (lado esquerdo)"
            assert template_variables(None, None, "pt")["name"] == "there"


# ── reminder answers ───────────────────────────────────────────────────────────────────────────

def _remind_and_answer(app, ids, action):
    from padel_app.models.players import Player
    from padel_app.services.notification_service import respond_to_reminder, send_class_reminders

    with app.app_context():
        user_id = db.session.get(Player, ids["student_id"]).user_id
        with patch(PATCHES[0]), patch(PATCHES[1]):
            send_class_reminders(ids["instance_id"], now=EVE)
            respond_to_reminder(ids["instance_id"], action, user_id, now=EVE)
        return _all_texts()


def test_reminder_confirmed_renders_the_coachs_placeholders(app, monkeypatch):
    pin_clock(monkeypatch, EVE)
    ids = _seed430(app, language="pt", lesson_type="academy", court_name="Campo 2")
    _set_templates(app, ids["coach_id"], {"reminder_confirmed": "Obrigado {name}, até {day} às {time} no {court}!"})

    texts = _remind_and_answer(app, ids, "yes")

    assert "Obrigado Ana, até amanhã às 19:00 no Campo 2!" in texts


def test_reminder_declined_renders_the_coachs_placeholders(app, monkeypatch):
    pin_clock(monkeypatch, EVE)
    ids = _seed430(app, language="pt", lesson_type="academy", court_name="Campo 2")
    _set_templates(app, ids["coach_id"], {"reminder_declined": RAW_TEMPLATE})

    texts = _remind_and_answer(app, ids, "no")

    rendered = [t for t in texts if t.startswith("Oi Ana, amanhã PAD-430 Class terça-feira às 19:00 academia 23/02 Campo 2")]
    assert len(rendered) == 1, texts
    _no_raw_token(rendered[0])


# ── invitation answers: decline / confirm ──────────────────────────────────────────────────────

@pytest.mark.parametrize("action, key", [("no", "decline"), ("yes", "confirm")])
def test_invitation_answers_render_placeholders(app, monkeypatch, action, key):
    from padel_app.models import LessonInstance, NotificationEvent, Player
    from padel_app.services.notification_service import respond_to_notification, trigger_invitations
    from padel_app.tests.test_pad493_invitations_run_twice import NOW, _seed

    pin_clock(monkeypatch, NOW)
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance_id, coach_id, _, (a, _b) = _seed(enrolled=0, candidates=2, max_players=2)
        _set_templates(app, coach_id, {key: "Ok {name}: {day} {class} {time} {weekday} {when}"})
        trigger_invitations(LessonInstance.query.get(instance_id), coach_id, now=NOW)
        ev = NotificationEvent.query.filter_by(lesson_instance_id=instance_id, player_id=a).one()
        respond_to_notification(ev.id, action, Player.query.get(a).user_id, now=NOW + timedelta(minutes=1))

        sent = [t for t in _all_texts() if t.startswith("Ok P493Candidate0: amanhã P493 09:00")]
        assert len(sent) == 1, _all_texts()
        _no_raw_token(sent[0])


# ── waiting list ───────────────────────────────────────────────────────────────────────────────

def test_waiting_list_offer_and_confirm_render_placeholders(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.players import Player
    from padel_app.services.notification_service import (
        _offer_waiting_list, get_or_create_config, respond_to_waiting_list,
    )

    ids = _seed430(app, language="pt", lesson_type="academy", court_name="Campo 2", enrol_student=False)
    _set_templates(app, ids["coach_id"], {
        "waiting_list_offer": "Oferta {name}: {class} {weekday} {time} {court}",
        "waiting_list_confirm": "Na lista {name}: {class} {weekday} {time} {court}",
    })
    with app.app_context(), patch(PATCHES[0]), patch(PATCHES[1]):
        instance = db.session.get(LessonInstance, ids["instance_id"])
        user_id = db.session.get(Player, ids["student_id"]).user_id
        templates = get_or_create_config(ids["coach_id"]).get_message_templates("pt")
        _offer_waiting_list(ids["student_id"], instance, ids["coach_id"], templates, "pt")
        respond_to_waiting_list(ids["instance_id"], "yes", user_id)
        texts = _all_texts()

    assert "Oferta Ana: PAD-430 Class terça-feira 19:00 Campo 2" in texts
    assert "Na lista Ana: PAD-430 Class terça-feira 19:00 Campo 2" in texts


# ── spot_filled (join request closed by a full class) ──────────────────────────────────────────

def test_spot_filled_renders_placeholders_for_a_superseded_request(app):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.services.notification_service import _add_player_to_instance
    from padel_app.tests.test_pad131_join_requests import (
        _config, _fill_to_one_spot, _messages_for, _request, _seed, _student,
    )

    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True, auto_notify_enabled=True)
    _fill_to_one_spot(app, ids)
    asker = _student(app, ids, "asker")
    invited = _student(app, ids, "invited")
    _set_templates(app, ids["coach_id"], {"spot_filled": "Pena {name}, {class} {weekday} {time} {day}"})
    _request(app, ids, asker)
    with app.app_context():
        _add_player_to_instance(invited, db.session.get(LessonInstance, ids["instance_id"]))
        db.session.commit()

    replies = [
        text for from_player, text, meta in _messages_for(app, ids, asker)
        if not from_player and meta.get("joinRequest", {}).get("status") == "superseded"
    ]
    assert len(replies) == 1
    assert replies[0].startswith("Pena asker, ")
    _no_raw_token(replies[0])
