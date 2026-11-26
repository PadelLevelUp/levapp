"""engine-store rule 13: an attendance request's answer on a new-engine class reaches the presence, as
the old engine's reminder answer did (``confirmed``, ``response``, ``responded_at``, and one
``presence_changed`` for the coach after the commit). A repeat yes the engine already counts repairs a
presence an earlier yes left unconfirmed.

``_seed`` (test_pad916_engine_store): one coach, a level-3 class at START, the first student its regular
on the left; NOW is two hours before.
"""
from datetime import timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_pad916_engine_store import NOW, START, _seed


@pytest.fixture
def new_class(app, monkeypatch):
    """One adopted (new-engine) class with its left regular, and every live event the app publishes
    recorded as it is sent (after its commit)."""
    from padel_app import realtime
    from padel_app.models.notification_config import NotificationConfig
    from padel_app.tests.helpers import pin_clock
    from padel_app.utils import expo_push, push_notifications

    import padel_app.services.engine_entry  # noqa: F401 — loaded before the pin, so it reads the pinned clock

    app.config["JWT_SECRET_KEY"] = "test-secret"
    monkeypatch.setattr(push_notifications, "send_push_notification", lambda **kw: None)
    monkeypatch.setattr(expo_push, "send_expo_push_to_user", lambda *a, **k: None)
    sent = []
    monkeypatch.setattr(realtime, "publish", lambda event, user_ids: sent.append((event, list(user_ids))))
    with app.app_context():
        pin_clock(monkeypatch, NOW)
        store, (session,), pids = _seed(app, players=3, capacity=4, side="left")
        db.session.add(NotificationConfig(coach_id=store.coach_of(session), auto_notify_enabled=True,
                                          open_spots_visible=True, engine_version="new",
                                          engine_switched_at=NOW - timedelta(days=1)))
        db.session.commit()
        sent.clear()
        yield store, session, pids, sent


def _instance(session):
    from padel_app.models.lesson_instances import LessonInstance

    return db.session.get(LessonInstance, int(session))


def _presence(session, student):
    from padel_app.models.presences import Presence

    return Presence.query.filter_by(lesson_instance_id=int(session), player_id=int(student)).one()


def _coach_user(store, session):
    from padel_app.models.coaches import Coach

    return db.session.get(Coach, store.coach_of(session)).user_id


def _presence_changed(sent, student):
    return [(e, to) for e, to in sent if e["type"] == "presence_changed" and e["payload"]["playerId"] == int(student)]


def _ask(session, student, at=NOW - timedelta(hours=1), response=None):
    from padel_app.models import ReminderAttempt

    db.session.add(ReminderAttempt(lesson_instance_id=int(session), player_id=int(student), number=1, sent_at=at,
                                   response=response, responded_at=at if response else None))
    db.session.commit()


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-25")
def test_a_yes_to_the_attendance_request_confirms_the_presence(new_class):
    from padel_app.models import ReminderAttempt
    from padel_app.services.engine_entry import answer_attendance_request

    store, session, (regular, *_), sent = new_class
    _ask(session, regular)
    p = _presence(session, regular)
    assert not p.confirmed and p.response == "none"

    at = NOW + timedelta(minutes=5)
    assert answer_attendance_request(_instance(session), p, "yes", at) == {"action": "confirmed"}

    p = _presence(session, regular)
    assert p.confirmed is True
    assert p.response == "confirmed" and p.responded_at == at
    assert ReminderAttempt.query.filter_by(lesson_instance_id=int(session), player_id=int(regular)).one().response == "yes"
    assert regular in store.snapshot(session).confirmed
    assert [to for _, to in _presence_changed(sent, regular)] == [[_coach_user(store, session)]]


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-26")
def test_a_repeat_yes_repairs_an_unconfirmed_presence(new_class):
    from padel_app.services.engine_entry import answer_attendance_request

    store, session, (regular, *_), sent = new_class
    _ask(session, regular, response="yes")              # an earlier yes the store wrote on the attempt only
    p = _presence(session, regular)
    assert not p.confirmed and p.response == "none"
    at = NOW + timedelta(minutes=5)
    assert regular in store.snapshot(session).confirmed  # rule 6: the engine counts the yes, so it answers nothing

    answer_attendance_request(_instance(session), _presence(session, regular), "yes", at)

    p = _presence(session, regular)
    assert p.confirmed is True
    assert p.response == "confirmed" and p.responded_at == at
    assert len(_presence_changed(sent, regular)) == 1

    # Once the class has started, a repeat yes repairs nothing.
    p.confirmed, p.response, p.responded_at = False, "none", None
    db.session.commit()
    sent.clear()
    answer_attendance_request(_instance(session), _presence(session, regular), "yes", START + timedelta(minutes=5))
    p = _presence(session, regular)
    assert not p.confirmed and p.response == "none" and _presence_changed(sent, regular) == []


@pytest.mark.criterion("NOTIFICATIONS-ENGINE-STORE-27")
def test_the_in_app_yes_confirms_the_presence(new_class, client):
    from padel_app.models.players import Player

    store, session, (regular, *_), sent = new_class
    _ask(session, regular)
    token = create_access_token(identity=str(db.session.get(Player, int(regular)).user_id))
    res = client.post("/api/app/notify/respond_reminder", json={"lessonInstanceId": int(session), "action": "yes"},
                      headers={"Authorization": f"Bearer {token}"})

    assert res.status_code == 200 and res.get_json()["action"] == "confirmed"
    db.session.expire_all()
    p = _presence(session, regular)
    assert p.confirmed is True
    assert p.response == "confirmed"
    assert len(_presence_changed(sent, regular)) == 1

