"""evaluations.competencies (PAD-431, D150) — categories and sub-categories over the v2 API.

A row with `parent_id` NULL is a category; a row with one is a sub-category of it (rule 15). Two
levels, legacy rows never in the tree (R-047). A new coach starts with the whole default tree
(rule 4); any row, a default included, can be renamed or deleted (rules 8, 9); a category with
active sub-categories is not offered for scoring, and a score that still arrives for it is stored,
never dropped (rule 16).
"""
import datetime as dt

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad362_evaluation_contract import (  # noqa: F401
    _coach_headers,
    _jwt_secret,
    _other_coach,
    _seed,  # Forehand 1-5 and Volley 1-5, both legacy (PAD-403)
)
from padel_app.tests.helpers import pin_clock

BASE = "/api/app"
NOW = dt.datetime(2026, 9, 21, 10, 0, 0)


@pytest.fixture(autouse=True)
def _clock(monkeypatch, app):
    import padel_app.services.evaluation_api_service  # noqa: F401
    import padel_app.services.evaluation_record_service  # noqa: F401

    pin_clock(monkeypatch, NOW)


def _get(app, client, ids):
    res = client.get(f"{BASE}/evaluation_competencies", headers=_coach_headers(app, ids))
    assert res.status_code == 200, res.get_data(as_text=True)
    return res.get_json()


def _post(app, client, ids, body):
    return client.post(f"{BASE}/evaluation_competency", json=body, headers=_coach_headers(app, ids))


def _patch(app, client, ids, cid, body):
    return client.patch(f"{BASE}/evaluation_competency/{cid}", json=body, headers=_coach_headers(app, ids))


def _put(app, client, ids, ratings):
    return client.put(f"{BASE}/evaluation_record", json={"playerId": ids["student_id"], "ratings": ratings},
                      headers=_coach_headers(app, ids))


def _by_key(body):
    return {c["key"]: c for c in body["competencies"] if c["key"]}


def test_a_new_coach_starts_with_the_whole_default_tree(app, client):
    """Rules 4, 15 — criterion "A new coach starts with the whole default tree"."""
    from padel_app.models import EvaluationCategory
    from padel_app.tests.test_notification_reminder_flow import _seed_coach_and_student

    ids = _seed_coach_and_student(app)

    body = _get(app, client, ids)
    again = _get(app, client, ids)

    assert again == body and body["catalogue"] == []
    with app.app_context():
        assert EvaluationCategory.query.filter_by(coach_id=ids["coach_id"]).count() == 17
    by_key = _by_key(body)
    assert all(c["isActive"] for c in body["competencies"])
    assert {k for k, c in by_key.items() if c["parentId"] is None} == {"technique", "tactics", "consistency"}
    technique, tactics = by_key["technique"]["id"], by_key["tactics"]["id"]
    assert {k for k, c in by_key.items() if c["parentId"] == technique} == {
        "forehand", "backhand", "volley", "bandeja", "vibora", "smash", "glass_exit", "double_glass", "serve",
    }
    assert {k for k, c in by_key.items() if c["parentId"] == tactics} == {
        "defensive_position", "attacking_position", "transition", "decision_making", "doubles_play",
    }
    # R-047: the legacy list sees none of it
    assert client.get(f"{BASE}/evaluation_categories", headers=_coach_headers(app, ids)).get_json() == []


def test_every_item_carries_its_parent_id(app, client):
    """Rule 15 "Reading": a category's parentId is null; legacy rows are categories."""
    ids = _seed(app)

    body = _get(app, client, ids)

    assert [c["parentId"] for c in body["competencies"]] == [None, None]


def test_a_sub_category_is_created_under_a_category(app, client):
    """Rule 15 "Creating": a named sub-category, and a catalogue one that finds its default parent."""
    from padel_app.models import EvaluationCategory

    ids = _seed(app)  # legacy only: no Técnica row yet
    grit = _post(app, client, ids, {"name": "Grit"}).get_json()["id"]

    child = _post(app, client, ids, {"name": "Recuperação", "parentId": grit})
    bandeja = _post(app, client, ids, {"catalogueKey": "bandeja"})

    assert child.status_code == 201, child.get_data(as_text=True)
    assert (child.get_json()["parentId"], child.get_json()["group"]) == (grit, "custom")
    assert bandeja.status_code == 201, bandeja.get_data(as_text=True)
    with app.app_context():
        technique = EvaluationCategory.query.filter_by(coach_id=ids["coach_id"], catalogue_key="technique").one()
        assert (technique.parent_id, technique.is_active) == (None, True)
        assert bandeja.get_json()["parentId"] == technique.id
    # a general entry is always a category
    assert _post(app, client, ids, {"catalogueKey": "consistency", "parentId": grit}).status_code == 400


def test_two_levels_only_and_legacy_stays_out_of_the_tree(app, client):
    """Rule 15 — criterion "Two levels only; legacy stays out of the tree"."""
    from padel_app.models import EvaluationCategory

    ids = _seed(app)
    grit = _post(app, client, ids, {"name": "Grit"}).get_json()["id"]
    sub = _post(app, client, ids, {"name": "Recuperação", "parentId": grit}).get_json()["id"]
    others_category = _other_coach(app)["category_id"]
    with app.app_context():
        before = EvaluationCategory.query.count()

    assert _post(app, client, ids, {"name": "X", "parentId": sub}).status_code == 400
    assert _post(app, client, ids, {"name": "Y", "parentId": ids["forehand_id"]}).status_code == 400  # legacy
    assert _post(app, client, ids, {"name": "Z", "parentId": others_category}).status_code == 403
    assert _post(app, client, ids, {"name": "W", "parentId": 999999}).status_code == 400
    assert _post(app, client, ids, {"name": "V", "parentId": "1"}).status_code == 400
    with app.app_context():
        assert EvaluationCategory.query.count() == before


