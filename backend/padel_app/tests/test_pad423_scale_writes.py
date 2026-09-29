"""
PAD-423 — evaluations.scale rules 2–4, the write side.

- A competency created after the coach picked a scale is created on it (catalogue switch-on and
  custom), never on NEW_SCALE.
- Every entry stores the scale it was given on, whoever writes it (the records API, the frozen
  legacy save, the import): the category's scale at that moment. The coach changing scale later
  never rewrites it, and (D149) neither does editing it: a same-day re-score keeps the entry's own
  scale and is validated against it; only a NEW entry takes the competency's current scale.
- A score outside the competency's current scale is refused.
- (B's review, R-047) With the coach on 1–10, the import still creates a LEGACY category on 1–5,
  and the frozen `add_evaluation_entry` still stores 8 as 4 on it (legacy-client-contract
  rules 9–10): the coach's scale never reaches legacy.

Run:
    pytest padel_app/tests/test_pad423_scale_writes.py -v
"""
import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad362_evaluation_contract import (  # noqa: F401 — _jwt_secret is autouse
    _jwt_secret,
    _save,
    _seed,
)


def _coach(app, ids):
    from padel_app.models import Coach

    return db.session.get(Coach, ids["coach_id"])


def _set_scale(app, ids, n):
    from padel_app.services.evaluation_api_service import put_evaluation_scale

    with app.app_context():
        assert put_evaluation_scale(_coach(app, ids), {"scaleMax": n}) == {"scaleMax": n}


def test_a_competency_created_after_the_scale_is_set_is_created_on_it(app):
    from padel_app.services.evaluation_api_service import create_competency

    ids = _seed(app)
    _set_scale(app, ids, 10)
    with app.app_context():
        custom, _ = create_competency(_coach(app, ids), {"name": "Garra"})
        builtin, _ = create_competency(_coach(app, ids), {"catalogueKey": "bandeja"})
        assert (custom.scale_min, custom.scale_max) == (1, 10)
        assert (builtin.scale_min, builtin.scale_max) == (1, 10)


def test_an_entry_keeps_the_scale_it_was_given_on_even_when_re_scored(app):
    from padel_app.models import EvaluationEntry
    from padel_app.services.evaluation_api_service import create_competency

    ids = _seed(app)
    with app.app_context():
        garra, _ = create_competency(_coach(app, ids), {"name": "Garra"})  # 1–5
        entry = EvaluationEntry(coach_player_id=ids["rel_id"], category_id=garra.id, score=4.0)
        db.session.add(entry)
        db.session.commit()
        entry_id, garra_id = entry.id, garra.id
        assert (entry.scale_min, entry.scale_max) == (1, 5)

    _set_scale(app, ids, 10)
    with app.app_context():
        entry = db.session.get(EvaluationEntry, entry_id)
        assert (entry.score, entry.scale_min, entry.scale_max) == (4.0, 1, 5), "a scale change rewrites no entry"
        entry.comment = "no score change"
        db.session.commit()
        assert (entry.scale_min, entry.scale_max) == (1, 5), "only a new score re-snapshots"
        entry.score = 5.0
        db.session.commit()
        assert (entry.scale_min, entry.scale_max) == (1, 5), "D149: a re-score keeps the entry's own scale"
    assert garra_id is not None


def test_a_score_outside_the_current_scale_is_refused(app):
    from padel_app.services.evaluation_api_service import ApiError, _validated_ratings, create_competency

    ids = _seed(app)
    _set_scale(app, ids, 10)
    with app.app_context():
        garra, _ = create_competency(_coach(app, ids), {"name": "Garra"})
        assert list(_validated_ratings(_coach(app, ids), {str(garra.id): 10}).values()) == [10]
        with pytest.raises(ApiError) as err:
            _validated_ratings(_coach(app, ids), {str(garra.id): 11})
        assert err.value.status == 400 and err.value.code == "score_out_of_range"


def test_the_coach_scale_never_reaches_legacy_import_or_the_frozen_save(app, client):
    """B's R-047 pin."""
    from padel_app.models import EvaluationCategory, EvaluationEntry
    from padel_app.services.import_service import bulk_create_evaluation_categories

    ids = _seed(app)
    _set_scale(app, ids, 10)
    with app.app_context():
        result = bulk_create_evaluation_categories([{"name": "Lob", "scale_min": 1, "scale_max": 10}], _coach(app, ids))
        assert result["errors"] == []
        lob = EvaluationCategory.query.filter_by(coach_id=ids["coach_id"], name="Lob").one()
        assert lob.is_legacy and (lob.scale_min, lob.scale_max) == (1, 5)
        forehand = db.session.get(EvaluationCategory, ids["forehand_id"])
        assert (forehand.scale_min, forehand.scale_max) == (1, 5), "the seeded legacy category keeps 1-5"
        lob_id = lob.id

    res = _save(app, client, ids, [{"categoryId": lob_id, "value": 8}])
    assert res.status_code == 200, res.get_data(as_text=True)
    with app.app_context():
        rows = EvaluationEntry.query.filter_by(category_id=lob_id).all()
        assert [(r.score, r.scale_min, r.scale_max) for r in rows] == [(4.0, 1, 5)]


def test_editing_a_same_day_rating_after_a_scale_change_keeps_its_own_scale(app, client):
    """D149: 4/5 (80%) must never silently become 4/10 (40%). The coach rates Garra 4 on 1-5, moves
    to 1-10, and edits today's record: Garra is still validated and stored on 1-5 (5 is fine, 7 is
    refused), while a competency new to the record takes 1-10."""
    from padel_app.models import EvaluationEntry
    from padel_app.services.evaluation_api_service import create_competency
    from padel_app.tests.test_pad362_evaluation_contract import _coach_headers

    ids = _seed(app)
    headers = _coach_headers(app, ids)
    with app.app_context():
        garra_id = create_competency(_coach(app, ids), {"name": "Garra"})[0].id  # 1-5

    def put(ratings):
        return client.put("/api/app/evaluation_record", headers=headers,
                          json={"playerId": ids["student_id"], "ratings": {str(k): v for k, v in ratings.items()}})

    assert put({garra_id: 4}).status_code == 200
    _set_scale(app, ids, 10)
    with app.app_context():
        bandeja_id = create_competency(_coach(app, ids), {"name": "Bandeja nova"})[0].id  # 1-10

    refused = put({garra_id: 7})
    assert refused.status_code == 400 and refused.get_json()["error"] == "score_out_of_range"
    res = put({garra_id: 5, bandeja_id: 7})
    assert res.status_code == 200, res.get_data(as_text=True)
    ratings = {r["categoryId"]: (r["score"], r["scaleMin"], r["scaleMax"]) for r in res.get_json()["ratings"]}
    assert ratings == {garra_id: (5, 1, 5), bandeja_id: (7, 1, 10)}
    with app.app_context():
        garra = EvaluationEntry.query.filter_by(category_id=garra_id).one()
        assert (garra.score, garra.scale_min, garra.scale_max) == (5.0, 1, 5)
