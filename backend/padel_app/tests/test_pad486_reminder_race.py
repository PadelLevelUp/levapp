"""
PAD-490 review (#523): two reminders at once (two devices) must not both send.

The once-a-day check and the write are one step: the student's link row is locked
(SELECT ... FOR UPDATE) before the check, so the second request waits, then finds the first
reminder and answers 409. Needs two real connections, like test_pad411_first_message_race.
"""
import contextlib
import os
import threading
from unittest.mock import patch

import pytest
from sqlalchemy import event
from werkzeug.exceptions import HTTPException

from padel_app.sql_db import db

pytestmark = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="needs two real connections",
)

GATE_SECONDS = 3


@contextlib.contextmanager
def _both_threads_reach_the_message_insert(app):
    """Hold each INSERT INTO messages until the other thread reaches its own. Without the lock
    both threads pass the once-a-day check first and both insert; with it, the second waits on
    the lock and never reaches the insert while the first is open (the gate times out)."""
    gate = threading.Barrier(2)

    def _hold(conn, cursor, statement, *_a, **_k):
        if statement.lstrip().upper().startswith("INSERT INTO MESSAGES"):
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


def test_two_reminders_at_once_send_one(app):
    from padel_app.models import Message, User
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.services.profile_completeness_service import send_profile_reminder

    with app.app_context():
        cu = User(name="R Coach", username="p486r_coach", password="x", status="active")
        su = User(name="R Student", username="p486r_student", password="x", status="active")
        db.session.add_all([cu, su])
        db.session.flush()
        coach, player = Coach(user_id=cu.id), Player(user_id=su.id)
        db.session.add_all([coach, player])
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=player.id))
        db.session.commit()
        coach_id, player_id, student_uid = coach.id, player.id, su.id

    errors, sent = [], []

    def run():
        try:
            with app.app_context():
                sent.append(send_profile_reminder(player=db.session.get(Player, player_id), coach_id=coach_id).id)
                db.session.remove()
        except BaseException as exc:  # noqa: BLE001 — surfaced below
            errors.append(exc)

    with patch("padel_app.services.profile_completeness_service._push_to_coach"), \
            patch("padel_app.realtime.publish"), \
            _both_threads_reach_the_message_insert(app):
        threads = [threading.Thread(target=run) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
    assert not any(t.is_alive() for t in threads)

    with app.app_context():
        assert Message.query.filter_by(sender_id=student_uid, message_type="profile_reminder").count() == 1
    assert len(sent) == 1
    assert len(errors) == 1 and isinstance(errors[0], HTTPException)
    assert errors[0].response.status_code == 409
    assert errors[0].response.get_json()["code"] == "already_reminded"
