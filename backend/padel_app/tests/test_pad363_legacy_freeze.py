"""evaluations.legacy-client-contract (PAD-363, rule R-047) — the freeze.

App Store iOS 1.0 / 1.1.0 list every category `GET /app/evaluation_categories`
returns and post a value for each, unrated ones at the scale midpoint. A new
competency shown to them becomes a fabricated score on every save. So the five
endpoints those builds call see, accept, return and delete **legacy categories
only** (`competency_group IS NULL`) — by endpoint, whatever headers are sent.

The acceptance is a 2×2: (requests shaped like an App Store build on the old
endpoints / the record service called directly) × (non-legacy competencies exist
for the coach / none exist). The "none exist" column on the old endpoints is
PAD-362's pins (test_pad362_evaluation_contract.py), which must pass unchanged;
this file holds the other three cells and what slice 1 adds under the pins.
"""
import datetime as dt
from types import SimpleNamespace

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad362_evaluation_contract import (  # noqa: F401 — _jwt_secret is an autouse fixture
    NAIVE_ISO,
    _coach_headers,
    _jwt_secret,
    _other_coach,
    _profile,
    _rows,
    _save,
    _seed,
)

def _with_competencies(app, ids):
    """The coach switched on a catalogue competency and added a custom one (1-5)."""
    from padel_app.models import EvaluationCategory

    with app.app_context():
        serve = EvaluationCategory(
            coach_id=ids["coach_id"], name="Serve", scale_min=1, scale_max=5,
            competency_group="technique", catalogue_key="technique.serve", sort_order=0,
        )
        grit = EvaluationCategory(
            coach_id=ids["coach_id"], name="Grit", scale_min=1, scale_max=5, competency_group="custom",
        )
        db.session.add_all([serve, grit])
        db.session.commit()
        ids.update(serve_id=serve.id, grit_id=grit.id)
    return ids


def _all_entries(app, ids):
    from padel_app.models import EvaluationEntry

    with app.app_context():
        return [
            (e.category_id, e.score)
            for e in EvaluationEntry.query.filter_by(coach_player_id=ids["rel_id"]).order_by(EvaluationEntry.id).all()
        ]


def _rate_directly(app, ids, category_key, score, day=None):
    from padel_app.services import evaluation_record_service as svc

    with app.app_context():
        record = svc.get_or_create_record(ids["rel_id"], day=day or svc.record_day())
        svc.upsert_rating(record, ids[category_key], score)
        return record.id


# ── old endpoints × non-legacy competencies exist ───────────────────────────


def test_r047_evaluation_categories_lists_legacy_categories_only(app, client):
    ids = _with_competencies(app, _seed(app))

    res = client.get("/api/app/evaluation_categories", headers=_coach_headers(app, ids))

    assert res.status_code == 200
    assert res.get_json() == [
        {"id": ids["forehand_id"], "name": "Forehand", "scaleMin": 1, "scaleMax": 10},
        {"id": ids["volley_id"], "name": "Volley", "scaleMin": 0, "scaleMax": 10},
    ]


def test_r047_evaluation_categories_ignores_a_declared_capability(app, client):
    """By endpoint, not by token: no header makes this endpoint list a competency."""
    ids = _with_competencies(app, _seed(app))
    headers = {**_coach_headers(app, ids), "X-LevApp-Capabilities": "evaluations, open-spots"}

    names = [c["name"] for c in client.get("/api/app/evaluation_categories", headers=headers).get_json()]

    assert names == ["Forehand", "Volley"]


def test_r047_evaluation_categories_hides_a_legacy_category_that_was_switched_off(app, client):
    from padel_app.models import EvaluationCategory

    ids = _seed(app)
    with app.app_context():
        db.session.get(EvaluationCategory, ids["volley_id"]).is_active = False
        db.session.commit()

    names = [c["name"] for c in client.get("/api/app/evaluation_categories", headers=_coach_headers(app, ids)).get_json()]

    assert names == ["Forehand"]


