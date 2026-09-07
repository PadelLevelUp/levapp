"""dashboard.blocks rule 3c: "Later" on an empty-seats queue item.

The button used to render on both shells and do nothing (B-029). A snooze is
stored per coach and per queue item, hides that one card for 24 hours, then
lapses on its own.
"""
from datetime import datetime, timedelta

import pytest
from flask_jwt_extended import create_access_token

from padel_app.tests.test_dashboard_coach_home import _seed


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _bearer(app, user_id):
    with app.app_context():
        token = create_access_token(identity=str(user_id))
    return {"Authorization": f"Bearer {token}"}


def _queue(app, coach_id, user_id, now):
    from padel_app.helpers.dashboard.coach_home import build_needs_you_block

    with app.app_context():
        return build_needs_you_block(coach_id=coach_id, user_id=user_id, now=now)["data"]


def test_a_snoozed_card_leaves_the_queue_and_the_count_follows(app):
    from padel_app.helpers.dashboard.snooze import snooze_item

    now = datetime(2026, 8, 4, 10, 0)
    coach_id, user_id, _ = _seed(app, now=now)

    before = _queue(app, coach_id, user_id, now)
    seats = [i for i in before["items"] if i["kind"] == "empty_seats"]
    assert len(seats) == 1

    with app.app_context():
        until = snooze_item(coach_id=coach_id, item_id=seats[0]["id"], now=now)
    assert until == now + timedelta(hours=24)

    after = _queue(app, coach_id, user_id, now)
    assert [i["kind"] for i in after["items"]] == ["validation"]
    assert after["count"] == before["count"] - 1


def test_a_snooze_lapses_after_24_hours(app):
    from padel_app.helpers.dashboard.snooze import snooze_item

    now = datetime(2026, 8, 4, 10, 0)
    coach_id, user_id, _ = _seed(app, now=now)
    item_id = _queue(app, coach_id, user_id, now)["items"][0]["id"]

    with app.app_context():
        snooze_item(coach_id=coach_id, item_id=item_id, now=now)

    # Still hidden one minute before the deadline (and the class is still in
    # the 7-day window, so it would otherwise be listed).
    later = now + timedelta(hours=23, minutes=59)
    assert not any(i["kind"] == "empty_seats" for i in _queue(app, coach_id, user_id, later)["items"])

    # Note: the seeded class starts 45 minutes after `now`, so by the time the
    # snooze lapses it has passed. Move the deadline instead: a lapsed snooze
    # is simply absent from the set.
    from padel_app.helpers.dashboard.snooze import snoozed_item_ids

    with app.app_context():
        assert snoozed_item_ids(coach_id=coach_id, now=now + timedelta(hours=24)) == set()
        assert snoozed_item_ids(coach_id=coach_id, now=now + timedelta(hours=23)) == {item_id}


def test_snoozing_again_restarts_the_clock_instead_of_stacking(app):
    from padel_app.helpers.dashboard.snooze import snooze_item
    from padel_app.models import NeedsYouSnooze

    now = datetime(2026, 8, 4, 10, 0)
    coach_id, user_id, _ = _seed(app, now=now)
    item_id = _queue(app, coach_id, user_id, now)["items"][0]["id"]

    with app.app_context():
        snooze_item(coach_id=coach_id, item_id=item_id, now=now)
        until = snooze_item(coach_id=coach_id, item_id=item_id, now=now + timedelta(hours=1))
        assert until == now + timedelta(hours=25)
        assert NeedsYouSnooze.query.filter_by(coach_id=coach_id).count() == 1


def test_a_snooze_is_the_coachs_own(app):
    """Another coach's queue is untouched by this coach's "Later"."""
    from padel_app.helpers.dashboard.snooze import snooze_item, snoozed_item_ids
    from padel_app.tests.helpers import make_coach

    now = datetime(2026, 8, 4, 10, 0)
    coach_id, user_id, _ = _seed(app, now=now)
    other = make_coach(app)
    item_id = _queue(app, coach_id, user_id, now)["items"][0]["id"]

    with app.app_context():
        snooze_item(coach_id=other, item_id=item_id, now=now)
        assert snoozed_item_ids(coach_id=coach_id, now=now) == set()
    assert _queue(app, coach_id, user_id, now)["items"][0]["kind"] == "empty_seats"


def test_snooze_endpoint_hides_the_card_for_the_calling_coach(app, client):
    now = datetime.utcnow().replace(microsecond=0)
    coach_id, user_id, _ = _seed(app, now=now)
    item_id = _queue(app, coach_id, user_id, now)["items"][0]["id"]

    res = client.post(f"/api/app/dashboard/needs-you/{item_id}/snooze", headers=_bearer(app, user_id))
    assert res.status_code == 200, res.get_json()
    body = res.get_json()
    assert body["itemId"] == item_id
    assert datetime.fromisoformat(body["snoozedUntil"]) > now + timedelta(hours=23)

    res = client.get("/api/app/dashboard", headers=_bearer(app, user_id))
    assert res.status_code == 200
    queue = next(b for b in res.get_json()["blocks"] if b["type"] == "needs_you")
    assert all(i["id"] != item_id for i in queue["data"]["items"])


def test_snooze_endpoint_rejects_students_and_garbage_ids(app, client):
    from padel_app.sql_db import db
    from padel_app.models import User
    from padel_app.models.players import Player

    now = datetime.utcnow()
    coach_id, user_id, _ = _seed(app, now=now)

    with app.app_context():
        u = User(name="Student", username="snz_student", password="x")
        db.session.add(u)
        db.session.flush()
        db.session.add(Player(user_id=u.id))
        db.session.commit()
        student_user_id = u.id

    res = client.post(
        "/api/app/dashboard/needs-you/lessoninstance-1/snooze", headers=_bearer(app, student_user_id)
    )
    assert res.status_code == 403

    res = client.post(
        "/api/app/dashboard/needs-you/DROP%20TABLE/snooze", headers=_bearer(app, user_id)
    )
    assert res.status_code == 400
