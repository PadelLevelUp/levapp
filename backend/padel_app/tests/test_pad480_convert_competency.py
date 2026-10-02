"""evaluations.competencies rule 18 and R-047 rule 9 (PAD-480, owner decision 2026-10-02).

`POST /evaluation_competency/<id>/convert {catalogueKey}` turns one of the coach's legacy rows into a
default category: it keeps its id, flag and scores (each on its own snapshot) and takes the default's
Portuguese name and the coach's scale. From then on the five frozen endpoints treat it as any
non-legacy competency. The legacy names below carry the trailing space prod's rows have.
"""
import datetime as dt

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad362_evaluation_contract import (  # noqa: F401
    _coach_headers,
    _jwt_secret,
    _other_coach,
    _save,
    _seed,  # Forehand 1-5 and Volley 1-5, both legacy (PAD-403)
)
from padel_app.tests.helpers import pin_clock

BASE = "/api/app"
NOW = dt.datetime(2026, 10, 2, 10, 0, 0)


@pytest.fixture(autouse=True)
def _clock(monkeypatch, app):
    import padel_app.services.evaluation_api_service  # noqa: F401
    import padel_app.services.evaluation_record_service  # noqa: F401

    pin_clock(monkeypatch, NOW)


def _legacy(app, ids, *names):
    """Legacy rows as prod holds them: no group, 1-5, names as typed."""
    from padel_app.models import EvaluationCategory

    with app.app_context():
        rows = [EvaluationCategory(coach_id=ids["coach_id"], name=n, scale_min=1, scale_max=5) for n in names]
        db.session.add_all(rows)
        db.session.commit()
        return [r.id for r in rows]


def _row(app, cid):
    from padel_app.models import EvaluationCategory

    with app.app_context():
        c = db.session.get(EvaluationCategory, cid)
        return None if c is None else {
            "name": c.name, "group": c.competency_group, "key": c.catalogue_key, "scale": (c.scale_min, c.scale_max),
            "is_active": c.is_active, "sort_order": c.sort_order, "parent_id": c.parent_id,
        }


def _entries(app, cid):
    from padel_app.models import EvaluationEntry

    with app.app_context():
        return sorted((e.score, e.scale_min, e.scale_max) for e in EvaluationEntry.query.filter_by(category_id=cid))


def _convert(app, client, ids, cid, body):
    return client.post(f"{BASE}/evaluation_competency/{cid}/convert", json=body, headers=_coach_headers(app, ids))


def _scored_tecnica(app, client):
    ids = _seed(app)
    (tecnica,) = _legacy(app, ids, "Técnica ")
    assert _save(app, client, ids, [{"categoryId": tecnica, "value": 4}]).status_code == 200
    return ids, tecnica


def test_a_legacy_row_converts_and_keeps_its_id_and_scores(app, client):
    """Criterion "A legacy row converts into a default category and keeps its scores"."""
    ids, tecnica = _scored_tecnica(app, client)
    before = _row(app, tecnica)

    res = _convert(app, client, ids, tecnica, {"catalogueKey": "technique"})

    assert res.status_code == 200, res.get_data(as_text=True)
    body = res.get_json()
    assert (body["id"], body["key"], body["group"], body["name"], body["parentId"]) == (
        tecnica, "technique", "general", "Técnica", None)
    after = _row(app, tecnica)
    assert (after["is_active"], after["sort_order"], after["scale"]) == (
        before["is_active"], before["sort_order"], (1, 5))
    assert _entries(app, tecnica) == [(4.0, 1, 5)]


def test_the_converted_row_takes_the_coachs_scale_and_its_scores_keep_theirs(app, client):
    """Criterion "The converted row takes the coach's scale; its scores keep the one they were given on"."""
    ids, tecnica = _scored_tecnica(app, client)
    headers = _coach_headers(app, ids)
    assert client.put(f"{BASE}/evaluation_scale", json={"scaleMax": 10}, headers=headers).status_code == 200
    assert _row(app, tecnica)["scale"] == (1, 5), "a legacy row keeps its own scale (scale rule 2)"

    assert _convert(app, client, ids, tecnica, {"catalogueKey": "technique"}).status_code == 200

    assert _row(app, tecnica)["scale"] == (1, 10)
    assert _entries(app, tecnica) == [(4.0, 1, 5)], "no score is rewritten"


