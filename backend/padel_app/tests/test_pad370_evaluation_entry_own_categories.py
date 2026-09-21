"""evaluations.entries rule 8 (PAD-370, B-145, compass R-002) — a score is recorded
only in one of the calling coach's own categories.

`POST /api/app/add_evaluation_entry` handed `categoryId` to the form layer without
checking whose category it was. Another coach's id answered 200 and wrote a row
under the caller's coach-player link pointing at the other coach's category — and
the caller's player profile then showed that category's name and scale. An id
that does not exist raised (a 500 in production) after the scores earlier in the
same body had already been kept. Both are now ignored, with the same response.
"""
import pytest
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import _seed_coach_and_student


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _headers(app, user_id):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id))}"}


def _seed(app):
    """Ana (the caller) with Forehand and her student; Bea with Serve."""
    from padel_app.models import Association_CoachPlayer, Coach, EvaluationCategory, User

    ids = _seed_coach_and_student(app)
    with app.app_context():
        rel = Association_CoachPlayer(coach_id=ids["coach_id"], player_id=ids["student_id"])
        forehand = EvaluationCategory(coach_id=ids["coach_id"], name="Forehand", scale_min=1, scale_max=10)
        bea_user = User(name="Bea", username="bea-coach", email="bea@test.com", password="x", status="active")
        db.session.add_all([rel, forehand, bea_user])
        db.session.flush()
        bea = Coach(user_id=bea_user.id)
        db.session.add(bea)
        db.session.flush()
        serve = EvaluationCategory(coach_id=bea.id, name="Serve", scale_min=1, scale_max=5)
        db.session.add(serve)
        db.session.commit()
        ids.update(rel_id=rel.id, forehand_id=forehand.id, serve_id=serve.id)
    return ids


def _save(app, client, ids, scores):
    return client.post(
        "/api/app/add_evaluation_entry",
        json={"playerId": ids["student_id"], "scores": scores, "strengths": [], "weaknesses": []},
        headers=_headers(app, ids["coach_user_id"]),
    )


def _entries(app):
    from padel_app.models import EvaluationEntry

    with app.app_context():
        return [(e.coach_player_id, e.category_id, e.score) for e in EvaluationEntry.query.order_by(EvaluationEntry.id)]


def test_a_score_in_the_coachs_own_category_is_written(app, client):
    ids = _seed(app)

    res = _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 6}])

    assert res.status_code == 200
    assert _entries(app) == [(ids["rel_id"], ids["forehand_id"], 6.0)]


def test_a_score_in_another_coachs_category_is_ignored(app, client):
    ids = _seed(app)

    res = _save(app, client, ids, [{"categoryId": ids["serve_id"], "value": 3}])

    assert res.status_code == 200
    assert res.get_json() == {"status": "ok", "playerId": ids["student_id"]}
    assert _entries(app) == []


def test_the_profile_never_carries_another_coachs_category(app, client):
    ids = _seed(app)
    _save(app, client, ids, [{"categoryId": ids["serve_id"], "value": 3}, {"categoryId": ids["forehand_id"], "value": 6}])

    res = client.get(f"/api/app/player_profile/{ids['student_id']}", headers=_headers(app, ids["coach_user_id"]))

    assert [e["categoryName"] for e in res.get_json()["evaluations"]] == ["Forehand"]


def test_an_unknown_or_malformed_category_id_is_ignored_and_the_other_scores_are_kept(app, client):
    ids = _seed(app)

    res = _save(app, client, ids, [
        {"categoryId": 987654, "value": 3},
        {"categoryId": "not-a-number", "value": 3},
        {"categoryId": 1e999, "value": 3},  # int(inf) raises OverflowError, not ValueError
        {"value": 3},
        {"categoryId": ids["forehand_id"], "value": 6},
    ])

    assert res.status_code == 200
    assert _entries(app) == [(ids["rel_id"], ids["forehand_id"], 6.0)]


def test_a_category_id_sent_as_a_string_still_counts_as_the_coachs_own(app, client):
    """The TS type says `categoryId: string`; a client may send "12"."""
    ids = _seed(app)

    res = _save(app, client, ids, [{"categoryId": str(ids["forehand_id"]), "value": 6}])

    assert res.status_code == 200
    assert _entries(app) == [(ids["rel_id"], ids["forehand_id"], 6.0)]
