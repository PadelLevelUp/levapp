"""PAD-460 (part 1 of PAD-427) — classes.join-requests rule 17: the request lists show academy
join requests.

`GET /app/class-join-requests` lists the caller's join requests — a coach's every request
addressed to them, a student's own — newest first, all statuses, each with the class it is for
(`classTitle`, club-local `date`, `startTime`/`endTime`) and `kind: "academy"`. Anyone who is
neither gets 403. `/app/class-requests` (private requests) is untouched.

Seed: PAD-131's (the Phase-1 eligibility class, open spots visible).
"""
from padel_app.sql_db import db
from padel_app.tests.test_pad131_join_requests import _config, _decide, _request, _student
from padel_app.tests.test_pad128_eligibility import _seed

URL = "/api/app/class-join-requests"


def _headers(app, user_id):
    from flask_jwt_extended import create_access_token

    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _user_of(app, pid):
    from padel_app.models.players import Player

    with app.app_context():
        return db.session.get(Player, pid).user_id


def _class(app, ids):
    from padel_app.models.lesson_instances import LessonInstance

    with app.app_context():
        inst = db.session.get(LessonInstance, ids["instance_id"])
        return inst.start_datetime, inst.end_datetime


def _setup(app):
    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    carla = _student(app, ids, "carla")
    bruno = _student(app, ids, "bruno")
    return ids, carla, bruno


def test_the_coach_lists_every_join_request_newest_first_with_its_class(app, client):
    ids, carla, bruno = _setup(app)
    first, _, _ = _request(app, ids, carla)
    second, _, _ = _request(app, ids, bruno)
    start, end = _class(app, ids)

    res = client.get(URL, headers=_headers(app, ids["coach_user_id"]))

    assert res.status_code == 200, res.get_json()
    rows = res.get_json()
    assert [r["id"] for r in rows] == [second, first]
    row = rows[1]
    assert row["kind"] == "academy"
    assert row["status"] == "pending"
    assert row["classTitle"] == "Class"
    assert row["date"] == start.date().isoformat()
    assert row["startTime"] == start.strftime("%H:%M") and row["endTime"] == end.strftime("%H:%M")
    assert row["playerName"] and row["lessonInstanceId"] == str(ids["instance_id"])  # rule 15 shape: ids as strings


def test_a_student_lists_only_their_own(app, client):
    ids, carla, bruno = _setup(app)
    mine, _, _ = _request(app, ids, carla)
    _request(app, ids, bruno)

    res = client.get(URL, headers=_headers(app, _user_of(app, carla)))

    assert res.status_code == 200
    assert [r["id"] for r in res.get_json()] == [mine]


def test_decided_requests_stay_in_the_list(app, client):
    ids, carla, bruno = _setup(app)
    accepted, _, _ = _request(app, ids, carla)
    pending, _, _ = _request(app, ids, bruno)
    _decide(app, ids, accepted, accept=True)

    statuses = {r["id"]: r["status"] for r in client.get(URL, headers=_headers(app, ids["coach_user_id"])).get_json()}

    assert statuses == {accepted: "accepted", pending: "pending"}


def test_someone_who_is_neither_coach_nor_student_is_refused(app, client):
    from padel_app.models import User

    with app.app_context():
        u = User(name="Nobody", username="nobody460", password="x", status="active")
        db.session.add(u)
        db.session.commit()
        uid = u.id

    assert client.get(URL, headers=_headers(app, uid)).status_code == 403


def test_the_private_request_list_is_unchanged(app, client):
    """/app/class-requests still answers its own (private) rows only — a join request never
    appears there."""
    ids, carla, _ = _setup(app)
    _request(app, ids, carla)

    res = client.get("/api/app/class-requests", headers=_headers(app, ids["coach_user_id"]))

    assert res.status_code == 200 and res.get_json() == []