def test_r047_a_posted_score_for_a_competency_is_ignored_even_at_its_midpoint(app, client):
    """What an old build would send if it ever learned the id: every category,
    the unrated ones at Math.round((min + max) / 2) — 3 on a 1-5 competency."""
    ids = _with_competencies(app, _seed(app))

    res = _save(app, client, ids, [
        {"categoryId": ids["forehand_id"], "value": 8},
        {"categoryId": ids["serve_id"], "value": 3},
        {"categoryId": ids["grit_id"], "value": 3},
    ])

    assert res.status_code == 200
    assert res.get_json() == {"status": "ok", "playerId": ids["student_id"]}
    assert _all_entries(app, ids) == [(ids["forehand_id"], 8.0)]


def test_r047_a_posted_score_for_a_foreign_or_unknown_category_is_ignored(app, client):
    ids = _seed(app)
    other = _other_coach(app)

    res = _save(app, client, ids, [
        {"categoryId": other["category_id"], "value": 3},
        {"categoryId": 987654, "value": 3},
        {"categoryId": ids["forehand_id"], "value": 6},
    ])

    assert res.status_code == 200
    assert _all_entries(app, ids) == [(ids["forehand_id"], 6.0)]


def test_r047_player_profile_never_carries_a_competency_rating(app, client):
    ids = _with_competencies(app, _seed(app))
    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 8}]).status_code == 200
    _rate_directly(app, ids, "serve_id", 4)
    _rate_directly(app, ids, "grit_id", 2)

    evaluations = _profile(app, client, ids)["evaluations"]

    assert [e["categoryName"] for e in evaluations] == ["Forehand"]
    assert set(evaluations[0]) == {"categoryId", "categoryName", "score", "scaleMin", "scaleMax", "evaluatedAt"}
    assert NAIVE_ISO.match(evaluations[0]["evaluatedAt"])


def test_r047_a_competency_rating_does_not_disturb_the_legacy_skip_rules(app, client):
    """Equal to the category's latest → nothing written, with competencies rated the same day."""
    ids = _with_competencies(app, _seed(app))
    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 8}]).status_code == 200
    _rate_directly(app, ids, "serve_id", 4)
    before = _rows(app, ids, "forehand_id")

    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 8}]).status_code == 200

    assert _rows(app, ids, "forehand_id") == before


def test_r047_the_category_upsert_never_touches_or_collides_into_a_competency(app, client):
    from padel_app.models import EvaluationCategory

    ids = _with_competencies(app, _seed(app))
    body = [
        {"name": "Serve", "scaleMin": 1, "scaleMax": 10},   # collides with the catalogue competency: skipped
        {"name": "Forehand", "scaleMin": 1, "scaleMax": 7},  # legacy: updated, as today
        {"name": "Lob", "scaleMin": 1, "scaleMax": 10},      # new: created as a legacy category
    ]

    res = client.post("/api/app/add_evaluation_categories", json=body, headers=_coach_headers(app, ids))

    assert res.status_code == 200 and res.get_json() == body  # the echo, as today
    with app.app_context():
        rows = {
            c.name: (c.scale_min, c.scale_max, c.competency_group, c.catalogue_key)
            for c in EvaluationCategory.query.filter_by(coach_id=ids["coach_id"]).all()
        }
    assert rows == {
        "Serve": (1, 5, "technique", "technique.serve"),
        "Grit": (1, 5, "custom", None),
        "Forehand": (1, 7, None, None),
        "Volley": (0, 10, None, None),
        "Lob": (1, 10, None, None),
    }


def test_r047_deleting_a_competency_through_the_legacy_endpoint_is_refused(app, client):
    from padel_app.models import EvaluationCategory, EvaluationEntry
    from padel_app.models.deletion_audit import DeletionAudit

    ids = _with_competencies(app, _seed(app))
    _rate_directly(app, ids, "serve_id", 4)

    res = client.post("/api/app/delete/evaluation_category", json={"id": ids["serve_id"]}, headers=_coach_headers(app, ids))

    assert res.status_code == 403
    with app.app_context():
        assert db.session.get(EvaluationCategory, ids["serve_id"]) is not None
        assert EvaluationEntry.query.filter_by(category_id=ids["serve_id"]).count() == 1
        assert DeletionAudit.query.count() == 0


