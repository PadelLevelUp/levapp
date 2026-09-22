"""PAD-364 — the v2 evaluation endpoints mean what a falsy value says (B-136, PAD-367).

The shared form layer reads any falsy value as "not sent" (`Field.set_value`,
`JsonRequestAdapter`, `update_with_dict`): on the legacy endpoints `scaleMin: 0`
is stored as 1 and a numeric score `0` becomes NULL. The v2 contract depends on
falsy values meaning something, so its endpoints parse JSON themselves and tell
*absent* from *null* from *falsy*. Binding from the first commit (Coordinator,
2026-09-21): each case below is asserted by reading the row back, and the file
runs on SQLite and on Postgres.
"""
from padel_app.sql_db import db
from padel_app.tests.test_pad362_evaluation_contract import (  # noqa: F401 — _jwt_secret is an autouse fixture
    _coach_headers,
    _jwt_secret,
    _seed,  # one coach, one student on the roster, Forehand 1-10 and Volley 0-10 (both legacy)
)


def _put(app, client, ids, body):
    return client.put("/api/app/evaluation_record", json={"playerId": ids["student_id"], **body},
                      headers=_coach_headers(app, ids))


def _patch(app, client, ids, category_id, body):
    return client.patch(f"/api/app/evaluation_competency/{category_id}", json=body, headers=_coach_headers(app, ids))


def _category(app, category_id):
    from padel_app.models import EvaluationCategory

    with app.app_context():
        c = db.session.get(EvaluationCategory, category_id)
        return {"name": c.name, "is_active": c.is_active, "sort_order": c.sort_order,
                "scale": (c.scale_min, c.scale_max), "group": c.competency_group}


def _record_rows(app, ids):
    """The day's record as stored: (note, {category_id: score})."""
    from padel_app.models import EvaluationEntry, EvaluationRecord

    with app.app_context():
        records = EvaluationRecord.query.filter_by(coach_player_id=ids["rel_id"]).all()
        return [
            (r.note, {e.category_id: e.score for e in EvaluationEntry.query.filter_by(record_id=r.id)})
            for r in records
        ]


def test_is_active_false_switches_a_competency_off(app, client):
    ids = _seed(app)

    res = _patch(app, client, ids, ids["forehand_id"], {"isActive": False})

    assert res.status_code == 200, res.get_data(as_text=True)
    assert res.get_json()["isActive"] is False
    assert _category(app, ids["forehand_id"])["is_active"] is False


def test_sort_order_zero_is_stored_as_zero(app, client):
    ids = _seed(app)

    res = _patch(app, client, ids, ids["forehand_id"], {"sortOrder": 0})

    assert res.status_code == 200, res.get_data(as_text=True)
    assert res.get_json()["sortOrder"] == 0
    assert _category(app, ids["forehand_id"])["sort_order"] == 0


def test_an_absent_key_changes_nothing_on_a_competency(app, client):
    ids = _seed(app)
    assert _patch(app, client, ids, ids["forehand_id"], {"isActive": False, "sortOrder": 0}).status_code == 200
    before = _category(app, ids["forehand_id"])

    res = _patch(app, client, ids, ids["forehand_id"], {"name": "Forehand drive"})

    assert res.status_code == 200, res.get_data(as_text=True)
    assert _category(app, ids["forehand_id"]) == {**before, "name": "Forehand drive"}
    assert _patch(app, client, ids, ids["forehand_id"], {}).status_code == 200
    assert _category(app, ids["forehand_id"]) == {**before, "name": "Forehand drive"}


def test_a_null_rating_clears_it(app, client):
    ids = _seed(app)
    assert _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 7, str(ids["volley_id"]): 4}}).status_code == 200

    res = _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): None}})

    assert res.status_code == 200, res.get_data(as_text=True)
    assert [r["categoryId"] for r in res.get_json()["ratings"]] == [ids["volley_id"]]
    assert _record_rows(app, ids) == [(None, {ids["volley_id"]: 4.0})]


def test_an_empty_note_clears_the_private_note(app, client):
    ids = _seed(app)
    assert _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 7}, "note": "Late to the ball."}).status_code == 200
    assert _record_rows(app, ids) == [("Late to the ball.", {ids["forehand_id"]: 7.0})]

    res = _put(app, client, ids, {"note": ""})

    assert res.status_code == 200, res.get_data(as_text=True)
    assert res.get_json()["note"] is None
    assert _record_rows(app, ids) == [(None, {ids["forehand_id"]: 7.0})]


def test_an_absent_key_changes_nothing_on_a_record(app, client):
    ids = _seed(app)
    assert _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 7}, "note": "Late to the ball."}).status_code == 200

    assert _put(app, client, ids, {"ratings": {str(ids["volley_id"]): 4}}).status_code == 200  # no `note` key
    assert _record_rows(app, ids) == [("Late to the ball.", {ids["forehand_id"]: 7.0, ids["volley_id"]: 4.0})]

    assert _put(app, client, ids, {"note": "Better today."}).status_code == 200  # no `ratings` key
    assert _record_rows(app, ids) == [("Better today.", {ids["forehand_id"]: 7.0, ids["volley_id"]: 4.0})]

    assert _put(app, client, ids, {}).status_code == 200  # nothing at all
    assert _record_rows(app, ids) == [("Better today.", {ids["forehand_id"]: 7.0, ids["volley_id"]: 4.0})]


def test_a_score_of_zero_is_saved_where_the_scale_starts_at_zero(app, client):
    """Volley is a legacy 0-10 category: 0 is a legal score there. The legacy
    endpoint cannot save it (B-136, pinned by PAD-362); the record API can."""
    ids = _seed(app)

    res = _put(app, client, ids, {"ratings": {str(ids["volley_id"]): 0}})

    assert res.status_code == 200, res.get_data(as_text=True)
    assert res.get_json()["ratings"][0]["score"] == 0
    assert _record_rows(app, ids) == [(None, {ids["volley_id"]: 0.0})]


def test_clearing_the_last_rating_of_a_record_with_no_note_removes_the_record(app, client):
    ids = _seed(app)
    assert _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 7}}).status_code == 200

    res = _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): None}})

    assert res.status_code == 200 and res.get_json() == {"deleted": True}
    assert _record_rows(app, ids) == []
