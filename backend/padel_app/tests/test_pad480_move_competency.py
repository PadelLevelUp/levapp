"""evaluations.competencies rule 15 "Moving" (PAD-480, reverses D150's "moving is not offered").

A non-legacy row that is not a default category and holds no sub-categories can be moved under any of
the coach's own non-legacy categories, or back to the top level, with `PATCH {parentId}`. An absent
`parentId` changes nothing; a move to the current parent is a no-op; everything else that would break
the two levels or R-047 is refused with nothing written.
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
NOW = dt.datetime(2026, 10, 2, 10, 0, 0)


@pytest.fixture(autouse=True)
def _clock(monkeypatch, app):
    import padel_app.services.evaluation_api_service  # noqa: F401
    import padel_app.services.evaluation_record_service  # noqa: F401

    pin_clock(monkeypatch, NOW)


def _post(app, client, ids, body):
    res = client.post(f"{BASE}/evaluation_competency", json=body, headers=_coach_headers(app, ids))
    assert res.status_code in (200, 201), res.get_data(as_text=True)
    return res.get_json()


def _patch(app, client, ids, cid, body):
    return client.patch(f"{BASE}/evaluation_competency/{cid}", json=body, headers=_coach_headers(app, ids))


def _put(app, client, ids, ratings):
    res = client.put(f"{BASE}/evaluation_record", json={"playerId": ids["student_id"], "ratings": ratings},
                     headers=_coach_headers(app, ids))
    assert res.status_code == 200, res.get_data(as_text=True)


def _row(app, cid):
    from padel_app.models import EvaluationCategory

    with app.app_context():
        c = db.session.get(EvaluationCategory, cid)
        return None if c is None else {
            "parent_id": c.parent_id, "sort_order": c.sort_order, "name": c.name, "is_active": c.is_active,
            "scale": (c.scale_min, c.scale_max),
        }


def _tree(app, client):
    """Ana: legacy Forehand/Volley; Grit (custom) holding Recuperação; Bandeja under the default Técnica."""
    ids = _seed(app)
    grit = _post(app, client, ids, {"name": "Grit"})
    rec = _post(app, client, ids, {"name": "Recuperação", "parentId": grit["id"]})
    bandeja = _post(app, client, ids, {"catalogueKey": "bandeja"})
    return ids, grit["id"], rec["id"], bandeja["id"], bandeja["parentId"]


def _stray(app, ids):
    """A sub-level catalogue row at the top level, as the PAD-431 migration left coach 2's Serviço."""
    from padel_app.models import EvaluationCategory

    with app.app_context():
        row = EvaluationCategory(coach_id=ids["coach_id"], name="Serviço", scale_min=1, scale_max=5,
                                 catalogue_key="serve", competency_group="technique", is_active=False)
        db.session.add(row)
        db.session.commit()
        return row.id


def test_a_row_moves_under_another_category_and_back(app, client):
    """Criterion "A row moves under another category, and back"."""
    from padel_app.models import EvaluationEntry

    ids, grit, _rec, bandeja, technique = _tree(app, client)
    assert _patch(app, client, ids, bandeja, {"sortOrder": 2}).status_code == 200
    _put(app, client, ids, {str(bandeja): 4})
    before = _row(app, bandeja)

    moved = _patch(app, client, ids, bandeja, {"parentId": grit})

    assert moved.status_code == 200, moved.get_data(as_text=True)
    assert moved.get_json()["parentId"] == grit and moved.get_json()["sortOrder"] is None
    after = _row(app, bandeja)
    assert (after["parent_id"], after["sort_order"]) == (grit, None)
    assert (after["name"], after["is_active"], after["scale"]) == (before["name"], before["is_active"], before["scale"])
    with app.app_context():
        assert EvaluationEntry.query.filter_by(category_id=bandeja).count() == 1

    back = _patch(app, client, ids, bandeja, {"parentId": technique})

    assert back.status_code == 200 and back.get_json()["parentId"] == technique
    assert _row(app, grit) is not None  # the old parent is untouched


def test_a_custom_sub_category_can_become_a_category(app, client):
    ids, _grit, rec, _bandeja, _technique = _tree(app, client)

    res = _patch(app, client, ids, rec, {"parentId": None})

    assert res.status_code == 200 and res.get_json()["parentId"] is None
    assert _row(app, rec)["parent_id"] is None


def test_a_stray_moves_under_its_default(app, client):
    ids, _grit, _rec, _bandeja, technique = _tree(app, client)
    stray = _stray(app, ids)

    res = _patch(app, client, ids, stray, {"parentId": technique})

    assert res.status_code == 200 and _row(app, stray)["parent_id"] == technique