# ── the record service × non-legacy competencies exist ──────────────────────


def test_the_record_service_rates_a_competency_next_to_the_legacy_scores_of_the_day(app, client):
    from padel_app.models import EvaluationRecord

    ids = _with_competencies(app, _seed(app))
    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 8}]).status_code == 200
    record_id = _rate_directly(app, ids, "serve_id", 4)

    with app.app_context():
        record = db.session.get(EvaluationRecord, record_id)
        assert sorted((e.category_id, e.score) for e in record.entries) == sorted(
            [(ids["forehand_id"], 8.0), (ids["serve_id"], 4.0)]
        )
        assert EvaluationRecord.query.count() == 1  # the legacy save and the service share the day's record


# ── under the pins: what slice 1 adds when no competency exists ─────────────


def test_a_legacy_save_lands_in_the_days_classless_record(app, client):
    from padel_app.models import EvaluationEntry, EvaluationRecord
    from padel_app.services.evaluation_record_service import record_day

    ids = _seed(app)
    assert _save(app, client, ids, [
        {"categoryId": ids["forehand_id"], "value": 5},
        {"categoryId": ids["volley_id"], "value": 6},
    ]).status_code == 200
    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 7}]).status_code == 200

    with app.app_context():
        (record,) = EvaluationRecord.query.all()
        assert (record.coach_player_id, record.lesson_instance_id, record.note) == (ids["rel_id"], None, None)
        assert record.evaluated_on == record_day()
        rows = EvaluationEntry.query.order_by(EvaluationEntry.id).all()
        # 5 then 7 on one day: both rows kept (append-only), the latest holds the record's slot
        assert [(e.category_id, e.score, e.record_id) for e in rows] == [
            (ids["forehand_id"], 5.0, None),
            (ids["volley_id"], 6.0, record.id),
            (ids["forehand_id"], 7.0, record.id),
        ]


def test_a_failed_legacy_save_leaves_no_empty_record_behind(app, client):
    """B-136 stays as pinned (a numeric 0 fails); it must not strand a record."""
    from sqlalchemy.exc import IntegrityError

    from padel_app.models import EvaluationRecord

    ids = _seed(app)
    with pytest.raises(IntegrityError):
        _save(app, client, ids, [{"categoryId": ids["volley_id"], "value": 0}])
    with app.app_context():
        db.session.rollback()
        assert EvaluationRecord.query.count() == 0


def test_deleting_a_legacy_category_removes_the_records_it_emptied(app, client):
    from padel_app.models import EvaluationRecord

    ids = _seed(app)
    assert _save(app, client, ids, [{"categoryId": ids["volley_id"], "value": 6}]).status_code == 200

    res = client.post("/api/app/delete/evaluation_category", json={"id": ids["volley_id"]}, headers=_coach_headers(app, ids))

    assert res.status_code == 200
    with app.app_context():
        assert EvaluationRecord.query.count() == 0


def test_evaluated_at_is_never_null_on_the_profile_even_for_a_drifted_row():
    """The column is NOT NULL since PAD-273, but production schemas drift and the
    old builds throw on a null. The serializer falls back rather than emit one,
    in the same naive format as every other row."""
    from padel_app.services.player_service import evaluated_at_iso

    created = dt.datetime(2026, 2, 3, 4, 5, 6)
    assert evaluated_at_iso(SimpleNamespace(evaluated_at=None, created_at=created)) == "2026-02-03T04:05:06"
    assert NAIVE_ISO.match(evaluated_at_iso(SimpleNamespace(evaluated_at=None, created_at=None)))
    assert evaluated_at_iso(SimpleNamespace(evaluated_at=created, created_at=None)) == "2026-02-03T04:05:06"
