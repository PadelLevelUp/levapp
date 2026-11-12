"""The new engine's message templates (notifications.message-templates, new-engine section N1-N2): the
three new keys, ``{sideName}`` and ``{count}``, rendered by the outbox's senders (PAD-916,
``services/engine_outbox.py``) for a new-engine session."""
from datetime import timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.invitation_engine.snapshot import SpotType
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, _invited, _seed


@pytest.fixture(autouse=True)
def _context(app, monkeypatch):
    from padel_app.utils import expo_push, push_notifications

    monkeypatch.setattr(push_notifications, "send_push_notification", lambda **kw: None)
    monkeypatch.setattr(expo_push, "send_expo_push_to_user", lambda *a, **k: None)
    with app.app_context():
        yield


def _send():
    from padel_app.services.engine_outbox import send_effect
    from padel_app.services.engine_store import dispatch

    return dispatch(send_effect, now=NOW)


def _text(message_type):
    from padel_app.models import Message

    return Message.query.filter_by(message_type=message_type).order_by(Message.id.desc()).first().text


def _coach_language(store, a, language):
    from padel_app.models import Coach, User

    db.session.get(User, db.session.get(Coach, store.coach_of(a)).user_id).language = language
    db.session.commit()


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-17")
def test_the_new_engine_keys_resolve_fully_in_both_locales(app):
    """With no stored texts, ``waiting_list_added``, ``side_moved`` and ``coach_no_candidate`` render as the
    locale's default with no raw placeholder: ``{sideName}`` the side word ("direito" / "right"), ``{count}``
    the uncovered spots; and ``{sideName}`` and ``{count}`` render "" in any other template."""
    from padel_app.models.notification_config import DEFAULT_MESSAGE_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES_PT
    from padel_app.services.notification_service import _format_template

    store, (a,), (_, x, _) = _seed(app)
    with store.unit((a,)):
        store.apply([fx.Placed(a, NOW, x, "R", "auto_from_waiting_list")])
    texts = {}
    for minute, language in ((1, "pt"), (2, "en")):
        _coach_language(store, a, language)
        at = NOW + timedelta(minutes=minute)
        with store.unit((a,)):
            store.apply([fx.Message(a, at, x, "added"), fx.Message(a, at, x, "side_moved"),
                         fx.CoachAlert(a, at, reason="no_candidate", spot_type=SpotType("R", 1), spots=2)])
        _send()
        texts[language] = {kind: _text(kind) for kind in ("added_to_class", "engine_side_moved", "engine_alert")}
    for language in ("pt", "en"):
        assert all("{" not in t for t in texts[language].values()), texts[language]
    assert "lista de espera" in texts["pt"]["added_to_class"] and "waiting list" in texts["en"]["added_to_class"]
    assert "lado direito" in texts["pt"]["engine_side_moved"] and "right side" in texts["en"]["engine_side_moved"]
    assert "2 vaga(s)" in texts["pt"]["engine_alert"] and "2 open spot(s)" in texts["en"]["engine_alert"]
    for defaults in (DEFAULT_MESSAGE_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES_PT):
        assert {"waiting_list_added", "side_moved", "coach_no_candidate"} <= set(defaults)
    assert _format_template("Hi {name}{sideName} {count}!", name="Ana") == "Hi Ana!"


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-18")
def test_a_coachs_text_wins_and_sorry_uses_waiting_list_offer(app):
    """A coach's stored ``waiting_list_added`` is used for the engine's ``added``; a blank stored
    ``side_moved`` falls back to the default; the engine's sorry is the coach's ``waiting_list_offer``."""
    from padel_app.models.notification_config import NotificationConfig

    store, (a,), (_, x, y) = _seed(app)
    config = NotificationConfig(coach_id=store.coach_of(a), message_templates={
        "waiting_list_added": "Entraste, {name}!", "side_moved": "   ", "waiting_list_offer": "Sem vaga, {name}."})
    db.session.add(config)
    db.session.commit()
    with store.unit((a,)):
        store.apply([_invited(a, x), fx.Placed(a, NOW, y, "R", "auto_from_waiting_list")])
    with store.unit((a,)):
        store.apply([fx.Sorry(a, NOW + timedelta(minutes=1), x), fx.Message(a, NOW + timedelta(minutes=1), x, "sorry"),
                     fx.Message(a, NOW + timedelta(minutes=1), y, "added"),
                     fx.Message(a, NOW + timedelta(minutes=1), y, "side_moved")])
    _send()
    assert _text("added_to_class") == "Entraste, S2!"
    assert _text("waiting_list_offer") == "Sem vaga, S1."
    assert "vais jogar do lado direito" in _text("engine_side_moved")
