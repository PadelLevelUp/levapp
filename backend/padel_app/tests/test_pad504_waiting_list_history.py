"""
PAD-504 — classes.academy-class-booking rule 11: the student's waiting lists in their request
history. `GET /api/app/class-waiting-list` lists the caller's per-class entries with a derived
state (active / placed / canceled / passed / left); joining or leaving publishes
`waiting_list_changed` to the student and the coach.
"""
from datetime import timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_pad358_academy_classes import _add_class, _join, _setup
from padel_app.utils.dates import utcnow_naive


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _student_user_id(app, ids):
    from padel_app.models.players import Player

    with app.app_context():
        return db.session.get(Player, ids["student_id"]).user_id


def _entry(app, ids, instance_id):
    from padel_app.models.waiting_list_entry import WaitingListEntry

    with app.app_context():
        return WaitingListEntry.query.filter_by(lesson_instance_id=instance_id, player_id=ids["student_id"]).one()


def _set(app, model, row_id, **fields):
    with app.app_context():
        row = db.session.get(model, row_id)
        for k, v in fields.items():
            setattr(row, k, v)
        db.session.commit()


@pytest.fixture
def history(app):
    """One student, five full classes they joined the waiting list of, one per state."""
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.waiting_list_entry import WaitingListEntry
    from padel_app.services.lesson_service import enrol

    ids = _setup(app)
    classes = {}
    for i, name in enumerate(["Active", "Placed", "Left", "Passed", "Canceled"]):
        c = _add_class(app, ids, days=3 + i, title=f"WL {name}", max_players=2, filled=2)
        _join(app, ids, model="LessonInstance", original_id=c["instance_id"])
        entry = _entry(app, ids, c["instance_id"])
        # Joined one hour apart, oldest first, so "newest first" is checkable.
        _set(app, WaitingListEntry, entry.id, joined_at=utcnow_naive() - timedelta(hours=10 - i))
        classes[name] = c["instance_id"]

    with app.app_context():
        placed = _entry(app, ids, classes["Placed"])
        db.session.get(WaitingListEntry, placed.id).is_active = False
        enrol(ids["student_id"], db.session.get(LessonInstance, classes["Placed"]), "fill")
        db.session.commit()

    from padel_app.models.players import Player
    from padel_app.services.academy_class_service import leave_class_waiting_list_service

    with app.app_context():
        leave_class_waiting_list_service(db.session.get(Player, ids["student_id"]), classes["Left"])

    # Passed: the class started while the student was still listed (move it into the past).
    with app.app_context():
        inst = db.session.get(LessonInstance, classes["Passed"])
        inst.start_datetime = inst.start_datetime - timedelta(days=10)
        inst.end_datetime = inst.end_datetime - timedelta(days=10)
        db.session.commit()
    _set(app, LessonInstance, classes["Canceled"], status="canceled")
    return ids, classes


def _list(client, app, user_id):
    return client.get("/api/app/class-waiting-list", headers=_auth(app, user_id))


def test_the_student_sees_each_waiting_list_with_its_state(client, app, history):
    ids, classes = history
    resp = _list(client, app, _student_user_id(app, ids))
    assert resp.status_code == 200, resp.get_json()
    rows = resp.get_json()
    by_instance = {r["lessonInstanceId"]: r for r in rows}
    assert {name: by_instance[iid]["status"] for name, iid in classes.items()} == {
        "Active": "active", "Placed": "placed", "Left": "left", "Passed": "passed", "Canceled": "canceled",
    }
    row = by_instance[classes["Active"]]
    assert row["kind"] == "waiting_list"
    assert row["classTitle"] == "WL Active"
    assert row["coachName"] == "Coach"
    assert row["date"] and row["startTime"] == "18:00" and row["endTime"] == "19:00"
    assert row["createdAt"] == row["joinedAt"]
    # Newest first: Canceled joined last.
    assert [r["lessonInstanceId"] for r in rows] == [classes[n] for n in ["Canceled", "Passed", "Left", "Placed", "Active"]]


def test_only_students_list_waiting_lists(client, app, history):
    ids, _ = history
    assert _list(client, app, ids["coach_user_id"]).status_code == 403


def test_a_coach_who_is_also_a_student_lists_their_own(client, app, history):
    """Join and leave accept any caller with a player profile; the list does too."""
    from padel_app.models.coaches import Coach

    ids, classes = history
    student_uid = _student_user_id(app, ids)
    with app.app_context():
        db.session.add(Coach(user_id=student_uid))
        db.session.commit()
    resp = _list(client, app, student_uid)
    assert resp.status_code == 200, resp.get_json()
    assert {r["lessonInstanceId"] for r in resp.get_json()} == set(classes.values())


def test_another_students_entries_are_not_listed(client, app, history):
    from padel_app.models import User
    from padel_app.models.players import Player

    with app.app_context():
        u = User(name="Other", username="p504_other", password="x", status="active")
        db.session.add(u)
        db.session.flush()
        db.session.add(Player(user_id=u.id))
        db.session.commit()
        other_uid = u.id
    assert _list(client, app, other_uid).get_json() == []


def test_leaving_moves_the_row_to_left_and_tells_both(client, app, history, monkeypatch):
    events = []
    monkeypatch.setattr("padel_app.realtime.publish", lambda event, recipients: events.append((event["type"], sorted(recipients))))
    ids, classes = history
    student_uid = _student_user_id(app, ids)
    resp = client.post(f"/api/app/class-waiting-list/{classes['Active']}/leave", headers=_auth(app, student_uid))
    assert resp.status_code == 200, resp.get_json()
    rows = {r["lessonInstanceId"]: r for r in _list(client, app, student_uid).get_json()}
    assert rows[classes["Active"]]["status"] == "left"
    assert ("waiting_list_changed", sorted([student_uid, ids["coach_user_id"]])) in events


def test_joining_tells_both(app, monkeypatch):
    events = []
    monkeypatch.setattr("padel_app.realtime.publish", lambda event, recipients: events.append((event["type"], sorted(recipients))))
    ids = _setup(app)
    full = _add_class(app, ids, days=3, title="WL Join", max_players=2, filled=2)
    _join(app, ids, model="LessonInstance", original_id=full["instance_id"])
    assert ("waiting_list_changed", sorted([_student_user_id(app, ids), ids["coach_user_id"]])) in events
