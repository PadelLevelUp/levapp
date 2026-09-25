"""PAD-403 guard (evaluations.legacy-conversion rules 2, 5): after the conversion
no ``evaluation_categories`` row holds a scale other than 1-5, whichever way it
got there: converted by the migration, created by App Store 1.0/1.1.0's editor
through the frozen upsert, created by the import (the spreadsheet and AI import
both end in ``bulk_create_evaluation_categories``), or created with no scale at
all (the model default).

The count is the guard: ``SELECT count(*) FROM evaluation_categories WHERE
scale_min <> 1 OR scale_max <> 5`` is 0.
"""
import sqlalchemy as sa

from padel_app.sql_db import db
from padel_app.tests.test_pad362_evaluation_contract import (  # noqa: F401 — _jwt_secret is an autouse fixture
    _coach_headers,
    _jwt_secret,
    _seed,
)
from padel_app.tests.test_pad403_migration import _run, _scratch

# Legacy categories only (competency_group NULL): since PAD-423 a coach may put their non-legacy
# competencies on 1-10/20/100 (evaluations.scale rule 2); every LEGACY category stays 1-5.
NOT_1_5 = "SELECT count(*) FROM evaluation_categories WHERE competency_group IS NULL AND (scale_min <> 1 OR scale_max <> 5)"


def _count_not_1_5(app):
    with app.app_context():
        return db.session.execute(sa.text(NOT_1_5)).scalar()


def test_the_migration_leaves_no_legacy_category_off_1_5():
    conn = _scratch()  # Forehand 1-10, Volley 0-10, Technique 1-5
    assert conn.exec_driver_sql(NOT_1_5).scalar() == 2
    _run(conn, "upgrade")
    assert conn.exec_driver_sql(NOT_1_5).scalar() == 0


def test_the_frozen_upsert_creates_and_updates_only_1_5(app, client):
    ids = _seed(app)
    res = client.post("/api/app/add_evaluation_categories", json=[
        {"name": "Forehand", "scaleMin": 0, "scaleMax": 10},  # exists: updated
        {"name": "Smash", "scaleMin": 0, "scaleMax": 10},     # new: the editors' default
        {"name": "Lob", "scaleMin": 1, "scaleMax": 10},       # new: the legacy default
        {"name": "Drop"},                                    # new: no scale sent
    ], headers=_coach_headers(app, ids))
    assert res.status_code == 200
    assert _count_not_1_5(app) == 0


def test_the_import_creates_only_1_5(app):
    from padel_app.models import Coach
    from padel_app.services.import_service import bulk_create_evaluation_categories

    ids = _seed(app)
    with app.app_context():
        result = bulk_create_evaluation_categories([
            {"name": "Lob", "scale_min": "0", "scale_max": "10"},
            {"name": "Smash", "scale_min": 0, "scale_max": 10},
            {"name": "Drop", "scale_min": 1, "scale_max": 7},
            {"name": "Bandeja"},
        ], db.session.get(Coach, ids["coach_id"]))
    assert (result["imported"], result["errors"]) == (4, [])
    assert _count_not_1_5(app) == 0


def test_a_category_created_with_no_scale_is_1_5(app):
    from padel_app.models import EvaluationCategory

    ids = _seed(app)
    with app.app_context():
        category = EvaluationCategory(coach_id=ids["coach_id"], name="Bandeja")
        db.session.add(category)
        db.session.commit()
        assert (category.scale_min, category.scale_max) == (1, 5)
    assert _count_not_1_5(app) == 0