@pytest.mark.parametrize("case", [
    "legacy row", "legacy target", "default category as the row", "row with sub-categories",
    "sub-category as the target", "itself", "parentId not an int", "parentId a bool", "no such target",
    "a stray as the target", "a catalogue sub-category to the top level",
])
def test_a_move_that_breaks_two_levels_or_r047_is_refused_and_nothing_changes(app, client, case):
    """Criterion "A move that breaks the two levels or R-047 is refused, and nothing changes"."""
    ids, grit, rec, bandeja, technique = _tree(app, client)
    stray = _stray(app, ids)
    garra = _post(app, client, ids, {"name": "Garra"})["id"]  # top-level, no sub-categories
    row, target = {
        "legacy row": (ids["forehand_id"], grit),
        "legacy target": (bandeja, ids["forehand_id"]),
        "default category as the row": (technique, grit),
        "row with sub-categories": (grit, technique),
        "sub-category as the target": (bandeja, rec),
        "itself": (garra, garra),  # a top-level row _parent would accept: only the self check refuses it
        "parentId not an int": (bandeja, str(grit)),
        "parentId a bool": (bandeja, True),
        "no such target": (bandeja, 999999),
        # F1: a stray holding a sub-category could no longer be moved itself.
        "a stray as the target": (garra, stray),
        # F2: a catalogue sub-category at the top level is a stray (B-255); only a custom one may go there.
        "a catalogue sub-category to the top level": (bandeja, None),
    }[case]
    before = {cid: _row(app, cid) for cid in (ids["forehand_id"], grit, rec, bandeja, technique, stray, garra)}

    res = _patch(app, client, ids, row, {"parentId": target})

    assert res.status_code == 400, res.get_data(as_text=True)
    assert res.get_json()["error"] == "parent_invalid"
    assert {cid: _row(app, cid) for cid in before} == before


def test_a_move_under_another_coachs_category_is_forbidden(app, client):
    ids, _grit, _rec, bandeja, technique = _tree(app, client)
    other = _other_coach(app)

    res = _patch(app, client, ids, bandeja, {"parentId": other["category_id"]})

    assert res.status_code == 403
    assert _row(app, bandeja)["parent_id"] == technique


def test_a_move_to_the_parent_the_row_already_has_changes_nothing(app, client):
    """Criterion "A move to the parent the row already has changes nothing"."""
    ids, grit, rec, _bandeja, _technique = _tree(app, client)
    assert _patch(app, client, ids, rec, {"sortOrder": 1}).status_code == 200

    res = _patch(app, client, ids, rec, {"parentId": grit})

    assert res.status_code == 200
    assert (_row(app, rec)["parent_id"], _row(app, rec)["sort_order"]) == (grit, 1)


@pytest.mark.parametrize("body", [{"name": "Recuperação ativa"}, {"isActive": False}, {"sortOrder": 3}])
def test_an_edit_that_does_not_send_parent_id_keeps_the_parent(app, client, body):
    """Criterion "An edit that does not send parentId keeps the parent" (every build before PAD-480)."""
    ids, grit, rec, _bandeja, _technique = _tree(app, client)

    assert _patch(app, client, ids, rec, body).status_code == 200

    assert _row(app, rec)["parent_id"] == grit


def test_a_rename_and_a_move_in_one_request(app, client):
    ids, grit, _rec, bandeja, _technique = _tree(app, client)

    res = _patch(app, client, ids, bandeja, {"name": "Bandeja alta", "parentId": grit})

    assert res.status_code == 200
    assert (_row(app, bandeja)["name"], _row(app, bandeja)["parent_id"]) == ("Bandeja alta", grit)


def test_deleting_the_new_parent_takes_the_moved_row_with_it(app, client):
    """Criterion "Deleting the new parent takes the moved row with it"."""
    from padel_app.models import EvaluationEntry

    ids, grit, rec, bandeja, _technique = _tree(app, client)
    _put(app, client, ids, {str(bandeja): 4})
    assert _patch(app, client, ids, bandeja, {"parentId": grit}).status_code == 200
    headers = _coach_headers(app, ids)

    impact = client.get(f"{BASE}/evaluation_competency/{grit}/impact", headers=headers).get_json()
    deleted = client.delete(f"{BASE}/evaluation_competency/{grit}", headers=headers)

    assert impact["scores"] == 1 and deleted.status_code == 200
    assert _row(app, bandeja) is None and _row(app, rec) is None
    with app.app_context():
        assert EvaluationEntry.query.filter_by(category_id=bandeja).count() == 0


def test_a_move_and_a_create_under_a_parent_take_the_coachs_tree_lock_before_checking(app, client, monkeypatch):
    """Rule 15: "X under Y" and "Y under Z" at once could each pass the two-level check and leave three
    levels. Both paths hold the coach row (`_lock_tree`, SELECT … FOR UPDATE) before they read the
    tree; the lock itself only exists on Postgres, so this pins that it is taken, and taken first."""
    from padel_app.services import evaluation_api_service as service

    ids, grit, rec, bandeja, technique = _tree(app, client)

    def locked(coach):
        raise service.ApiError(423, "locked")

    monkeypatch.setattr(service, "_lock_tree", locked)

    moved = _patch(app, client, ids, bandeja, {"parentId": grit})
    created = client.post(f"{BASE}/evaluation_competency", json={"name": "Lob", "parentId": grit},
                          headers=_coach_headers(app, ids))

    assert (moved.status_code, created.status_code) == (423, 423)
    assert _row(app, bandeja)["parent_id"] == technique
