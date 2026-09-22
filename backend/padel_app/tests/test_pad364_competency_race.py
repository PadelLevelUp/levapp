"""PAD-364 review F3 — POST /evaluation_competency must not race to a 500.

A double tap on a toggle in "Gerir competências": two POST {catalogueKey} in
flight, both read "not switched on", both insert — the second hits
uq_evaluation_categories_coach_catalogue_key. Forced, as in
test_pad363_slot_race: a second connection commits the rival row the moment the
request under test has checked. Postgres-only: SQLite has one writer, so the rival
is locked out and the race cannot exist there.
"""
import os

import pytest
from sqlalchemy import text

from padel_app.sql_db import db
from padel_app.tests.test_pad362_evaluation_contract import _coach_headers, _jwt_secret, _seed  # noqa: F401

pytestmark = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="a second concurrent writer exists only on Postgres",
)


def _rival_inserts(monkeypatch, ids, *, name, key, group, after_call=1):
    from padel_app.services import evaluation_api_service as service

    real = service._name_taken
    fired, calls = [], []

    def name_taken_then_rival(coach, candidate, **kw):
        taken = real(coach, candidate, **kw)
        calls.append(candidate)
        if not fired and len(calls) == after_call:
            fired.append(True)
            with db.engine.begin() as rival:
                rival.execute(
                    text("INSERT INTO evaluation_categories (coach_id, name, scale_min, scale_max, catalogue_key, "
                         "competency_group, is_active, created_at, updated_at) "
                         "VALUES (:c, :n, 1, 5, :k, :g, true, now(), now())"),
                    {"c": ids["coach_id"], "n": name, "k": key, "g": group},
                )
        return taken

    monkeypatch.setattr(service, "_name_taken", name_taken_then_rival)
    return fired


def test_two_switch_ons_racing_answer_the_same_row(app, client, monkeypatch):
    from padel_app.models import EvaluationCategory

    ids = _seed(app)
    with app.app_context():
        fired = _rival_inserts(monkeypatch, ids, name="Bandeja", key="bandeja", group="technique")

        res = client.post("/api/app/evaluation_competency", json={"catalogueKey": "bandeja"}, headers=_coach_headers(app, ids))

        assert fired
        assert res.status_code == 200 and res.get_json()["key"] == "bandeja"
        assert EvaluationCategory.query.filter_by(coach_id=ids["coach_id"], catalogue_key="bandeja").count() == 1


def test_a_switch_on_that_loses_at_the_insert_answers_the_winners_row_too(app, client, monkeypatch):
    """The rival lands after BOTH label checks passed: the insert itself hits the unique index."""
    from padel_app.models import EvaluationCategory

    ids = _seed(app)
    with app.app_context():
        fired = _rival_inserts(monkeypatch, ids, name="Bandeja", key="bandeja", group="technique", after_call=2)

        res = client.post("/api/app/evaluation_competency", json={"catalogueKey": "bandeja"}, headers=_coach_headers(app, ids))

        assert fired
        assert res.status_code == 200 and res.get_json()["key"] == "bandeja"
        assert EvaluationCategory.query.filter_by(coach_id=ids["coach_id"], catalogue_key="bandeja").count() == 1


def test_two_custom_names_racing_are_one_row_and_a_409(app, client, monkeypatch):
    from padel_app.models import EvaluationCategory

    ids = _seed(app)
    with app.app_context():
        fired = _rival_inserts(monkeypatch, ids, name="Grit", key=None, group="custom")

        res = client.post("/api/app/evaluation_competency", json={"name": "Grit"}, headers=_coach_headers(app, ids))

        assert fired
        assert res.status_code == 409 and res.get_json() == {"error": "duplicate_name"}
        assert EvaluationCategory.query.filter_by(coach_id=ids["coach_id"], name="Grit").count() == 1
