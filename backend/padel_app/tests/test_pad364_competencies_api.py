"""evaluations.competencies (PAD-364) — the coach's competency set over the v2 API.

A competency is an `evaluation_categories` row. Legacy categories (made by the
old editor or the import) keep their scale; a catalogue competency is a row
created when the coach switches it on; a custom one is typed by the coach. New
ones are 1-5 and active.
"""
from padel_app.sql_db import db
from padel_app.tests.test_pad362_evaluation_contract import (  # noqa: F401
    _coach_headers,
    _jwt_secret,
    _save,
    _seed,  # Forehand 1-5 and Volley 1-5, both legacy (PAD-403)
)

BASE = "/api/app"


def _get(app, client, ids):
    res = client.get(f"{BASE}/evaluation_competencies", headers=_coach_headers(app, ids))
    assert res.status_code == 200, res.get_data(as_text=True)
    return res.get_json()


def _post(app, client, ids, body):
    return client.post(f"{BASE}/evaluation_competency", json=body, headers=_coach_headers(app, ids))


def _patch(app, client, ids, cid, body):
    return client.patch(f"{BASE}/evaluation_competency/{cid}", json=body, headers=_coach_headers(app, ids))


def test_the_list_carries_every_competency_and_the_catalogue_not_yet_switched_on(app, client):
    ids = _seed(app)
    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 7}]).status_code == 200

    body = _get(app, client, ids)

    assert body["competencies"] == [
        {"id": ids["forehand_id"], "key": None, "name": "Forehand", "group": None, "scaleMin": 1,
         "scaleMax": 5, "isActive": True, "sortOrder": None, "scoreCount": 1},
        {"id": ids["volley_id"], "key": None, "name": "Volley", "group": None, "scaleMin": 1,
         "scaleMax": 5, "isActive": True, "sortOrder": None, "scoreCount": 0},
    ]
    keys = [c["key"] for c in body["catalogue"]]
    # 17 built-in entries in three groups, minus the twins of names the coach already holds (rule 4):
    # "Volley" is the pt and en label of `volley`, "Forehand" the en label of `forehand` (Direita)
    assert len(keys) == 15 and not {"volley", "forehand"} & set(keys)
    assert {c["group"] for c in body["catalogue"]} == {"general", "technique", "tactics"}
    assert [c["key"] for c in body["catalogue"] if c["group"] == "general"] == ["technique", "tactics", "consistency"]


def test_switching_a_catalogue_competency_on_creates_its_row_once(app, client):
    from padel_app.models import EvaluationCategory

    ids = _seed(app)

    res = _post(app, client, ids, {"catalogueKey": "bandeja"})

    assert res.status_code == 201, res.get_data(as_text=True)
    created = res.get_json()
    assert {k: created[k] for k in ("key", "name", "group", "scaleMin", "scaleMax", "isActive", "scoreCount")} == {
        "key": "bandeja", "name": "Bandeja", "group": "technique", "scaleMin": 1, "scaleMax": 5,
        "isActive": True, "scoreCount": 0,
    }
    with app.app_context():
        row = db.session.get(EvaluationCategory, created["id"])
        assert (row.coach_id, row.catalogue_key, row.competency_group) == (ids["coach_id"], "bandeja", "technique")
    assert "bandeja" not in [c["key"] for c in _get(app, client, ids)["catalogue"]]

    # switching on is idempotent: the same row comes back, active again
    client.patch(f"{BASE}/evaluation_competency/{created['id']}", json={"isActive": False}, headers=_coach_headers(app, ids))
    again = _post(app, client, ids, {"catalogueKey": "bandeja"})
    assert again.status_code == 200 and (again.get_json()["id"], again.get_json()["isActive"]) == (created["id"], True)
    assert _post(app, client, ids, {"catalogueKey": "nope"}).status_code == 400
    # its label is held by the coach's own legacy category: the twin cannot be switched on
    assert _post(app, client, ids, {"catalogueKey": "volley"}).status_code == 409


