"""D111 (PAD-403, evaluations.legacy-conversion): every category is 1-5 stars
after the conversion, so the import (spreadsheet and AI, both ending in
``bulk_create_evaluation_entries``) refuses a score outside 1-5 as a row error.
It never guesses a 1-10 sheet and never stores a score off the scale. The error
carries ``code: score_out_of_range`` so the web renders it in the coach's
language.
"""
import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad362_evaluation_contract import (  # noqa: F401 — _jwt_secret is an autouse fixture
    _jwt_secret,
    _rows,
    _seed,
)


def _import(app, ids, rows):
    from padel_app.models import Coach
    from padel_app.services.import_service import bulk_create_evaluation_entries

    with app.app_context():
        return bulk_create_evaluation_entries(rows, db.session.get(Coach, ids["coach_id"]))


@pytest.mark.parametrize("score", [0, 0.5, 5.5, 8, 10])
def test_a_wide_row_score_off_1_5_is_a_row_error_and_nothing_is_stored(app, score):
    ids = _seed(app)
    result = _import(app, ids, [
        {"player_name": "Test Student", "date": "2026-02-01", "Forehand": score, "Volley": 4},
    ])
    assert result["errors"] == [{
        "row": 0, "code": "score_out_of_range", "category": "Forehand", "value": float(score),
        "error": f"Score {float(score):g} for 'Forehand' is outside 1-5: scores are 1-5 stars, rescale the sheet",
    }]
    assert _rows(app, ids, "forehand_id") == []
    assert [score for score, _ in _rows(app, ids, "volley_id")] == [4.0], "the row's in-range cell is still imported"
    assert result["imported"] == 1


def test_a_normalized_row_score_off_1_5_is_a_row_error_and_nothing_is_stored(app):
    ids = _seed(app)
    result = _import(app, ids, [
        {"player_name": "Test Student", "date": "2026-02-01", "category_name": "Forehand", "score": 8},
        {"player_name": "Test Student", "date": "2026-02-01", "category_name": "Volley", "score": 5},
    ])
    assert [(e["row"], e["code"], e["category"], e["value"]) for e in result["errors"]] == [
        (0, "score_out_of_range", "Forehand", 8.0),
    ]
    assert _rows(app, ids, "forehand_id") == []
    assert [score for score, _ in _rows(app, ids, "volley_id")] == [5.0]
    assert result["imported"] == 1


@pytest.mark.parametrize("score", [1, 1.5, 3, "4", 5])
def test_every_score_on_1_5_is_imported(app, score):
    ids = _seed(app)
    result = _import(app, ids, [{"player_name": "Test Student", "date": "2026-02-01", "Forehand": score}])
    assert (result["imported"], result["errors"]) == (1, [])
    assert [s for s, _ in _rows(app, ids, "forehand_id")] == [float(score)]
