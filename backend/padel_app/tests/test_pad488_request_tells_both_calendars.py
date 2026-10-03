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


# ── Join requests (academy classes): a decision moves a student onto a class ──

@pytest.mark.parametrize("accept", [True, False])
def test_a_join_request_decision_tells_the_coach_and_the_student(app, monkeypatch, accept):
    """Rule 19 (PAD-488 review): deciding a join request published nothing, so neither side's
    open calendar learned that the student is now on the class."""
    from padel_app.models import Coach, Vacancy
    from padel_app.models.players import Player
    from padel_app.tests.test_pad128_eligibility import _seed as _seed128
    from padel_app.tests.test_pad131_join_requests import _config, _decide as _decide_join
    from padel_app.tests.test_pad131_join_requests import _request as _ask, _student

    ids = _seed128(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    pid = _student(app, ids, "asker")
    with app.app_context():
        db.session.add(Vacancy(lesson_instance_id=ids["instance_id"], coach_id=ids["coach_id"], status="open"))
        db.session.commit()
        coach_user = db.session.get(Coach, ids["coach_id"]).user_id
        player_user = db.session.get(Player, pid).user_id
    rid, _, _ = _ask(app, ids, pid)
    sent = _capture(monkeypatch)
    _decide_join(app, ids, rid, accept=accept)
    told = sorted({uid for kind, uids in sent if kind == "join_request_decided" for uid in uids})
    assert told == sorted([coach_user, player_user])
