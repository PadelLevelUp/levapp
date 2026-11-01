"""PAD-798 (notifications.manual rule 10, notifications.invitations rule 20): once a class has
started, nobody is invited to it.

The owner's decision (2026-10-30), after PAD-792 took Convidar off the coach home for a class in
progress: the calendar's Notificar still sent invitations to a class whose start had passed. Manual
send now answers 409 CLASS_STARTED and creates nothing. The engine already stopped at the start
(PAD-68, `_instance_is_over`); these tests pin it next to the manual rule.

"Started" is on the club's clock (R-023): the class is 19:30 Lisbon on a summer day, 18:30 UTC, so
a check that compared the wall-clock start with UTC now would let the 18:45 UTC send through.
"""
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock

WALL_START = datetime(2027, 7, 13, 19, 30)  # Lisbon, WEST (UTC+1)
BEFORE = datetime(2027, 7, 13, 18, 29)  # UTC: 19:29 Lisbon, one minute to go
AT_START = datetime(2027, 7, 13, 18, 30)  # UTC: 19:30 Lisbon
RUNNING = datetime(2027, 7, 13, 18, 45)  # UTC: 19:45 Lisbon; 18:45 < 19:30 if read as wall clock


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-secret"


def _world(prefix):
    from test_semi_auto_approval import _seed_world

    world = _seed_world(prefix, mode="automatic", n_candidates=1)
    instance = world["instance"]
    for obj in (instance, instance.lesson):
        obj.start_datetime = WALL_START
        obj.end_datetime = WALL_START + timedelta(hours=1)
    instance.original_lesson_occurence_date = WALL_START.date()
    world["config"].invitation_start_timing = {"type": "hours_before", "value": 24}
    db.session.commit()
    return world


def _ids(world):
    """Plain ids for the HTTP tests, read inside the app context that made the world."""
    return {"coach_user": world["coach_user"].id, "instance": world["instance"].id,
            "candidate": world["candidates"][0][1].id}


def _events(instance_id):
    from padel_app.models import NotificationEvent

    return NotificationEvent.query.filter_by(lesson_instance_id=instance_id).count()


def _manual(app, client, ids):
    with app.app_context():
        token = create_access_token(identity=str(ids["coach_user"]))
    body = {"model": "LessonInstance", "originalId": ids["instance"], "playerIds": [ids["candidate"]]}
    return client.post("/api/app/notify/manual", json=body, headers={"Authorization": f"Bearer {token}"})


# ── manual rule 10: the coach's Notificar ─────────────────────────────────

def test_a_minute_before_the_start_the_coach_can_still_invite(app, client, monkeypatch):
    from test_semi_auto_approval import _patched_io

    with app.app_context():
        ids = _ids(_world("m798a"))
    pin_clock(monkeypatch, BEFORE)
    with _patched_io():
        res = _manual(app, client, ids)

    assert res.status_code == 200, res.get_json()
    assert res.get_json()["sent"] == 1
    with app.app_context():
        assert _events(ids["instance"]) == 1


@pytest.mark.parametrize("utc_now", [AT_START, RUNNING], ids=["at-start", "running"])
def test_once_the_class_has_started_manual_invitations_are_refused(app, client, monkeypatch, utc_now):
    from test_semi_auto_approval import _patched_io

    with app.app_context():
        ids = _ids(_world(f"m798{utc_now:%M}"))
    pin_clock(monkeypatch, utc_now)
    with _patched_io():
        res = _manual(app, client, ids)

    assert res.status_code == 409, res.get_json()
    assert res.get_json()["code"] == "CLASS_STARTED"
    with app.app_context():
        assert _events(ids["instance"]) == 0, "no invitation, no message, no push"


def test_another_coach_is_still_refused_as_not_their_class(app, client, monkeypatch):
    """The ownership check (manual rule 7) runs first: a stranger learns nothing about the class."""
    from test_semi_auto_approval import _create_coach, _create_user

    with app.app_context():
        ids = _ids(_world("m798o"))
        other = _create_user("Other 798", "other-798")
        _create_coach(other)
        db.session.commit()
        ids["coach_user"] = other.id
    pin_clock(monkeypatch, RUNNING)
    res = _manual(app, client, ids)

    assert res.status_code == 403


def test_the_service_refuses_too(app):
    """Every caller of `send_manual_notifications`, not only the route, meets the rule."""
    from test_semi_auto_approval import _patched_io

    from padel_app.services.notification_service import ClassStartedError, send_manual_notifications

    with app.app_context():
        world = _world("m798s")
        with _patched_io(), pytest.raises(ClassStartedError):
            send_manual_notifications(world["instance"].id, [world["candidates"][0][1].id],
                                      world["coach"].id, now=RUNNING)
        assert _events(world["instance"].id) == 0


# ── invitations rule 20: the engine stops at the start (PAD-68) ───────────

@pytest.mark.parametrize("utc_now, invites", [(BEFORE, True), (AT_START, False), (RUNNING, False)],
                         ids=["before", "at-start", "running"])
def test_the_engine_opens_no_round_once_the_class_has_started(app, utc_now, invites):
    from test_semi_auto_approval import _mark_absent, _patched_io

    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import trigger_invitations

    with app.app_context():
        world = _world(f"e798{utc_now:%M}")
        _mark_absent(world["instance"], world["enrolled"][0][1])
        with _patched_io():
            notified = trigger_invitations(world["instance"], world["coach"].id, now=utc_now)

        if invites:
            assert notified and _events(world["instance"].id) == 1  # the world really invites
        else:
            assert notified == []
            assert _events(world["instance"].id) == 0
            assert Vacancy.query.filter_by(lesson_instance_id=world["instance"].id).count() == 0


def test_a_round_under_way_does_not_continue_past_the_start(app):
    """A vacancy whose first batch went out before the start: the tick after the start sends no
    further batch, closes the vacancy, and expires the invitation already out, as it did before
    PAD-798."""
    from test_semi_auto_approval import _mark_absent, _patched_io

    from padel_app.models import NotificationEvent
    from padel_app.models.vacancy import Vacancy
    from padel_app.services.notification_service import process_invitation_batches, trigger_invitations

    with app.app_context():
        world = _world("t798")
        _mark_absent(world["instance"], world["enrolled"][0][1])
        with _patched_io():
            assert trigger_invitations(world["instance"], world["coach"].id, now=BEFORE)
        sent_before = {e.id: e.status for e in NotificationEvent.query.filter_by(
            lesson_instance_id=world["instance"].id)}

        with _patched_io():
            process_invitation_batches(now=RUNNING)

        after = {e.id: e.status for e in NotificationEvent.query.filter_by(
            lesson_instance_id=world["instance"].id)}
        assert after.keys() == sent_before.keys(), "no new invitation after the start"
        assert set(sent_before.values()) == {"sent"} and set(after.values()) == {"expired"}
        assert {v.status for v in Vacancy.query.filter_by(lesson_instance_id=world["instance"].id)} == {"expired"}
