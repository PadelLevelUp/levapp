"""PAD-640 — admin.data-export: `backend/scripts/export_user_data.py <user_id>` prints one person's
data as JSON for a data-subject access request. Read-only; never another person's messages; never a
password, code hash or token.
"""
import importlib.util
import io
import json
import pathlib
from datetime import datetime

import pytest

from padel_app.sql_db import db

SCRIPT = pathlib.Path(__file__).resolve().parents[2] / "scripts" / "export_user_data.py"


@pytest.fixture
def script():
    spec = importlib.util.spec_from_file_location("export_user_data", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _people(app):
    """Sara (a student with a player row) and coach Carla, in one conversation: Sara sent two
    messages and received one."""
    from padel_app.models import Coach, Message, Player, User
    from padel_app.models.conversation_participants import ConversationParticipant
    from padel_app.models.conversations import Conversation

    with app.app_context():
        sara = User(name="Sara Aluna", username="sara640x", email="sara@example.com", password="pbkdf2:SECRET-HASH",
                    status="active", email_verification_code_hash="CODE-HASH-640")
        carla = User(name="Carla Coach", username="carla640x", password="x", status="active")
        db.session.add_all([sara, carla])
        db.session.flush()
        player = Player(user_id=sara.id)
        coach = Coach(user_id=carla.id)
        db.session.add_all([player, coach])
        conv = Conversation(is_group=False, participant_key=Conversation.build_participant_key([sara.id, carla.id]))
        db.session.add(conv)
        db.session.flush()
        for uid in (sara.id, carla.id):
            db.session.add(ConversationParticipant(conversation_id=conv.id, user_id=uid))
        t = datetime(2026, 10, 1, 10, 0)
        db.session.add_all([
            Message(text="sara one", sent_at=t, conversation_id=conv.id, sender_id=sara.id),
            Message(text="CARLA PRIVATE", sent_at=t, conversation_id=conv.id, sender_id=carla.id),
            Message(text="sara two", sent_at=t, conversation_id=conv.id, sender_id=sara.id),
        ])
        db.session.commit()
        return sara.id, player.id


def _run(script, app, uid):
    out, err = io.StringIO(), io.StringIO()
    with app.app_context():
        code = script.main([str(uid)], out=out, err=err)
    return code, out.getvalue(), err.getvalue()


def test_one_users_data_and_only_theirs(script, app):
    uid, pid = _people(app)
    code, out, _ = _run(script, app, uid)
    assert code == 0
    doc = json.loads(out)
    assert doc["userId"] == uid
    assert doc["user"]["username"] == "sara640x"
    assert [r["id"] for r in doc["tables"]["players"]] == [pid]
    assert sorted(m["text"] for m in doc["tables"]["messages"]) == ["sara one", "sara two"]
    assert "CARLA PRIVATE" not in out
    assert "carla640x" not in out


def test_secrets_are_withheld(script, app):
    uid, _ = _people(app)
    _, out, _ = _run(script, app, uid)
    doc = json.loads(out)
    assert doc["user"]["password"] == "[withheld]"
    assert doc["user"]["email_verification_code_hash"] == "[withheld]"
    assert "SECRET-HASH" not in out and "CODE-HASH-640" not in out


def test_nothing_is_written(script, app, monkeypatch):
    from padel_app.models import User

    uid, _ = _people(app)

    def no_commit(*a, **k):
        raise AssertionError("the export committed")

    monkeypatch.setattr(db.session, "commit", no_commit)
    with app.app_context():
        before = db.session.get(User, uid).updated_at
    code, _, _ = _run(script, app, uid)
    assert code == 0
    with app.app_context():
        assert db.session.get(User, uid).updated_at == before


def test_an_unknown_id_exits_2_and_prints_nothing(script, app):
    code, out, err = _run(script, app, 999999)
    assert code == 2
    assert out == ""
    assert "no user 999999" in err


def test_staff_records_are_not_exported(script, app):
    uid, _ = _people(app)
    _, out, _ = _run(script, app, uid)
    tables = json.loads(out)["tables"]
    assert "admin_audit_log" not in tables and "deletion_audit" not in tables
