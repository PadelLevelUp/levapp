"""engine-store rule 15 (STORE-35) on Postgres: two students who cancelled tap "Afinal vou" at the same
moment for the last place; the session's lock lets exactly one take it, and the class is never over its
capacity. Needs two real connections, so it runs only with ``LEVAPP_TEST_DB=postgres``."""
import os
import threading
from datetime import timedelta

import pytest

from padel_app.invitation_engine import effects as fx
from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW

AT = NOW + timedelta(minutes=5)
LATER = AT + timedelta(minutes=30)


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-35")
@pytest.mark.skipif(os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
                    reason="needs two real connections")
@pytest.mark.parametrize("locked", [True, False], ids=["with_the_lock", "control_without_it"])
def test_two_returns_race_for_the_last_place(app, monkeypatch, locked):
    """A class of 2 whose regular plays left; x and y (right only) each held the right place and cancelled.
    Each thread's apply is held at its first ``engine_effects`` insert until the other reaches its own:
    with the lock the second never gets there while the first is open, so it reads the committed placement
    and answers ``spot_filled``; the control drops the lock and must place both, or this proves nothing."""
    from sqlalchemy import event

    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.models.presences import Presence
    from padel_app.services import engine_store
    from padel_app.services.engine_entry import answer_attendance_request
    from padel_app.tests.test_pad916_engine_store import _seed
    from padel_app.utils import expo_push, push_notifications

    monkeypatch.setattr(push_notifications, "send_push_notification", lambda **kw: None)
    monkeypatch.setattr(expo_push, "send_expo_push_to_user", lambda *a, **k: None)
    with app.app_context():
        store, (a,), (reg, x, y) = _seed(app, side="right", capacity=2)
        coach_id = store.coach_of(a)
        db.session.add(NotificationConfig(coach_id=coach_id, auto_notify_enabled=False, engine_version="new",
                                          engine_switched_at=NOW - timedelta(days=1)))
        db.session.commit()
        inst = db.session.get(LessonInstance, int(a))
        for i, s in enumerate((x, y)):
            with store.unit((a,)):
                store.apply([fx.Placed(a, NOW + timedelta(minutes=i), s, "R", "invitation")])
            presence = Presence.query.filter_by(lesson_instance_id=int(a), player_id=int(s)).one()
            answer_attendance_request(inst, presence, "no", AT + timedelta(minutes=i))
        assert Association_CoachPlayer.query.filter_by(coach_id=coach_id, player_id=int(x)).one().side == "right"
        db.session.remove()
    if not locked:
        monkeypatch.setattr(engine_store.TableStore, "_lock_student", staticmethod(lambda pid: None))
        real = engine_store.TableStore.unit

        def unlocked(self, sessions, students=()):
            return real(self, (), ())
        monkeypatch.setattr(engine_store.TableStore, "unit", unlocked)

    gate = threading.Barrier(2)

    def _hold(conn, cursor, statement, *_a, **_k):
        if statement.lstrip().upper().startswith("INSERT INTO ENGINE_EFFECTS"):
            try:
                gate.wait(timeout=3)
            except threading.BrokenBarrierError:
                pass

    answers, errors = {}, []

    def tap(student):
        try:
            with app.app_context():
                inst = db.session.get(LessonInstance, int(a))
                presence = Presence.query.filter_by(lesson_instance_id=int(a), player_id=int(student)).one()
                answers[student] = answer_attendance_request(inst, presence, "yes", LATER)["action"]
                db.session.remove()
        except BaseException as exc:  # noqa: BLE001 — surfaced below
            errors.append(exc)

    with app.app_context():
        engine = db.engine
    event.listen(engine, "before_cursor_execute", _hold)
    try:
        threads = [threading.Thread(target=tap, args=(s,)) for s in (x, y)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=60)
    finally:
        event.remove(engine, "before_cursor_execute", _hold)
    assert not any(t.is_alive() for t in threads) and not errors, errors

    with app.app_context():
        going = {p.student for p in engine_store.TableStore(clock=lambda: LATER).snapshot(a).going}
    if locked:
        assert sorted(answers.values()) == ["confirmed", "spot_filled"]
        assert going in ({reg, x}, {reg, y})                  # never over the capacity of 2
    else:
        assert going == {reg, x, y}
