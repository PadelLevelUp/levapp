"""
PAD-423 — evaluations.scale rules 1–2: the coach's evaluation scale.

`GET/PUT /api/app/evaluation_scale` carries `{scaleMax}`, one of 5, 10, 20, 100 (default 5).
Setting it rescales the coach's NON-legacy competencies (catalogue and custom) in the same
transaction; legacy categories (competency_group NULL) keep 1–5, and the R-047 endpoints are not
involved. A separate endpoint from `evaluation_settings`, so PAD-404's contract is unchanged.

Run:
    pytest padel_app/tests/test_pad423_scale_settings.py -v
"""
import pytest

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import _seed_coach_and_student
from padel_app.tests.test_pad362_evaluation_contract import _headers, _jwt_secret  # noqa: F401

SCALE = "/api/app/evaluation_scale"
SETTINGS = "/api/app/evaluation_settings"


def _world(app):
    """A coach with one catalogue competency, one custom one and one legacy category, all 1–5."""
    from padel_app.models import EvaluationCategory

    ids = _seed_coach_and_student(app)
    with app.app_context():
        cats = {}
        for name, group in (("Bandeja", "technique"), ("Garra", "custom"), ("Resistência", None)):
            c = EvaluationCategory(coach_id=ids["coach_id"], name=name, scale_min=1, scale_max=5,
                                   competency_group=group, is_active=True)
            db.session.add(c)
            db.session.flush()
            cats[name] = c.id
        db.session.commit()
    ids["cats"] = cats
    return ids


def _scales(app, ids):
    from padel_app.models import EvaluationCategory

    with app.app_context():
        return {c.name: (c.scale_min, c.scale_max) for c in EvaluationCategory.query.filter_by(coach_id=ids["coach_id"])}


def test_a_coach_who_never_set_a_scale_reads_5_and_no_row_is_made(app, client):
    from padel_app.models import NotificationConfig

    ids = _world(app)
    res = client.get(SCALE, headers=_headers(app, ids["coach_user_id"]))
    assert res.status_code == 200, res.get_data(as_text=True)
    assert res.get_json() == {"scaleMax": 5}
    with app.app_context():
        assert NotificationConfig.query.filter_by(coach_id=ids["coach_id"]).first() is None


def test_setting_10_rescales_catalogue_and_custom_but_not_legacy(app, client):
    ids = _world(app)
    res = client.put(SCALE, json={"scaleMax": 10}, headers=_headers(app, ids["coach_user_id"]))
    assert res.status_code == 200, res.get_data(as_text=True)
    assert res.get_json() == {"scaleMax": 10}
    assert _scales(app, ids) == {"Bandeja": (1, 10), "Garra": (1, 10), "Resistência": (1, 5)}
    assert client.get(SCALE, headers=_headers(app, ids["coach_user_id"])).get_json() == {"scaleMax": 10}


@pytest.mark.parametrize("body", [
    {"scaleMax": 7},        # not one of the four
    {"scaleMax": "10"},     # a string is not a number
    {"scaleMax": True},     # a bool is not a number
    {"scaleMax": None},
    {"scaleMax": 0},
    {},                     # absent
])
def test_anything_but_the_four_scales_is_refused_and_nothing_changes(app, client, body):
    ids = _world(app)
    headers = _headers(app, ids["coach_user_id"])
    assert client.put(SCALE, json={"scaleMax": 20}, headers=headers).status_code == 200
    res = client.put(SCALE, json=body, headers=headers)
    assert res.status_code == 400
    assert res.get_json().get("error") == "invalid_scale"
    assert client.get(SCALE, headers=headers).get_json() == {"scaleMax": 20}
    assert _scales(app, ids)["Bandeja"] == (1, 20)


def test_the_reminder_setting_contract_is_unchanged(app, client):
    """PAD-404's payload stays exactly `{reminder}` whatever the scale is."""
    ids = _world(app)
    headers = _headers(app, ids["coach_user_id"])
    client.put(SCALE, json={"scaleMax": 100}, headers=headers)
    assert client.get(SETTINGS, headers=headers).get_json() == {"reminder": "never"}
