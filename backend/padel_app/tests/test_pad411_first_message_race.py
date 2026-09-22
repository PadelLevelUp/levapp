"""PAD-411: two first messages to the same person at the same moment make ONE conversation and
BOTH messages arrive.

`_get_or_create_direct_conversation` (system messages: reminders, invitations, waiting-list
offers) and `_get_or_create_assistant_conversation` (replacement approvals) looked the
conversation up and then inserted it. Two callers that both found nothing both inserted the same
`participant_key`, and one failed on `ix_conversations_participant_key`, which lost its message.
Found by the PAD-407 race harnesses (Session-A's and Session-C's).

The race is forced, not hoped for: both threads are held at a gate on the `INSERT INTO
conversations` statement, so both have already looked and found nothing. Postgres only: SQLite
has one writer, and the loser would fail on "database is locked" instead.
"""
import contextlib
import os
import threading
from unittest.mock import patch

import pytest
from sqlalchemy import event

from padel_app.sql_db import db

pytestmark = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="needs two real connections",
)

GATE_SECONDS = 3


def _users(app, n=2):
    from padel_app.models.users import User

    with app.app_context():
        ids = []
        for i in range(n):
            user = User(name=f"U{i}", username=f"pad411_u{i}", email=f"pad411_{i}@t.test", password="x", status="active")
            db.session.add(user)
            db.session.flush()
            ids.append(user.id)
        db.session.commit()
        return ids


@contextlib.contextmanager
def _both_threads_reach_the_insert(app):
    """Hold each thread's INSERT INTO conversations until the other has reached its own."""
    gate = threading.Barrier(2)

    def _hold(conn, cursor, statement, *_a, **_k):
        if statement.lstrip().upper().startswith("INSERT INTO CONVERSATIONS"):
            try:
                gate.wait(timeout=GATE_SECONDS)
            except threading.BrokenBarrierError:
                pass

    with app.app_context():
        engine = db.engine
    event.listen(engine, "before_cursor_execute", _hold)
    try:
        yield
    finally:
        event.remove(engine, "before_cursor_execute", _hold)


def _race(app, fn, n=2):
    errors, results = [], []

    def run():
        try:
            with app.app_context():
                results.append(fn())
                db.session.commit()
                db.session.remove()
        except BaseException as exc:  # noqa: BLE001 — surfaced below
            errors.append(exc)

    threads = [threading.Thread(target=run) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)
    assert not any(t.is_alive() for t in threads)
    return results, errors


def _conversations(app, key):
    from padel_app.models import Conversation, ConversationParticipant

    with app.app_context():
        rows = Conversation.query.filter_by(participant_key=key).all()
        participants = {
            p.user_id for c in rows for p in ConversationParticipant.query.filter_by(conversation_id=c.id).all()
        }
        return len(rows), participants


def test_two_first_system_messages_at_once_make_one_conversation_and_both_arrive(app):
    from padel_app.models import Conversation, Message
    from padel_app.services.notification_service import _send_system_message

    coach_uid, student_uid = _users(app)
    key = Conversation.build_participant_key([coach_uid, student_uid])

    def send():
        return _send_system_message(coach_uid, student_uid, "Olá", message_type="text").id

    with patch("padel_app.services.notification_service.publish"), \
            patch("padel_app.services.notification_service.send_push_notification"), \
            patch("padel_app.utils.expo_push.send_expo_push_to_user"), \
            _both_threads_reach_the_insert(app):
        sent, errors = _race(app, send)

    assert not errors, errors
    assert _conversations(app, key) == (1, {coach_uid, student_uid})
    with app.app_context():
        conv_id = Conversation.query.filter_by(participant_key=key).one().id
        assert Message.query.filter_by(conversation_id=conv_id).count() == 2, "both messages arrive"
    assert len(set(sent)) == 2


def test_two_first_assistant_prompts_at_once_make_one_conversation(app):
    from padel_app.services.replacement_approval_service import _get_or_create_assistant_conversation

    (coach_uid,) = _users(app, 1)

    def get():
        conv, assistant = _get_or_create_assistant_conversation(coach_uid)
        return conv.id, assistant.id

    with app.app_context():  # the assistant user exists before the race, as in prod
        from padel_app.services.replacement_approval_service import get_or_create_assistant_user

        assistant_uid = get_or_create_assistant_user().id
        db.session.commit()
    with _both_threads_reach_the_insert(app):
        got, errors = _race(app, get)

    assert not errors, errors
    assert len({conv_id for conv_id, _ in got}) == 1, "both callers get the same conversation"
    from padel_app.models import Conversation

    assert _conversations(app, Conversation.build_participant_key([assistant_uid, coach_uid])) == (
        1, {assistant_uid, coach_uid})


def test_the_second_caller_after_the_first_committed_reuses_the_conversation(app):
    """Trigger absent: no race, the ordinary look-up path."""
    from padel_app.models import Conversation
    from padel_app.services.notification_service import _get_or_create_direct_conversation

    coach_uid, student_uid = _users(app)
    with app.app_context():
        first = _get_or_create_direct_conversation(coach_uid, student_uid).id
        db.session.commit()
        again = _get_or_create_direct_conversation(coach_uid, student_uid).id
    assert first == again
    assert _conversations(app, Conversation.build_participant_key([coach_uid, student_uid]))[0] == 1
