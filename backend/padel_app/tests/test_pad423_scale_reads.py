"""
PAD-423 — evaluations.scale rules 5–6, the read side.

- A single score is shown on ITS OWN scale (history, the shared card): "4/5" stays "4/5" after the
  coach moves to 1–10, beside a new "7/10". An entry with no snapshot reads its competency's scale.
- Wherever scores are combined (evolution series, m1/m6/m12, delta; the shared card's lines), each
  is first placed on the competency's CURRENT scale by proportion, on the server (R-048):
  v' = cmin + (v − smin)(cmax − cmin)/(smax − smin), so 4 on 1–5 is 7.75 on 1–10.

Criterion "Moving to 1–10 keeps every existing score's meaning": Bandeja 4 on 2026-09-01, the
coach moves to 1–10, a new 7 → the mean is (7.75 + 7) / 2 = 7.375.

Run:
    pytest padel_app/tests/test_pad423_scale_reads.py -v
"""
import datetime as dt

import pytest

from padel_app.sql_db import db
from padel_app.tests.evaluation_history import seed_evaluation_history
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad362_evaluation_contract import _coach_headers, _jwt_secret, _seed  # noqa: F401

NOW = dt.datetime(2026, 9, 25, 10, 0, 0)


@pytest.fixture(autouse=True)
def _clock(monkeypatch, app):
    import padel_app.services.evaluation_api_service  # noqa: F401
    import padel_app.services.evaluation_record_service  # noqa: F401

    pin_clock(monkeypatch, NOW)


def _coach(ids):
    from padel_app.models import Coach

    return db.session.get(Coach, ids["coach_id"])


def _world(app, first_days_before=24):
    """Bandeja (catalogue) rated 4 on 1–5, the coach moves to 1–10, then Bandeja rated 7 today."""
    from padel_app.services.evaluation_api_service import create_competency, put_evaluation_scale

    ids = _seed(app)
    with app.app_context():
        bandeja, _ = create_competency(_coach(ids), {"catalogueKey": "bandeja"})
        ids["bandeja_id"] = bandeja.id
        seed_evaluation_history(ids["rel_id"], bandeja.id, [(first_days_before, 4)], anchor=NOW, in_records=True)
        db.session.commit()
        put_evaluation_scale(_coach(ids), {"scaleMax": 10})
        seed_evaluation_history(ids["rel_id"], bandeja.id, [(0, 7)], anchor=NOW, in_records=True)
        db.session.commit()
    return ids


def _get(app, client, ids, path):
    res = client.get(f"/api/app/player/{ids['student_id']}/{path}", headers=_coach_headers(app, ids))
    assert res.status_code == 200, res.get_data(as_text=True)
    return res.get_json()


def _bandeja_ratings(history, ids):
    return {
        r["evaluatedOn"]: (x["score"], x["scaleMin"], x["scaleMax"])
        for r in history["records"] for x in r["ratings"] if x["categoryId"] == ids["bandeja_id"]
    }


def test_history_shows_each_score_on_its_own_scale(app, client):
    ids = _world(app)
    history = _get(app, client, ids, "evaluations")
    assert _bandeja_ratings(history, ids) == {"2026-09-01": (4, 1, 5), "2026-09-25": (7, 1, 10)}


def test_an_entry_with_no_snapshot_reads_its_competency_scale(app, client):
    from padel_app.models import EvaluationEntry

    ids = _world(app)
    with app.app_context():
        EvaluationEntry.query.filter_by(category_id=ids["bandeja_id"], score=7.0).update(
            {"scale_min": None, "scale_max": None}, synchronize_session=False)
        db.session.commit()
    history = _get(app, client, ids, "evaluations")
    assert _bandeja_ratings(history, ids)["2026-09-25"] == (7, 1, 10)


def test_the_mean_places_each_score_on_the_current_scale(app, client):
    """The criterion's 7.375: 4 on 1–5 is 7.75 on 1–10; with the new 7 the month's mean is 7.375."""
    from padel_app.services.evaluation_api_service import monthly_means

    ids = _world(app)
    with app.app_context():
        assert monthly_means(ids["rel_id"], ids["bandeja_id"]) == {"2026-09": 7.375}
    evolution = _get(app, client, ids, f"evaluations/evolution?categoryId={ids['bandeja_id']}")
    assert (evolution["scaleMin"], evolution["scaleMax"]) == (1, 10)
    assert evolution["series"] == [{"month": "2026-09", "mean": 7.4}]
    assert evolution["means"] == {"m1": 7.4, "m6": 7.4, "m12": 7.4}


def test_the_evolution_delta_compares_on_the_current_scale(app, client):
    ids = _world(app, first_days_before=40)  # 2026-08-16: a month of its own
    evolution = _get(app, client, ids, f"evaluations/evolution?categoryId={ids['bandeja_id']}")
    assert evolution["series"] == [{"month": "2026-08", "mean": 7.8}, {"month": "2026-09", "mean": 7.0}]
    assert evolution["delta"] == {"value": -0.8, "sinceMonth": "2026-08"}


def test_the_shared_card_shows_its_own_scale_and_compares_on_the_current_one(app, client):
    ids = _world(app)
    headers = _coach_headers(app, ids)
    records = {r["evaluatedOn"]: r["id"] for r in _get(app, client, ids, "evaluations")["records"]}

    old = client.post(f"/api/app/evaluation_record/{records['2026-09-01']}/share_preview", headers=headers,
                      json={"categoryIds": [ids["bandeja_id"]], "evolution": "none", "includeNote": False})
    assert old.status_code == 200, old.get_data(as_text=True)
    assert [(r["score"], r["scaleMin"], r["scaleMax"]) for r in old.get_json()["ratings"]] == [(4, 1, 5)]

    new = client.post(f"/api/app/evaluation_record/{records['2026-09-25']}/share_preview", headers=headers,
                      json={"categoryIds": [ids["bandeja_id"]], "evolution": "last", "includeNote": False})
    assert new.status_code == 200, new.get_data(as_text=True)
    card = new.get_json()
    assert [(r["score"], r["scaleMin"], r["scaleMax"]) for r in card["ratings"]] == [(7, 1, 10)]
    # 7 − 7.75 (the earlier 4/5 on 1–10), each rounded to one decimal first, as evolution() does.
    assert [line["delta"] for line in card["evolution"]] == [-0.8]