@pytest.mark.parametrize("case", [
    "not legacy", "a converted row again", "a sub-level key", "an unknown key", "a key that is not a string",
    "no key", "default held", "name taken",
])
def test_a_refused_conversion_writes_nothing(app, client, case):
    """Criterion "A conversion that cannot be made is refused, and nothing changes"."""
    ids, tecnica = _scored_tecnica(app, client)
    (consistencia, other_tecnica) = _legacy(app, ids, "Consistencia ", "técnica")
    headers = _coach_headers(app, ids)
    grit = client.post(f"{BASE}/evaluation_competency", json={"name": "Grit"}, headers=headers).get_json()["id"]
    if case == "a converted row again":
        assert _convert(app, client, ids, consistencia, {"catalogueKey": "consistency"}).status_code == 200
    if case == "default held":
        assert client.post(f"{BASE}/evaluation_competency", json={"catalogueKey": "tactics"},
                           headers=headers).status_code == 201
    row, body, status, code = {
        "not legacy": (grit, {"catalogueKey": "consistency"}, 400, "not_legacy"),
        "a converted row again": (consistencia, {"catalogueKey": "consistency"}, 400, "not_legacy"),
        "a sub-level key": (tecnica, {"catalogueKey": "bandeja"}, 400, "catalogue_key_invalid"),
        "an unknown key": (tecnica, {"catalogueKey": "nope"}, 400, "catalogue_key_invalid"),
        "a key that is not a string": (tecnica, {"catalogueKey": 5}, 400, "catalogue_key_invalid"),
        "no key": (tecnica, {}, 400, "catalogue_key_invalid"),
        "default held": (tecnica, {"catalogueKey": "tactics"}, 409, "default_held"),
        # " Técnica " would become "Técnica", and the coach also holds a legacy "técnica".
        "name taken": (tecnica, {"catalogueKey": "technique"}, 409, "name_taken"),
    }[case]
    before = {cid: _row(app, cid) for cid in (tecnica, consistencia, other_tecnica, grit)}

    res = _convert(app, client, ids, row, body)

    assert res.status_code == status, res.get_data(as_text=True)
    assert res.get_json()["error"] == code
    assert {cid: _row(app, cid) for cid in before} == before
    assert _entries(app, tecnica) == [(4.0, 1, 5)]


def test_another_coachs_row_is_forbidden(app, client):
    ids = _seed(app)
    other = _other_coach(app)

    res = _convert(app, client, ids, other["category_id"], {"catalogueKey": "technique"})

    assert res.status_code == 403
    assert _row(app, other["category_id"])["group"] is None


def test_the_frozen_endpoints_treat_a_converted_row_as_non_legacy(app, client):
    """Criterion "After conversion the old builds' endpoints no longer see it" (R-047 rule 9). A score an
    old build posts for it from a form opened before the conversion is answered 200 and stored nowhere."""
    from padel_app.models import EvaluationEntry

    ids, tecnica = _scored_tecnica(app, client)
    headers = _coach_headers(app, ids)
    assert _convert(app, client, ids, tecnica, {"catalogueKey": "technique"}).status_code == 200

    listed = client.get(f"{BASE}/evaluation_categories", headers=headers).get_json()
    assert tecnica not in [c["id"] for c in listed]
    profile = client.get(f"{BASE}/player_profile/{ids['student_id']}", headers=headers).get_json()
    assert tecnica not in [e["categoryId"] for e in profile["evaluations"]]

    res = _save(app, client, ids, [{"categoryId": tecnica, "value": 2}])
    assert res.status_code == 200
    with app.app_context():
        assert EvaluationEntry.query.filter_by(category_id=tecnica).count() == 1

    deleted = client.post(f"{BASE}/delete/evaluation_category", json={"id": tecnica}, headers=headers)
    assert deleted.status_code == 403
    assert _row(app, tecnica) is not None

    # The upsert skips the new name: no legacy "Técnica" appears, and the converted row is untouched.
    upserted = client.post(f"{BASE}/add_evaluation_categories", headers=headers,
                           json=[{"name": "Técnica", "scaleMin": 1, "scaleMax": 5}])
    assert upserted.status_code == 200
    from padel_app.models import EvaluationCategory
    with app.app_context():
        assert [c.id for c in EvaluationCategory.query.filter_by(coach_id=ids["coach_id"], name="Técnica")] == [tecnica]
    assert _row(app, tecnica)["key"] == "technique"


def test_known_limit_a_stale_old_editor_recreates_the_old_name_as_an_empty_legacy_row(app, client):
    """Rule 18's known limit, pinned so the frozen upsert is not "fixed" by accident (R-047 rule 6):
    App Store 1.1.0's editor posts its whole list with names as it read them. Saved after the
    conversion from a list read before it, the old name " Técnica " is not the new "Técnica", so the
    name-keyed upsert creates an empty legacy row of that name. The coach can delete it."""
    from padel_app.models import EvaluationCategory

    ids, tecnica = _scored_tecnica(app, client)
    headers = _coach_headers(app, ids)
    assert _convert(app, client, ids, tecnica, {"catalogueKey": "technique"}).status_code == 200

    res = client.post(f"{BASE}/add_evaluation_categories", headers=headers, json=[
        {"name": "Técnica ", "scaleMin": 1, "scaleMax": 5},
        {"name": "Forehand", "scaleMin": 1, "scaleMax": 5},
    ])

    assert res.status_code == 200
    with app.app_context():
        recreated = EvaluationCategory.query.filter_by(coach_id=ids["coach_id"], name="Técnica ").one()
        recreated_id = recreated.id
        assert recreated.competency_group is None and recreated.id != tecnica
    assert _row(app, tecnica)["key"] == "technique" and _entries(app, tecnica) == [(4.0, 1, 5)]
    # The next 1.1.0 save posts every legacy category it lists, an unrated one at the midpoint.
    assert _save(app, client, ids, [{"categoryId": recreated_id, "value": 3}]).status_code == 200
    assert _entries(app, recreated_id) == [(3.0, 1, 5)]
    assert client.delete(f"{BASE}/evaluation_competency/{recreated_id}", headers=headers).status_code == 200