def test_a_custom_competency_is_trimmed_one_to_five_and_never_a_duplicate(app, client):
    ids = _seed(app)

    res = _post(app, client, ids, {"name": "  Grit  "})

    assert res.status_code == 201, res.get_data(as_text=True)
    assert {k: res.get_json()[k] for k in ("key", "name", "group", "scaleMin", "scaleMax", "isActive")} == {
        "key": None, "name": "Grit", "group": "custom", "scaleMin": 1, "scaleMax": 5, "isActive": True,
    }
    assert _post(app, client, ids, {"name": "grit"}).status_code == 409       # case-insensitive
    assert _post(app, client, ids, {"name": "Forehand"}).status_code == 409   # a legacy category holds it
    assert _post(app, client, ids, {"name": "   "}).status_code == 400
    assert _post(app, client, ids, {}).status_code == 400
    assert _post(app, client, ids, {"name": "x" * 101}).status_code == 400


def test_a_rename_is_by_id_and_keeps_the_scores(app, client):
    """B-125: the legacy name-keyed upsert turns a rename into a new category."""
    from padel_app.models import EvaluationCategory, EvaluationEntry

    ids = _seed(app)
    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 7}]).status_code == 200

    res = _patch(app, client, ids, ids["forehand_id"], {"name": "Forehand drive"})

    assert res.status_code == 200 and res.get_json()["name"] == "Forehand drive"
    with app.app_context():
        assert EvaluationCategory.query.filter_by(coach_id=ids["coach_id"]).count() == 2
        assert EvaluationEntry.query.filter_by(category_id=ids["forehand_id"]).count() == 1
    assert _patch(app, client, ids, ids["forehand_id"], {"name": "volley"}).status_code == 409
    assert _patch(app, client, ids, ids["forehand_id"], {"name": ""}).status_code == 400


def test_a_catalogue_competency_can_be_switched_off_and_ordered_but_not_renamed(app, client):
    ids = _seed(app)
    cid = _post(app, client, ids, {"catalogueKey": "tactics"}).get_json()["id"]

    assert _patch(app, client, ids, cid, {"name": "My tactics"}).status_code == 409
    res = _patch(app, client, ids, cid, {"isActive": False, "sortOrder": 3})

    assert res.status_code == 200
    assert (res.get_json()["isActive"], res.get_json()["sortOrder"], res.get_json()["name"]) == (False, 3, "Tática")
    # switched off, it is still the coach's competency — not back in the catalogue
    body = _get(app, client, ids)
    assert "tactics" not in [c["key"] for c in body["catalogue"]]
    # general, technique, tactics, then custom and legacy together — each by sortOrder, then name
    assert [c["name"] for c in body["competencies"]] == ["Tática", "Forehand", "Volley"]


def test_wrong_types_are_refused_not_coerced(app, client):
    ids = _seed(app)

    for body in ({"isActive": 0}, {"isActive": "false"}, {"sortOrder": "2"}, {"sortOrder": 1.5}, {"sortOrder": True},
                 {"sortOrder": -1}, {"name": 5}):
        assert _patch(app, client, ids, ids["forehand_id"], body).status_code == 400, body
    assert _patch(app, client, ids, ids["forehand_id"], {"sortOrder": None}).status_code == 200  # null un-orders it


def test_switching_off_never_deletes_scores(app, client):
    from padel_app.models import EvaluationEntry

    ids = _seed(app)
    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 7}]).status_code == 200

    assert _patch(app, client, ids, ids["forehand_id"], {"isActive": False}).status_code == 200

    with app.app_context():
        assert EvaluationEntry.query.filter_by(category_id=ids["forehand_id"]).count() == 1


