"""PAD-724 (PAD-669 R5; notifications.waiting-list rules 2a and 18): before a coach adds a student to
a waiting list, the student's failures of the eligibility bar are read so the coach is warned and
decides (PAD-133's warning). Class and series adds read the existing `/eligibility_check`; the
standing list, which has no single class, reads the classes it would reach.
"""
from datetime import timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_pad128_eligibility import _add_student, _seed
from padel_app.tests.test_pad611_student_relations import _instance


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _coach_auth(app, ids):
    from padel_app.models import Coach

    with app.app_context():
        user_id = db.session.get(Coach, ids["coach_id"]).user_id
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def test_the_standing_check_names_only_the_classes_whose_bar_the_student_fails(app, client):
    """A level-same-as-class bar; a level-5 student; upcoming classes at level 5 and at level 4.
    Only the level-4 class is named, with its reasons; the level-5 one (the control) is not."""
    from padel_app.models.lesson_instances import LessonInstance

    ids = _seed(app, eligibility_rules=[{"attribute": "level", "operation": "same_as_class"}])
    fails = _instance(app, ids, days=3, title="Level 4 class")
    passes = _instance(app, ids, days=4, title="Level 5 class")
    with app.app_context():
        db.session.get(LessonInstance, fails).level_id = ids["level_ids"]["4"]
        pid = _add_student(ids["coach_id"], "carla", level_id=ids["level_ids"]["5"])
        db.session.commit()
    resp = client.post("/api/app/notify/standing_waiting_list/eligibility_check",
                       json={"playerId": pid, "durationDays": 30}, headers=_coach_auth(app, ids))
    assert resp.status_code == 200, resp.get_data(as_text=True)[:300]
    named = {c["lessonInstanceId"]: c for c in resp.get_json()["classes"]}
    assert fails in named and passes not in named
    assert named[fails]["title"] == "Level 4 class" and named[fails]["ineligible"]


def test_with_no_bar_the_standing_check_names_nothing(app, client):
    ids = _seed(app, eligibility_rules=None)
    _instance(app, ids, days=3, title="Any class")
    with app.app_context():
        pid = _add_student(ids["coach_id"], "dora", level_id=ids["level_ids"]["5"])
        db.session.commit()
    resp = client.post("/api/app/notify/standing_waiting_list/eligibility_check",
                       json={"playerId": pid, "durationDays": 30}, headers=_coach_auth(app, ids))
    assert resp.status_code == 200 and resp.get_json()["classes"] == []