def test_a_sub_level_entry_added_after_conversion_goes_under_the_converted_row(app, client):
    """Criterion "The converted row holds the default's sub-categories" (rule 15 "Creating")."""
    ids, tecnica = _scored_tecnica(app, client)
    headers = _coach_headers(app, ids)
    before = client.post(f"{BASE}/evaluation_competency", json={"catalogueKey": "smash"}, headers=headers).get_json()
    assert before["parentId"] is None, "a legacy row of the default's name holds none (rule 15)"

    assert _convert(app, client, ids, tecnica, {"catalogueKey": "technique"}).status_code == 200
    after = client.post(f"{BASE}/evaluation_competency", json={"catalogueKey": "vibora"}, headers=headers).get_json()
    moved = client.patch(f"{BASE}/evaluation_competency/{before['id']}", json={"parentId": tecnica}, headers=headers)

    assert after["parentId"] == tecnica
    assert moved.status_code == 200 and moved.get_json()["parentId"] == tecnica


def test_a_score_with_no_snapshot_keeps_the_scale_it_was_given_on(app, client):
    """Rule 18 "each on its own scale snapshot", true by construction: a score the PAD-423 backfill could
    not stamp (NULL snapshot) is read on its category's scale, so the conversion stamps the row's old
    scale onto it before the row takes the coach's scale."""
    from sqlalchemy import text

    ids, tecnica = _scored_tecnica(app, client)
    with app.app_context():
        db.session.execute(text("UPDATE evaluation_entries SET scale_min = NULL, scale_max = NULL WHERE category_id = :c"),
                           {"c": tecnica})
        db.session.commit()
    assert _entries(app, tecnica) == [(4.0, None, None)]
    headers = _coach_headers(app, ids)
    assert client.put(f"{BASE}/evaluation_scale", json={"scaleMax": 10}, headers=headers).status_code == 200

    assert _convert(app, client, ids, tecnica, {"catalogueKey": "technique"}).status_code == 200

    assert _row(app, tecnica)["scale"] == (1, 10)
    assert _entries(app, tecnica) == [(4.0, 1, 5)]


def test_a_switched_off_legacy_row_stays_off(app, client):
    from padel_app.models import EvaluationCategory

    ids, tecnica = _scored_tecnica(app, client)
    with app.app_context():
        db.session.get(EvaluationCategory, tecnica).is_active = False
        db.session.commit()

    res = _convert(app, client, ids, tecnica, {"catalogueKey": "technique"})

    assert res.status_code == 200 and res.get_json()["isActive"] is False
    assert _row(app, tecnica)["is_active"] is False


def test_a_name_that_races_in_is_answered_name_taken(app, client, monkeypatch):
    """A row named "Técnica" inserted between the name check and the commit (a custom one, at the same
    moment) trips the (coach_id, name) index: answered name_taken, nothing written."""
    from padel_app.services import evaluation_api_service as service

    ids, tecnica = _scored_tecnica(app, client)
    from padel_app.models import EvaluationCategory

    with app.app_context():  # inserted by the racing request: past this request's name check
        db.session.add(EvaluationCategory(coach_id=ids["coach_id"], name="Técnica", scale_min=1, scale_max=5,
                                          competency_group="custom"))
        db.session.commit()
    monkeypatch.setattr(service, "_name_taken", lambda *a, **k: False)  # the check ran before the insert

    res = _convert(app, client, ids, tecnica, {"catalogueKey": "technique"})

    assert res.status_code == 409 and res.get_json()["error"] == "name_taken"
    assert _row(app, tecnica)["group"] is None


def test_an_unknown_row_and_a_body_that_is_not_an_object_are_refused(app, client):
    ids, tecnica = _scored_tecnica(app, client)
    headers = _coach_headers(app, ids)

    unknown = _convert(app, client, ids, 999999, {"catalogueKey": "technique"})
    listed = client.post(f"{BASE}/evaluation_competency/{tecnica}/convert", json=["technique"], headers=headers)

    assert (unknown.status_code, unknown.get_json()["error"]) == (404, "competency_not_found")
    assert (listed.status_code, listed.get_json()["error"]) == (400, "body_invalid")
    assert _row(app, tecnica)["group"] is None
