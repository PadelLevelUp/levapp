"""
B-266 — a coach at two clubs editing a class at the OLDER club: the editor must offer the class's
own club's courts. The clients need the class's club id for that, and a refused court names the
field.

Covered specs:
  clubs.courts — rules 6 and 7, criterion "Editing a class offers its own club's courts"

Run:
    pytest padel_app/tests/test_b266_class_editor_courts.py -v
"""
from padel_app.sql_db import db
from padel_app.tests.test_courts import _class_payload, _jwt_secret, world  # noqa: F401  (fixtures)


def _join_newer_club(client, world):
    """Coach A creates a second club; being the newest membership, it becomes their current club."""
    res = client.post("/api/app/club", json={"name": "Newer Club"}, headers=world["a"])
    assert res.status_code == 201, res.get_json()
    return res.get_json()["id"]


def test_the_class_detail_names_its_own_club_even_when_the_coach_has_a_newer_one(client, world):
    from padel_app.models import Lesson
    from padel_app.serializers.lesson import serialize_class_instance

    c1, h = world["club1"], world["a"]
    assert client.post("/api/app/add_class", json=_class_payload(), headers=h).status_code == 200
    newer = _join_newer_club(client, world)
    coach = client.get("/api/app/coach", headers=h).get_json()
    assert coach["club"]["id"] == newer  # current club moved on…
    with client.application.app_context():
        detail = serialize_class_instance(Lesson.query.filter_by(title="Court Class").first())
    assert detail["clubId"] == c1  # …the class did not


def test_the_older_clubs_court_saves_and_the_newer_ones_is_refused_naming_the_field(client, world):
    from padel_app.models import Lesson

    c1, h = world["club1"], world["a"]
    old_court = client.post(f"/api/app/club/{c1}/courts", json={"name": "Old"}, headers=h).get_json()["id"]
    event = client.post("/api/app/add_class", json=_class_payload(), headers=h).get_json()
    newer = _join_newer_club(client, world)
    new_court = client.post(f"/api/app/club/{newer}/courts", json={"name": "New"}, headers=h).get_json()["id"]

    res = client.post("/api/app/edit_class", json={"event": event, "scope": "future", "updates": {"name": "Court Class", "courtId": new_court}}, headers=h)
    assert res.status_code == 400
    body = res.get_json()
    assert body["code"] == "court_not_in_club"
    assert body["fields"] == ["courtId"]

    res = client.post("/api/app/edit_class", json={"event": event, "scope": "future", "updates": {"name": "Court Class", "courtId": old_court}}, headers=h)
    assert res.status_code in (200, 201), res.get_json()
    with client.application.app_context():
        assert Lesson.query.filter_by(title="Court Class").first().court_id == old_court


def test_add_class_names_the_field_too(client, world):
    c2 = world["club2"]
    other = client.post(f"/api/app/club/{c2}/courts", json={"name": "Outro"}, headers=world["b"]).get_json()["id"]
    res = client.post("/api/app/add_class", json=_class_payload(courtId=other), headers=world["a"])
    assert res.status_code == 400
    assert res.get_json()["fields"] == ["courtId"]
