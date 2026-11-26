"""PAD-815 (notifications.message-templates rule 27): the reference coach's Portuguese texts, approved by
the owner on 26 Nov 2026 ("815 approve as they are", "code, leave"), are the Portuguese built-ins.

Code only: no migration and no read-time mapping, so a stored text, a copy of an old default included,
is used as saved and nothing stored is rewritten. English is untouched.
"""
import copy
import hashlib
import json

import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad430_template_placeholders import _seed as _seed430
from padel_app.tests.test_pad670_placeholders_everywhere import EVE

APPROVED_PT = {
    "invite": "Olá {name}, abriu uma vaga {day} {date} às {time}. Queres vir?",
    "confirm": "Toop! Contamos contigo. Até {day}! 🎾",
    "decline": "Tranquilo, fica para a próxima!",
    "reminder": "Olá {name}, só para lembrar que tens aula {day} às {time}. Contamos contigo?",
    "reminder_followup": "Consegues vir {day}?",
    "reminder_confirmed": "Confirmado!",
    "reminder_declined": "Vale, então não conto contigo {day}.",
    "waiting_list_offer": "Esta vaga foi preenchida, mas podemos pôr-te na lista de espera e avisar-te se abrir outra. Queres?",
    "waiting_list_invite": "Olá {name}, estás na lista de espera da aula de {day} às {time}{side} e abriu uma vaga. Consegues vir?",
    "added_to_class": "Olá {name}, adicionei-te a {class}{when}. Obrigado! 🎾",
}

OLD_PT_REMINDER = "Olá {name}, lembrete: tens a aula esta {weekday} às {time}. Vens?"

# sha256 of json.dumps(dict, sort_keys=True, ensure_ascii=False) as of PAD-815's base: the English
# built-ins and the nine Portuguese keys rule 27 leaves alone must not move with this change.
EN_DIGEST = "2077e26512d3c730a0c61a7ee6bcc5bc55d7fe9557231a17f66a78c4b969f15d"
PT_OTHERS_DIGEST = "5827ca4967ebc5e1c4beced9c0483e2a7d1ac59a54e517736d8a41161dd36861"


def _digest(d):
    return hashlib.sha256(json.dumps(d, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-37")
def test_the_approved_pt_texts_are_the_built_ins_and_a_stored_text_is_kept(app):
    from padel_app.models.notification_config import (
        DEFAULT_MESSAGE_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES_PT, NotificationConfig,
    )

    for key, text in APPROVED_PT.items():
        assert DEFAULT_MESSAGE_TEMPLATES_PT[key] == text, key
    others = {k: v for k, v in DEFAULT_MESSAGE_TEMPLATES_PT.items() if k not in APPROVED_PT}
    assert len(others) == 9
    assert _digest(others) == PT_OTHERS_DIGEST
    assert _digest(DEFAULT_MESSAGE_TEMPLATES) == EN_DIGEST

    stored = {"reminder": OLD_PT_REMINDER}
    with app.app_context():
        config = NotificationConfig(message_templates=copy.deepcopy(stored))
        templates = config.get_message_templates("pt")
        assert templates["reminder"] == OLD_PT_REMINDER
        assert templates["reminder_declined"] == APPROVED_PT["reminder_declined"]
        assert config.message_templates == stored


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-37")
def test_every_placeholder_of_the_approved_texts_is_filled(app, monkeypatch):
    """Rule 27's last sentence: rendered with rule 3a's values for an occurrence, as every sending path
    does, no approved text leaves a raw or an empty placeholder."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import DEFAULT_MESSAGE_TEMPLATES_PT, resolve_message_template
    from padel_app.models.players import Player
    from padel_app.services.message_text import _format_template, template_variables

    pin_clock(monkeypatch, EVE)
    ids = _seed430(app, language="pt", lesson_type="academy", court_name="Campo 2")
    with app.app_context():
        instance = db.session.get(LessonInstance, ids["instance_id"])
        player = db.session.get(Player, ids["student_id"])
        rendered = {
            key: _format_template(
                resolve_message_template(None, key, "pt"),
                **template_variables(player, instance, "pt", side=" (lado esquerdo)" if key == "waiting_list_invite" else ""),
            )
            for key in APPROVED_PT
        }
    assert all(resolve_message_template(None, k, "pt") == DEFAULT_MESSAGE_TEMPLATES_PT[k] for k in APPROVED_PT)
    assert rendered == {
        "invite": "Olá Ana, abriu uma vaga amanhã 23/02 às 19:00. Queres vir?",
        "confirm": "Toop! Contamos contigo. Até amanhã! 🎾",
        "decline": "Tranquilo, fica para a próxima!",
        "reminder": "Olá Ana, só para lembrar que tens aula amanhã às 19:00. Contamos contigo?",
        "reminder_followup": "Consegues vir amanhã?",
        "reminder_confirmed": "Confirmado!",
        "reminder_declined": "Vale, então não conto contigo amanhã.",
        "waiting_list_offer": APPROVED_PT["waiting_list_offer"],
        "waiting_list_invite": "Olá Ana, estás na lista de espera da aula de amanhã às 19:00 (lado esquerdo) e abriu uma vaga. Consegues vir?",
        "added_to_class": "Olá Ana, adicionei-te a PAD-430 Class no dia 23/02 (terça-feira) às 19:00. Obrigado! 🎾",
    }
