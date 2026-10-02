"""
PAD-488 (B-264) — every class-request transition tells BOTH sides' clients, the actor included,
so an open calendar on any of their devices refreshes.

Covered specs:
  classes.class-requests — rule 19

Before the fix `class_request_changed` went to the other party only: the coach's own other
devices never heard about the coach's accept.

Run:
    pytest padel_app/tests/test_pad488_request_tells_both_calendars.py -v
"""
import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad104_class_requests import DAY, _decide, _player, _request, _setup


def _capture(monkeypatch):
    from padel_app import realtime

    sent = []
    monkeypatch.setattr(
        realtime, "publish",
        lambda event, user_ids: sent.append((event["type"], sorted(set(user_ids)))),
    )
    return sent


def _user_ids(app, ids):
    from padel_app.models.players import Player

    with app.app_context():
        return ids["coach_user_id"], db.session.get(Player, ids["player_id"]).user_id


def _told(sent):
    return sorted({uid for kind, uids in sent if kind == "class_request_changed" for uid in uids})


@pytest.mark.parametrize("action,extra", [
    ("accept", {}),
    ("decline", {}),
    ("propose", {"date": DAY.isoformat(), "startTime": "15:00", "endTime": "16:00"}),
])
def test_a_coach_decision_tells_the_coach_too(app, monkeypatch, action, extra):
    ids = _setup(app)
    rid = _request(app, ids, "11:00", "12:00")
    sent = _capture(monkeypatch)
    _decide(app, ids, rid, action, **extra)
    assert _told(sent) == sorted(_user_ids(app, ids))


def test_a_withdraw_tells_the_student_too(app, monkeypatch):
    from padel_app.services.class_request_service import withdraw_class_request_service

    ids = _setup(app)
    rid = _request(app, ids, "11:00", "12:00")
    sent = _capture(monkeypatch)
    with app.app_context():
        withdraw_class_request_service(rid, _player(ids["player_id"]))
    assert _told(sent) == sorted(_user_ids(app, ids))


def test_a_new_request_tells_both(app, monkeypatch):
    ids = _setup(app)
    sent = _capture(monkeypatch)
    _request(app, ids, "11:00", "12:00")
    assert _told(sent) == sorted(_user_ids(app, ids))


def test_the_people_named_on_a_group_request_are_told_too(app, monkeypatch):
    """Rule 19: an accept enrols everyone named on the request, so each of their calendars
    is told — not only the requester's."""
    from padel_app.models.players import Player
    from padel_app.tests.test_pad357_availability_and_requests import _create, _world

    ids = _world(app)
    with app.app_context():
        rid = _create(app, ids, participants=["carla"]).id
        carla_user = db.session.get(Player, ids["carla"]).user_id
    sent = _capture(monkeypatch)
    _decide(app, ids, rid, "accept")
    assert _told(sent) == sorted([ids["coach_user_id"], ids["bruno_user_id"], carla_user])
