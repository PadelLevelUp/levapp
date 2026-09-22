"""PAD-375 — past-dated history for the new surfaces must sit in records.

The record API reads only ratings that sit in a record (Q29). PAD-362's seed
helper writes record-less rows (all there was before PAD-363), which "Histórico"
and "Evolução" would never show. `in_records=True` files them the way the one
writer does. Every date hangs off a pinned anchor, never the wall clock (B-100).
"""
import datetime as dt

import pytest

from padel_app.sql_db import db
from padel_app.tests.evaluation_history import seed_evaluation_history
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad362_evaluation_contract import _coach_headers, _jwt_secret, _seed  # noqa: F401

NOW = dt.datetime(2026, 9, 21, 10, 0, 0)
POINTS = [(120, 1), (90, 2), (60, 2), (30, 3), (7, 4)]  # the E2E seed's own points (PAD-403: 1-5 stars)


@pytest.fixture(autouse=True)
def _clock(monkeypatch, app):
    import padel_app.services.evaluation_api_service  # noqa: F401
    import padel_app.services.evaluation_record_service  # noqa: F401

    pin_clock(monkeypatch, NOW)


def _read(app, client, ids, path):
    return client.get(f"/api/app/player/{ids['student_id']}/{path}", headers=_coach_headers(app, ids)).get_json()


def test_history_seeded_in_records_is_what_the_new_surfaces_show(app, client):
    ids = _seed(app)
    with app.app_context():
        seed_evaluation_history(ids["rel_id"], ids["forehand_id"], POINTS, anchor=NOW, in_records=True)
        db.session.commit()

    history = _read(app, client, ids, "evaluations")
    evolution = _read(app, client, ids, f"evaluations/evolution?categoryId={ids['forehand_id']}")

    assert [r["evaluatedOn"] for r in history["records"]] == ["2026-09-14", "2026-08-22", "2026-07-23", "2026-06-23", "2026-05-24"]
    assert history["competenciesWithData"] == [ids["forehand_id"]]
    assert [p["month"] for p in evolution["series"]] == ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]
    assert (evolution["scaleMin"], evolution["scaleMax"], evolution["delta"]) == (1, 5, {"value": 3.0, "sinceMonth": "2026-05"})


def test_the_default_stays_record_less_and_is_shown_nowhere_in_v2(app, client):
    ids = _seed(app)
    with app.app_context():
        seed_evaluation_history(ids["rel_id"], ids["forehand_id"], POINTS, anchor=NOW)
        db.session.commit()

    assert _read(app, client, ids, "evaluations") == {"lastEvaluatedOn": None, "records": [], "competenciesWithData": []}
