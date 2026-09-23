"""PAD-397: a pinned clock reaches every model column's clock default.

Each column below once held a function OBJECT (`datetime.utcnow` or `utcnow_naive`) bound at
import; `pin_clock` rebinds the NAME, so such a default kept writing the real instant beside
pinned rows. Now each is `default=lambda: utcnow_naive()`. The test calls the default the way
SQLAlchemy does — through `Column.default.arg` — under the pin and expects the pinned instant;
on the old bindings it fails by the wall clock. One family is also proven through a real
INSERT (a message row), the path a route takes.
"""
import datetime as dt

import pytest
from sqlalchemy import inspect

from padel_app.tests.helpers import pin_clock

NOW = dt.datetime(2026, 9, 21, 10, 0, 0)

COLUMNS = [
    ("padel_app.models.app_setting", "AppSetting", "created_at", "default"),
    ("padel_app.models.app_setting", "AppSetting", "updated_at", "default"),
    ("padel_app.models.app_setting", "AppSetting", "updated_at", "onupdate"),
    ("padel_app.models.bulk_import", "BulkImport", "created_at", "default"),
    ("padel_app.models.class_join_request", "ClassJoinRequest", "created_at", "default"),
    ("padel_app.models.club_join_request", "ClubJoinRequest", "requested_at", "default"),
    ("padel_app.models.coach_player_note", "CoachPlayerNote", "created_at", "default"),
    ("padel_app.models.conversation_participants", "ConversationParticipant", "joined_at", "default"),
    ("padel_app.models.evaluation_entry", "EvaluationEntry", "evaluated_at", "default"),
    ("padel_app.models.messages", "Message", "sent_at", "default"),
    ("padel_app.models.needs_you_snooze", "NeedsYouSnooze", "created_at", "default"),
    ("padel_app.models.player_level_history", "PlayerLevelHistory", "assigned_at", "default"),
    ("padel_app.models.standing_waiting_list_entry", "StandingWaitingListEntry", "created_at", "default"),
    ("padel_app.models.token_blocklist", "TokenBlocklist", "created_at", "default"),
    ("padel_app.models.vacancy", "Vacancy", "created_at", "default"),
    # PAD-405: the mixin columns every `model.Model` subclass inherits (backend/padel_app/model.py).
    ("padel_app.models.users", "User", "created_at", "default"),
    ("padel_app.models.users", "User", "updated_at", "default"),
    ("padel_app.models.users", "User", "updated_at", "onupdate"),
    ("padel_app.models.waiting_list_entry", "WaitingListEntry", "joined_at", "default"),
]


def _column(module, cls, name):
    import importlib

    model = getattr(importlib.import_module(module), cls)
    return inspect(model).columns[name]


@pytest.mark.parametrize("module,cls,name,kind", COLUMNS, ids=[f"{c}.{n}:{k}" for _, c, n, k in COLUMNS])
def test_the_pinned_clock_is_what_the_default_writes(app, monkeypatch, module, cls, name, kind):
    column = _column(module, cls, name)
    clock = getattr(column, kind)
    assert clock is not None, f"{cls}.{name} has no {kind}"
    pinned = NOW + dt.timedelta(hours=3)
    pin_clock(monkeypatch, pinned)
    # SQLAlchemy wraps a zero-argument default into a one-argument callable (the execution
    # context, unused by ours); call it the way the engine does.
    value = clock.arg(None) if clock.is_callable else clock.arg
    assert value == pinned, f"{cls}.{name} {kind} wrote {value!r}, not the pinned {pinned!r}"


def test_a_message_row_written_under_the_pin_carries_the_pinned_instant(app, monkeypatch):
    """The route path: a real INSERT, the default fired by the engine, the pinned instant stored."""
    from padel_app.models import Conversation, Message, User
    from padel_app.sql_db import db

    pinned = NOW + dt.timedelta(days=2, hours=5)
    pin_clock(monkeypatch, pinned)
    with app.app_context():
        user = User(name="Pin", username="pin397", email="pin397@t.test", password="x", status="active")
        db.session.add(user)
        db.session.flush()
        conversation = Conversation(participant_key=Conversation.build_participant_key([user.id]))
        db.session.add(conversation)
        db.session.flush()
        message = Message(conversation_id=conversation.id, sender_id=user.id, text="pinned")
        db.session.add(message)
        db.session.flush()
        assert message.sent_at == pinned


def test_save_stamps_the_pinned_instant(app, monkeypatch):
    """PAD-405: `Model.save()` stamps `updated_at` itself; under the pin it writes the pinned instant."""
    from padel_app.models import User

    pinned = NOW + dt.timedelta(days=1, hours=7)
    with app.app_context():
        user = User(name="Save", username="save405", email="save405@t.test", password="x", status="active")
        user.create()
        pin_clock(monkeypatch, pinned)
        user.name = "Saved"
        user.save()
        assert user.updated_at == pinned
