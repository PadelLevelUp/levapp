"""clubs.courts (PAD-194 v1) — a club's courts and the optional court on a class.

Rules 1–7: membership-scoped CRUD and ordering, name validation, the court on
add_class / edit_class, club + court on the calendar event and the class
detail, delete keeps classes, guarded migration.
"""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _auth(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _make_club(app, name="Court Club"):
    from padel_app.models import Club

    with app.app_context():
        club = Club(name=name, description="c", location="x")
        db.session.add(club)
        db.session.commit()
        return club.id


def _make_coach(app, username, club_id):
    from padel_app.models import User, Coach, Association_CoachClub

    with app.app_context():
        user = User(name=username, username=username, password="x", email=f"{username}@example.com")
        db.session.add(user)
        db.session.flush()
        coach = Coach(user_id=user.id, approval_status="approved")
        db.session.add(coach)
        db.session.flush()
        db.session.add(Association_CoachClub(coach_id=coach.id, club_id=club_id))
        db.session.commit()
        return user.id, coach.id


def _make_student(app, username):
    from padel_app.models import User
    from padel_app.models.players import Player

    with app.app_context():
        user = User(name=username, username=username, password="x", email=f"{username}@example.com")
        db.session.add(user)
        db.session.flush()
        db.session.add(Player(user_id=user.id))
        db.session.commit()
        return user.id


@pytest.fixture
def world(app):
    club1 = _make_club(app, "Club One")
    club2 = _make_club(app, "Club Two")
    a_user, a_coach = _make_coach(app, "coach_a", club1)
    b_user, b_coach = _make_coach(app, "coach_b", club2)
    student = _make_student(app, "court_student")
    return dict(club1=club1, club2=club2, a=_auth(app, a_user), b=_auth(app, b_user), student=_auth(app, student), a_coach=a_coach)


def _class_payload(**overrides):
    data = {
        "name": "Court Class",
        "classType": "academy",
        "maxPlayers": 6,
        "date": "2026-10-05",
        "startTime": "10:00",
        "endTime": "11:00",
        "isRecurring": False,
    }
    data.update(overrides)
    return data


# ---------------------------------------------------------------------------
# Rules 1–3: membership-scoped creation and listing
# ---------------------------------------------------------------------------

def test_courts_are_managed_by_the_clubs_coaches_only(client, world):
    c1 = world["club1"]
    r1 = client.post(f"/api/app/club/{c1}/courts", json={"name": "Campo 1"}, headers=world["a"])
    r2 = client.post(f"/api/app/club/{c1}/courts", json={"name": "Campo 2"}, headers=world["a"])
    assert r1.status_code == 201, r1.get_json()
    assert r2.status_code == 201
    listed = client.get(f"/api/app/club/{c1}/courts", headers=world["a"]).get_json()
    assert [c["name"] for c in listed] == ["Campo 1", "Campo 2"]
    assert [c["position"] for c in listed] == [0, 1]
    assert set(listed[0]) == {"id", "clubId", "name", "position"}

    assert client.get(f"/api/app/club/{c1}/courts", headers=world["b"]).status_code == 403
    assert client.post(f"/api/app/club/{c1}/courts", json={"name": "X"}, headers=world["b"]).status_code == 403
    assert client.get(f"/api/app/club/{c1}/courts", headers=world["student"]).status_code == 403
    assert client.post(f"/api/app/club/{c1}/courts", json={"name": "X"}, headers=world["student"]).status_code == 403
    court_id = listed[0]["id"]
    assert client.patch(f"/api/app/courts/{court_id}", json={"name": "Y"}, headers=world["b"]).status_code == 403
    assert client.delete(f"/api/app/courts/{court_id}", headers=world["student"]).status_code == 403


def test_names_are_validated(client, world):
    c1 = world["club1"]
    assert client.post(f"/api/app/club/{c1}/courts", json={"name": "Campo 1"}, headers=world["a"]).status_code == 201
    for bad in ("  campo 1 ", "", "x" * 90):
        res = client.post(f"/api/app/club/{c1}/courts", json={"name": bad}, headers=world["a"])
        assert res.status_code == 400, bad
        assert res.get_json()["code"] == "invalid_court"
    assert len(client.get(f"/api/app/club/{c1}/courts", headers=world["a"]).get_json()) == 1


# ---------------------------------------------------------------------------
# Rules 4–5: rename, reorder, delete
# ---------------------------------------------------------------------------

def test_rename_reorder_delete(client, world):
    c1 = world["club1"]
    h = world["a"]
    id1 = client.post(f"/api/app/club/{c1}/courts", json={"name": "Campo 1"}, headers=h).get_json()["id"]
    id2 = client.post(f"/api/app/club/{c1}/courts", json={"name": "Campo 2"}, headers=h).get_json()["id"]

    res = client.patch(f"/api/app/courts/{id2}", json={"name": "Campo central"}, headers=h)
    assert res.status_code == 200
    assert res.get_json()["name"] == "Campo central"

    res = client.put(f"/api/app/club/{c1}/courts/order", json={"ids": [id2, id1]}, headers=h)
    assert res.status_code == 200
    assert [c["name"] for c in res.get_json()] == ["Campo central", "Campo 1"]

    res = client.put(f"/api/app/club/{c1}/courts/order", json={"ids": [id2]}, headers=h)
    assert res.status_code == 400
    assert res.get_json()["code"] == "invalid_court"
    assert [c["name"] for c in client.get(f"/api/app/club/{c1}/courts", headers=h).get_json()] == ["Campo central", "Campo 1"]

    assert client.delete(f"/api/app/courts/{id1}", headers=h).status_code == 204
    assert [c["name"] for c in client.get(f"/api/app/club/{c1}/courts", headers=h).get_json()] == ["Campo central"]


# ---------------------------------------------------------------------------
# Rules 6–7: the court on a class, and club + court on the event
# ---------------------------------------------------------------------------

def test_a_class_carries_a_court(client, world):
    from padel_app.models import Lesson

    c1, c2, h = world["club1"], world["club2"], world["a"]
    court1 = client.post(f"/api/app/club/{c1}/courts", json={"name": "Campo 1"}, headers=h).get_json()["id"]
    other = client.post(f"/api/app/club/{c2}/courts", json={"name": "Outro"}, headers=world["b"]).get_json()["id"]

    res = client.post("/api/app/add_class", json=_class_payload(courtId=court1), headers=h)
    assert res.status_code == 200, res.get_json()
    event = res.get_json()
    assert event["court"] == {"id": court1, "name": "Campo 1"}
    assert event["club"] == {"id": c1, "name": "Club One"}

    res = client.post("/api/app/add_class", json=_class_payload(name="Wrong", courtId=other), headers=h)
    assert res.status_code == 400
    assert res.get_json()["code"] == "court_not_in_club"
    with client.application.app_context():
        assert Lesson.query.filter_by(title="Wrong").count() == 0

    # Edit (a Lesson template edits its series with scope "future"): null
    # clears; omitted leaves.
    payload = {"event": event, "scope": "future", "updates": {"name": "Court Class", "courtId": None}}
    res = client.post("/api/app/edit_class", json=payload, headers=h)
    assert res.status_code in (200, 201), res.get_json()
    with client.application.app_context():
        lesson = Lesson.query.filter_by(title="Court Class").first()
        assert lesson.court_id is None
    payload = {"event": event, "scope": "future", "updates": {"name": "Court Class", "courtId": court1}}
    assert client.post("/api/app/edit_class", json=payload, headers=h).status_code in (200, 201)
    payload = {"event": event, "scope": "future", "updates": {"name": "Court Class"}}
    assert client.post("/api/app/edit_class", json=payload, headers=h).status_code in (200, 201)
    with client.application.app_context():
        lesson = Lesson.query.filter_by(title="Court Class").first()
        assert lesson.court_id == court1
    payload = {"event": event, "scope": "future", "updates": {"name": "Court Class", "courtId": other}}
    res = client.post("/api/app/edit_class", json=payload, headers=h)
    assert res.status_code == 400
    assert res.get_json()["code"] == "court_not_in_club"


def test_class_detail_carries_club_and_court(client, world):
    from padel_app.serializers.lesson import serialize_class_instance
    from padel_app.models import Lesson

    c1, h = world["club1"], world["a"]
    court1 = client.post(f"/api/app/club/{c1}/courts", json={"name": "Campo 1"}, headers=h).get_json()["id"]
    assert client.post("/api/app/add_class", json=_class_payload(courtId=court1), headers=h).status_code == 200
    with client.application.app_context():
        lesson = Lesson.query.filter_by(title="Court Class").first()
        detail = serialize_class_instance(lesson)
        assert detail["clubName"] == "Club One"
        assert detail["courtId"] == court1
        assert detail["courtName"] == "Campo 1"


def test_deleting_a_court_keeps_its_classes(client, world):
    from padel_app.models import Lesson

    c1, h = world["club1"], world["a"]
    court1 = client.post(f"/api/app/club/{c1}/courts", json={"name": "Campo 1"}, headers=h).get_json()["id"]
    assert client.post("/api/app/add_class", json=_class_payload(courtId=court1), headers=h).status_code == 200
    assert client.delete(f"/api/app/courts/{court1}", headers=h).status_code == 204
    with client.application.app_context():
        lesson = Lesson.query.filter_by(title="Court Class").first()
        assert lesson is not None
        assert lesson.court_id is None
    from padel_app.serializers.calendar_event import serialize_calendar_event

    with client.application.app_context():
        lesson = Lesson.query.filter_by(title="Court Class").first()
        assert serialize_calendar_event(lesson)["court"] is None


def test_future_split_copies_the_court(client, world):
    from padel_app.models import Lesson

    c1, h = world["club1"], world["a"]
    court1 = client.post(f"/api/app/club/{c1}/courts", json={"name": "Campo 1"}, headers=h).get_json()["id"]
    res = client.post(
        "/api/app/add_class",
        json=_class_payload(
            name="Series",
            courtId=court1,
            isRecurring=True,
            recurrenceRule={"frequency": "weekly", "daysOfWeek": [1]},
            endDate="2026-12-21",
        ),
        headers=h,
    )
    assert res.status_code == 200, res.get_json()
    event = res.get_json()
    # Split the series one week in: the new series must carry the court.
    split_event = {**event, "date": "2026-10-12"}
    payload = {"event": split_event, "scope": "future", "updates": {"name": "Series B"}}
    res = client.post("/api/app/edit_class", json=payload, headers=h)
    assert res.status_code in (200, 201), res.get_json()
    with client.application.app_context():
        lessons = Lesson.query.filter(Lesson.title.in_(["Series", "Series B"])).all()
        assert len(lessons) == 2
        assert all(l.court_id == court1 for l in lessons)


# ---------------------------------------------------------------------------
# Migration
# ---------------------------------------------------------------------------

def test_migration_is_guarded():
    import pathlib

    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    matches = list(versions.glob("*pad194_courts*.py"))
    assert len(matches) == 1, matches
    src = matches[0].read_text()
    assert 'down_revision = "ad97ec649746"' in src or "down_revision = 'ad97ec649746'" in src
    assert "has_table" in src and "court_id" in src and "get_columns" in src
