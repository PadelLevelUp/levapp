"""B-729 (classes.class-requests rule 4a; classes.instance-enrollment rule 15): accepting a class request
creates a class with the student on it, so the same-hour refusal applies. It used to escape both routes
as a 500. Now the coach's accept and the student's accept of a proposal answer
`409 {code: "busy_same_hour", message, clashes}`, `/add_class`'s keys, and change nothing.

How the refusal fires: the accept re-checks the slot for every person (rule 13, `_validated_slot`), and
that check counts the same classes the same-hour check does, so a clash present before the accept is
refused `slot_taken` instead. The same-hour refusal fires when the clash lands between that check and
the class's creation (another coach adds the student, or the engine places them, in that window). The
test makes it land there: the student starts going to another coach's class at the same start right
after the slot check passes. This coach is on the new engine.
"""
from datetime import datetime, time, timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_pad104_class_requests import DAY, _request, _setup


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-secret"


def _new_engine(coach_id):
    from padel_app.models.notification_config import NotificationConfig

    config = NotificationConfig.query.filter_by(coach_id=coach_id).first()
    config.engine_version = "new"
    db.session.commit()


def _going_elsewhere(player_id, start: time, end: time):
    """Another coach's class on DAY with the student going to it."""
    from padel_app.models import Club, Coach, User
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.presences import Presence

    user = User(name="Ana", username=f"coach_b729_{start:%H%M}", password="x", status="active")
    db.session.add(user)
    db.session.flush()
    coach = Coach(user_id=user.id)
    db.session.add(coach)
    db.session.flush()
    s, e = datetime.combine(DAY, start), datetime.combine(DAY, end)
    lesson = Lesson(title=f"Ana {start:%H:%M}", start_datetime=s, end_datetime=e, is_recurring=False, type="academy",
                    max_players=4, color="#000", status="active", club_id=Club.query.first().id)
    db.session.add(lesson)
    db.session.flush()
    inst = LessonInstance(lesson_id=lesson.id, start_datetime=s, end_datetime=e, max_players=4, status="scheduled")
    db.session.add(inst)
    db.session.flush()
    db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))
    db.session.add(Presence(player_id=int(player_id), lesson_instance_id=inst.id, enrolment_source="coach"))
    db.session.commit()
    return inst.id


def _post(client, user_id, path, body=None):
    with client.application.app_context():
        token = create_access_token(identity=str(user_id))
    return client.post(f"/api/app/class-requests/{path}", json=body or {}, headers={"Authorization": f"Bearer {token}"})


def _state(rid):
    from padel_app.models import CalendarBlock, ClassRequest

    db.session.expire_all()
    row = db.session.get(ClassRequest, rid)
    hold = db.session.get(CalendarBlock, row.hold_block_id) if row.hold_block_id else None
    return row.status, row.lesson_id, hold is not None


def _clash_after_the_slot_check(monkeypatch):
    """Arm with a (start, end): the next slot check that passes is followed at once by the student going
    to another coach's class at that start, as a concurrent add committing in that window would leave it."""
    from padel_app.services import class_request_service as crs

    armed, made = [], []
    check = crs._validated_slot

    def checked(coach, data, **kw):
        out = check(coach, data, **kw)
        if armed:
            player = kw["people"][0]
            made.append(_going_elsewhere(player.id, *armed.pop()))
        return out

    monkeypatch.setattr(crs, "_validated_slot", checked)
    return armed, made


def _world(app, monkeypatch):
    from padel_app.models.players import Player

    ids = _setup(app)
    with app.app_context():
        _new_engine(ids["coach_id"])
        ids["student_user"] = db.session.get(Player, ids["player_id"]).user_id
    rid = _request(app, ids, "11:00", "12:00")
    armed, made = _clash_after_the_slot_check(monkeypatch)
    return ids, rid, armed, made


def _lessons(app, coach_id):
    """This coach's classes (the clash helper's class belongs to another coach)."""
    from padel_app.models import Association_CoachLesson

    with app.app_context():
        return Association_CoachLesson.query.filter_by(coach_id=coach_id).count()


def _check_refused(app, res, ids, made):
    assert res.status_code == 409, res.get_json()
    body = res.get_json()
    assert body["code"] == "busy_same_hour" and body["message"]
    assert [(c["playerId"], c["lessonInstanceId"]) for c in body["clashes"]] == [(ids["player_id"], made[0])]


# Each request runs outside the test's own app context: Flask's `g` lives on the app context, so a
# shared one would carry the coach's `current_player` into the student's request.

@pytest.mark.criterion("CLASSES-CLASS-REQUESTS-39")
def test_the_coachs_accept_that_clashes_at_the_same_hour_answers_409_and_changes_nothing(app, client, monkeypatch):
    ids, rid, armed, made = _world(app, monkeypatch)
    lessons = _lessons(app, ids["coach_id"])
    armed.append((time(11, 0), time(12, 0)))
    res = _post(client, ids["coach_user_id"], f"{rid}/accept")
    _check_refused(app, res, ids, made)
    with app.app_context():
        assert _state(rid) == ("pending", None, True)                          # still open, hold kept
    assert _lessons(app, ids["coach_id"]) == lessons


@pytest.mark.criterion("CLASSES-CLASS-REQUESTS-39")
def test_the_students_accept_of_a_proposal_that_clashes_answers_409_and_changes_nothing(app, client, monkeypatch):
    ids, rid, armed, made = _world(app, monkeypatch)
    res = _post(client, ids["coach_user_id"], f"{rid}/propose",
                {"date": DAY.isoformat(), "startTime": "15:00", "endTime": "16:00"})
    assert res.status_code == 200, res.get_json()
    lessons = _lessons(app, ids["coach_id"])
    armed.append((time(15, 0), time(16, 0)))
    res = _post(client, ids["student_user"], f"{rid}/accept-proposal")
    _check_refused(app, res, ids, made)
    with app.app_context():
        assert _state(rid) == ("countered", None, True)
    assert _lessons(app, ids["coach_id"]) == lessons
