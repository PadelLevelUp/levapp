"""PAD-664 — a student's calendar also shows the eligible classes that are full (calendar.view
rule 23, eligibility.open-spot-visibility rule 1a, classes.join-requests rule 16).

A full class is sent only to a client that declares `full-classes`: a build that declares
only `open-spots` would draw it as a joinable open spot and then be refused on tap. Every
"gets nothing" assertion sits beside a control that WOULD get it (R-032).
"""
from datetime import timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.models import Presence
from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _seed
from padel_app.tests.test_pad130_open_spots import _config
from padel_app.tests.test_pad611_student_relations import _instance
from padel_app.utils.dates import utcnow_naive

ALL = {"X-LevApp-Capabilities": "open-spots,student-relations,full-classes"}
WITHOUT_FULL = {"X-LevApp-Capabilities": "open-spots,student-relations"}


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _fill(app, ids, instance_id, count, tag):
    with app.app_context():
        for i in range(count):
            pid = _add_student(ids["coach_id"], f"{tag}{i}", level_id=ids["level_ids"]["5"])
            db.session.add(Presence(player_id=pid, lesson_instance_id=instance_id, invited=True, enrolment_source="coach"))
        db.session.commit()


def _world(app):
    """Open (1 of 4), full (4 of 4) and full-and-waiting (4 of 4, the student on its list)."""
    from padel_app.models.players import Player
    from padel_app.models.waiting_list_entry import WaitingListEntry

    ids = _seed(app, eligibility_rules=None)
    _config(app, ids, open_spots_visible=True)
    with app.app_context():
        pid = _add_student(ids["coach_id"], "seeker", level_id=ids["level_ids"]["5"])
        db.session.commit()
        token = create_access_token(identity=str(db.session.get(Player, pid).user_id))
    ids.update(player_id=pid, auth={"Authorization": f"Bearer {token}"})
    ids["open"] = _instance(app, ids, days=4, title="Open")
    ids["full"] = _instance(app, ids, days=5, title="Full")
    ids["full_waiting"] = _instance(app, ids, days=6, title="Full waiting")
    _fill(app, ids, ids["open"], 1, "o")
    _fill(app, ids, ids["full"], 4, "f")
    _fill(app, ids, ids["full_waiting"], 4, "w")
    with app.app_context():
        db.session.add(WaitingListEntry(
            lesson_instance_id=ids["full_waiting"], player_id=pid, coach_id=ids["coach_id"], is_active=True,
        ))
        db.session.commit()
    return ids


def _calendar(client, ids, headers=None):
    now = utcnow_naive()
    window = {"from": (now - timedelta(days=1)).isoformat(), "to": (now + timedelta(days=30)).isoformat()}
    resp = client.get("/api/app/calendar", query_string=window, headers={**ids["auth"], **(headers or {})})
    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    return [e for e in resp.get_json() if e.get("model") == "LessonInstance"]


def _by_id(events):
    return {e["originalId"]: e for e in events}


def test_a_declaring_client_gets_open_full_and_waiting_each_once(app, client):
    ids = _world(app)
    events = _calendar(client, ids, ALL)
    by_id = _by_id(events)
    assert by_id[ids["open"]]["studentRelation"] == "open_spot"
    assert by_id[ids["open"]]["spotsLeft"] == 3
    assert by_id[ids["open"]]["state"] == "open"
    full = by_id[ids["full"]]
    assert (full["studentRelation"], full["state"], full["spotsLeft"], full["openSpot"]) == ("full", "full", 0, True)
    assert by_id[ids["full_waiting"]]["studentRelation"] == "waiting"
    ids_seen = [e["originalId"] for e in events]
    assert len(ids_seen) == len(set(ids_seen))


def test_a_client_without_full_classes_never_gets_a_full_class(app, client):
    ids = _world(app)
    # Control: the declaring client gets it.
    assert ids["full"] in _by_id(_calendar(client, ids, ALL))
    for headers in (WITHOUT_FULL, {"X-LevApp-Capabilities": "open-spots"}, None):
        events = _calendar(client, ids, headers)
        assert ids["full"] not in _by_id(events)
        assert all(e.get("studentRelation") != "full" for e in events)
    # The pre-PAD-664 shape for the open spot is unchanged for such a client.
    assert _by_id(_calendar(client, ids, WITHOUT_FULL))[ids["open"]]["studentRelation"] == "open_spot"


def test_a_full_class_opens_by_id_only_for_a_client_declaring_full_classes(app, client):
    ids = _world(app)
    path = f"/api/app/lesson_instance/{ids['full']}"
    assert client.get(path, headers={**ids["auth"], **ALL}).status_code == 200
    refused = client.get(path, headers={**ids["auth"], **WITHOUT_FULL})
    assert refused.status_code == 403, refused.get_data(as_text=True)[:200]


def test_opening_a_full_class_lets_the_student_join_its_waiting_list(app, client):
    from padel_app.models.waiting_list_entry import WaitingListEntry

    ids = _world(app)
    resp = client.post(
        "/api/app/class-waiting-list",
        json={"model": "LessonInstance", "originalId": ids["full"], "date": None},
        headers={**ids["auth"], **ALL},
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)[:200]
    with app.app_context():
        assert WaitingListEntry.query.filter_by(
            lesson_instance_id=ids["full"], player_id=ids["player_id"], is_active=True
        ).count() == 1
    assert _by_id(_calendar(client, ids, ALL))[ids["full"]]["studentRelation"] == "waiting"