def test_renaming_a_default_makes_it_the_coachs_own(app, client):
    """Rule 8 — criterion "Renaming a default makes it the coach's own"."""
    ids = _seed(app)
    bandeja = _post(app, client, ids, {"catalogueKey": "bandeja"}).get_json()
    assert _put(app, client, ids, {str(bandeja["id"]): 4}).status_code == 200

    res = _patch(app, client, ids, bandeja["id"], {"name": "Bandeja alta"})

    assert res.status_code == 200, res.get_data(as_text=True)
    renamed = res.get_json()
    assert {k: renamed[k] for k in ("name", "key", "group", "parentId", "scoreCount")} == {
        "name": "Bandeja alta", "key": None, "group": "custom", "parentId": bandeja["parentId"], "scoreCount": 1,
    }
    assert "bandeja" in [c["key"] for c in _get(app, client, ids)["catalogue"]]


def test_deleting_a_category_takes_its_sub_categories_with_it(app, client):
    """Rule 9 — criterion "Deleting a category takes its sub-categories with it"."""
    from padel_app.models import EvaluationCategory, EvaluationEntry
    from padel_app.models.deletion_audit import DeletionAudit

    ids = _seed(app)
    transition = _post(app, client, ids, {"catalogueKey": "transition"}).get_json()
    doubles = _post(app, client, ids, {"catalogueKey": "doubles_play"}).get_json()
    tactics = transition["parentId"]
    assert doubles["parentId"] == tactics
    assert _put(app, client, ids, {str(transition["id"]): 3, str(doubles["id"]): 4}).status_code == 200
    headers = _coach_headers(app, ids)

    impact = client.get(f"{BASE}/evaluation_competency/{tactics}/impact", headers=headers)
    deleted = client.delete(f"{BASE}/evaluation_competency/{tactics}", headers=headers)

    assert impact.status_code == 200 and impact.get_json() == {"name": "Tática", "scores": 2, "players": 1}
    assert deleted.status_code == 200, deleted.get_data(as_text=True)
    with app.app_context():
        assert {c.id for c in EvaluationCategory.query.filter_by(coach_id=ids["coach_id"])} == {
            ids["forehand_id"], ids["volley_id"],
        }
        assert EvaluationEntry.query.count() == 0
        audit = DeletionAudit.query.order_by(DeletionAudit.id.desc()).first()
        assert audit.label == "Tática"
        assert sorted(audit.details["subCategories"]) == ["Jogo em dupla", "Transição"]
    offered = [c["key"] for c in _get(app, client, ids)["catalogue"]]
    assert {"tactics", "transition", "doubles_play"} <= set(offered)


def test_a_score_for_a_category_with_sub_categories_is_kept_as_history(app, client):
    """Rule 16 (D6 as ruled) — a stray score is stored, never dropped."""
    from padel_app.models import EvaluationEntry

    ids = _seed(app)
    vibora = _post(app, client, ids, {"catalogueKey": "vibora"}).get_json()
    technique = vibora["parentId"]

    res = _put(app, client, ids, {str(technique): 4, str(vibora["id"]): 3})

    assert res.status_code == 200, res.get_data(as_text=True)
    assert sorted((r["categoryId"], r["score"]) for r in res.get_json()["ratings"]) == sorted(
        [(technique, 4), (vibora["id"], 3)]
    )
    with app.app_context():
        assert EvaluationEntry.query.filter_by(category_id=technique).count() == 1


def test_a_category_mean_never_takes_in_its_sub_categories(app, client):
    """Rule 17: figures are per competency; a category's history score and its sub-categories'
    scores never mix."""
    from padel_app.models import EvaluationRecord
    from padel_app.services.evaluation_api_service import monthly_means

    ids = _seed(app)
    vibora = _post(app, client, ids, {"catalogueKey": "vibora"}).get_json()
    technique = vibora["parentId"]
    assert _put(app, client, ids, {str(technique): 2, str(vibora["id"]): 5}).status_code == 200

    with app.app_context():
        link_id = EvaluationRecord.query.one().coach_player_id
        assert monthly_means(link_id, technique) == {"2026-09": 2}
        assert monthly_means(link_id, vibora["id"]) == {"2026-09": 5}


def test_the_legacy_list_never_shows_a_sub_category(app, client):
    """R-047 against the tree: the frozen list is legacy and active only."""
    ids = _seed(app)
    grit = _post(app, client, ids, {"name": "Grit"}).get_json()["id"]
    _post(app, client, ids, {"name": "Recuperação", "parentId": grit})
    _post(app, client, ids, {"catalogueKey": "smash"})

    names = [c["name"] for c in client.get(f"{BASE}/evaluation_categories", headers=_coach_headers(app, ids)).get_json()]

    assert names == ["Forehand", "Volley"]