def test_delete_shows_its_impact_is_audited_and_refuses_a_catalogue_competency(app, client):
    from padel_app.models import EvaluationCategory, EvaluationEntry
    from padel_app.models.deletion_audit import DeletionAudit

    ids = _seed(app)
    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 7}]).status_code == 200
    custom = _post(app, client, ids, {"name": "Grit"}).get_json()["id"]
    catalogue = _post(app, client, ids, {"catalogueKey": "tactics"}).get_json()["id"]
    headers = _coach_headers(app, ids)

    impact = client.get(f"{BASE}/evaluation_competency/{ids['forehand_id']}/impact", headers=headers)
    assert impact.status_code == 200 and impact.get_json() == {"name": "Forehand", "scores": 1, "players": 1}

    assert client.delete(f"{BASE}/evaluation_competency/{catalogue}", headers=headers).status_code == 409
    assert client.delete(f"{BASE}/evaluation_competency/{custom}", headers=headers).status_code == 200
    assert client.delete(f"{BASE}/evaluation_competency/{ids['forehand_id']}", headers=headers).status_code == 200

    with app.app_context():
        assert {c.id for c in EvaluationCategory.query.filter_by(coach_id=ids["coach_id"])} == {ids["volley_id"], catalogue}
        assert EvaluationEntry.query.count() == 0
        audits = DeletionAudit.query.order_by(DeletionAudit.id).all()
        assert [(a.entity, a.label) for a in audits] == [("evaluation_category", "Grit"), ("evaluation_category", "Forehand")]


def test_the_legacy_list_still_hides_what_this_api_creates(app, client):
    """R-047 holds against the first endpoint that can create a non-legacy row."""
    ids = _seed(app)
    _post(app, client, ids, {"catalogueKey": "bandeja"})
    _post(app, client, ids, {"name": "Grit"})

    names = [c["name"] for c in client.get(f"{BASE}/evaluation_categories", headers=_coach_headers(app, ids)).get_json()]

    assert names == ["Forehand", "Volley"]


def test_a_coach_with_no_category_at_all_starts_with_the_three_general_competencies(app, client):
    """Rule 4 (AV-021): created by the first v2 read, never by a legacy endpoint."""
    from padel_app.models import EvaluationCategory
    from padel_app.tests.test_notification_reminder_flow import _seed_coach_and_student

    ids = _seed_coach_and_student(app)
    headers = _coach_headers(app, ids)

    assert client.get(f"{BASE}/evaluation_categories", headers=headers).get_json() == []  # the legacy read seeds nothing
    with app.app_context():
        assert EvaluationCategory.query.count() == 0

    body = _get(app, client, ids)
    again = _get(app, client, ids)

    assert [(c["key"], c["group"], c["isActive"], c["scaleMax"]) for c in body["competencies"]] == [
        ("technique", "general", True, 5), ("tactics", "general", True, 5), ("consistency", "general", True, 5),
    ]
    assert again == body and len(body["catalogue"]) == 14
    assert client.get(f"{BASE}/evaluation_categories", headers=headers).get_json() == []  # R-047 still holds


def test_a_coach_who_holds_any_category_is_seeded_nothing(app, client):
    ids = _seed(app)

    assert [c["name"] for c in _get(app, client, ids)["competencies"]] == ["Forehand", "Volley"]


def test_a_lost_race_for_the_starting_set_does_not_double_it(app):
    """Two first reads at once: the unique (coach_id, catalogue_key) index lets one
    win; the loser re-reads. Simulated by the winner's rows landing in between."""
    from padel_app.models import Coach, EvaluationCategory
    from padel_app.services import evaluation_api_service as service
    from padel_app.tests.test_notification_reminder_flow import _seed_coach_and_student

    ids = _seed_coach_and_student(app)
    with app.app_context():
        coach = db.session.get(Coach, ids["coach_id"])
        real_first = EvaluationCategory.query.filter_by(coach_id=coach.id).first

        service.ensure_starting_set(coach)             # the winner
        assert EvaluationCategory.query.count() == 3

        class _Blind:  # the loser read "no category" before the winner committed
            def filter_by(self, **kw):
                return self
            def first(self):
                return None

        original = EvaluationCategory.query
        try:
            type(EvaluationCategory).query = property(lambda cls: _Blind())
            service.ensure_starting_set(coach)         # hits the unique index, rolls back, returns
        finally:
            del type(EvaluationCategory).query
        assert real_first is not None and original is not None
        assert EvaluationCategory.query.filter_by(coach_id=coach.id).count() == 3
