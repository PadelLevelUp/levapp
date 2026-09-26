"""
PAD-443 — attendance.validation rule 23: the Presences badge is the dashboard's number.

`validation_badge(coach_id, now)` is the dashboard validation item's derivation (the current
Monday–Sunday week, else the previous one) with `count` 0 when both weeks are clean, and
`GET /class_instances/pending_validation/badge` serves it. The dashboard item, the web sidebar
badge and the iOS tab badge all read it, so there is one number (rule 18).

Criterion: "The Presences badge is the dashboard's number, with its tier".

Run:
    pytest padel_app/tests/test_pad443_validation_badge.py -v
"""
from datetime import datetime, timedelta

from padel_app.tests.test_dashboard_coach_home import (
    _add_past_class_with_unvalidated_presence,
    _seed,
)

TUESDAY = datetime(2026, 8, 4, 10, 0)  # the seed leaves one pending class last week (Sun 2 Aug)


def test_badge_prefers_the_current_week(app):
    from padel_app.helpers.dashboard.coach_home import validation_badge

    coach_id, _, _ = _seed(app, now=TUESDAY)
    _add_past_class_with_unvalidated_presence(
        app, coach_id=coach_id, ended_at=datetime(2026, 8, 3, 19, 0), title="Monday Class"
    )
    with app.app_context():
        badge = validation_badge(coach_id=coach_id, now=TUESDAY)
    assert badge == {"count": 1, "weekOffset": 0, "href": "/presences?validate=1"}


def test_badge_falls_back_to_last_week(app):
    from padel_app.helpers.dashboard.coach_home import validation_badge

    coach_id, _, _ = _seed(app, now=TUESDAY)
    with app.app_context():
        badge = validation_badge(coach_id=coach_id, now=TUESDAY)
    assert badge == {"count": 1, "weekOffset": -1, "href": "/presences?validate=1&week=-1"}


def test_badge_is_zero_when_both_weeks_are_clean(app):
    from padel_app.helpers.dashboard.coach_home import validation_badge

    coach_id, _, _ = _seed(app, now=TUESDAY)
    three_weeks_on = TUESDAY + timedelta(weeks=3)
    with app.app_context():
        badge = validation_badge(coach_id=coach_id, now=three_weeks_on)
    assert badge == {"count": 0, "weekOffset": 0, "href": "/presences?validate=1"}


def test_badge_is_the_dashboard_items_number(app):
    """Rule 18: one derivation, so the badge and the dashboard card can never disagree."""
    from padel_app.helpers.dashboard.coach_home import build_needs_you_block, validation_badge

    coach_id, user_id, _ = _seed(app, now=TUESDAY)
    for day in (3, 4):
        _add_past_class_with_unvalidated_presence(
            app, coach_id=coach_id, ended_at=datetime(2026, 8, day, 9, 0), title=f"Class {day}"
        )
    with app.app_context():
        block = build_needs_you_block(coach_id=coach_id, user_id=user_id, now=TUESDAY)
        badge = validation_badge(coach_id=coach_id, now=TUESDAY)
    item = next(i for i in block["data"]["items"] if i["kind"] == "validation")
    assert (badge["count"], badge["weekOffset"], badge["href"]) == (
        item["count"], item["weekOffset"], item["href"]
    )
    assert badge["count"] == 2


def test_route_serves_the_badge_to_a_coach_and_refuses_a_student(app, client):
    from flask_jwt_extended import create_access_token
    from padel_app.models.coaches import Coach
    from padel_app.models.players import Player
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.sql_db import db

    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    coach_id, _, _ = _seed(app, now=TUESDAY)
    with app.app_context():
        coach_token = create_access_token(identity=str(db.session.get(Coach, coach_id).user_id))
        player_id = (
            db.session.query(Association_CoachPlayer.player_id)
            .filter(Association_CoachPlayer.coach_id == coach_id)
            .first()[0]
        )
        student_token = create_access_token(identity=str(db.session.get(Player, player_id).user_id))

    ok = client.get(
        "/api/app/class_instances/pending_validation/badge",
        headers={"Authorization": f"Bearer {coach_token}"},
    )
    assert ok.status_code == 200
    body = ok.get_json()
    assert set(body) == {"count", "weekOffset", "href"}
    assert isinstance(body["count"], int) and body["count"] >= 0

    refused = client.get(
        "/api/app/class_instances/pending_validation/badge",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert refused.status_code == 403
