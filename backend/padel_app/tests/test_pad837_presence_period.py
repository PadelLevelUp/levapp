"""PAD-837c: a period's edges and the clamp at today (attendance.validation rule 17h).

``build_presence_stats`` and ``build_presence_trend`` cut the window at both ends inclusively and
never read past the end of the club's today; every test pins ``now=`` so none depends on the day
it runs. The shared range parser ``_presence_overview_range`` is deliberately not clamped.
"""

from datetime import datetime, timedelta

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_pad837_presence_hours import _add_class, hours_world  # noqa: F401


def _present(w):
    return {w["ana_id"]: ("present", None)}


def _read(app, w, start, end, now):
    from padel_app.services.presence_overview_service import build_presence_stats, build_presence_trend

    with app.app_context():
        kwargs = dict(coach_id=w["coach_id"], range_start=start, range_end=end, now=now)
        return build_presence_stats(**kwargs), build_presence_trend(**kwargs)


def _ana(stats, w):
    return next(row for row in stats["players"] if row["playerId"] == w["ana_id"])


@pytest.mark.criterion("ATTENDANCE-VALIDATION-68")
def test_a_period_counts_its_first_and_last_day_and_nothing_outside(app, hours_world):
    w = hours_world
    with app.app_context():
        for day in (datetime(2026, 8, 31, 23, 30), datetime(2026, 9, 1, 0, 0),
                    datetime(2026, 10, 1, 23, 0), datetime(2026, 10, 2, 0, 0)):
            _add_class(w, day, day + timedelta(minutes=60), [w["ana_id"]], _present(w))

    stats, trend = _read(
        app, w, datetime(2026, 9, 1), datetime(2026, 10, 1, 23, 59, 59), datetime(2026, 11, 15, 12, 0)
    )
    ana = _ana(stats, w)
    assert (ana["total"], ana["presenceMinutes"]) == (2, 120)
    assert trend["total"] == 2
    assert sum(bucket["count"] for bucket in trend["buckets"]) == 2
    assert stats["to"].startswith("2026-10-01T23:59:59")


@pytest.mark.criterion("ATTENDANCE-VALIDATION-69")
def test_a_period_past_today_is_read_up_to_today(app, hours_world):
    w = hours_world
    now = datetime(2026, 11, 12, 10, 0)  # a Thursday, mid-morning
    with app.app_context():
        early = datetime(2026, 11, 3, 18, 0)
        later_today = datetime(2026, 11, 12, 20, 0)
        next_week = datetime(2026, 11, 17, 18, 0)
        _add_class(w, early, early + timedelta(minutes=60), [w["ana_id"]], _present(w))
        _add_class(w, later_today, later_today + timedelta(minutes=60), [w["ana_id"]], _present(w))
        # Declared ahead of time for a class after today: neither a count nor hours.
        _add_class(w, next_week, next_week + timedelta(minutes=90), [w["ana_id"], w["bruno_id"]],
                   {w["bruno_id"]: ("absent", "justified")})

    stats, trend = _read(app, w, datetime(2026, 11, 1), datetime(2026, 11, 30, 23, 59, 59), now)
    ana, bruno = _ana(stats, w), next(r for r in stats["players"] if r["playerId"] == w["bruno_id"])

    assert stats["to"] == trend["to"] == "2026-11-12T23:59:59"
    assert stats["from"].startswith("2026-11-01")
    assert ana["total"] == 2, "a class later today counts"
    assert (bruno["justified"], bruno["justifiedMinutes"]) == (0, 0)
    assert trend["total"] == 2
    assert all(bucket["start"] <= "2026-11-12" for bucket in trend["buckets"])


@pytest.mark.criterion("ATTENDANCE-VALIDATION-69")
def test_a_period_after_today_is_empty(app, hours_world):
    w = hours_world
    now = datetime(2026, 11, 12, 10, 0)
    with app.app_context():
        later = datetime(2026, 11, 17, 18, 0)
        _add_class(w, later, later + timedelta(minutes=60), [w["ana_id"]], _present(w))

    start, end = datetime(2026, 11, 16), datetime(2026, 11, 22, 23, 59, 59)
    stats, trend = _read(app, w, start, end, now)

    assert len(stats["players"]) == 4, "the roster still lists, every row at zero"
    for row in stats["players"]:
        assert all(row[key] == 0 for key in (
            "total", "private", "academy", "justified", "unjustified", "invitesReceived",
            "invitesJoined", "presenceMinutes", "justifiedMinutes", "guestPresenceMinutes",
            "balanceMinutes",
        ))
    assert stats["totals"]["presences"] == 0
    assert trend["buckets"] == [] and trend["total"] == 0
    assert (stats["from"], stats["to"]) == (trend["from"], trend["to"]) == (start.isoformat(), end.isoformat())


@pytest.mark.criterion("ATTENDANCE-VALIDATION-69")
def test_the_validation_routes_are_not_clamped(app, client, hours_world):
    """`_presence_overview_range` keeps the requested bounds for the pending_validation routes."""
    from flask_jwt_extended import create_access_token
    from padel_app.models.coaches import Coach

    w = hours_world
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"
    with app.app_context():
        past = datetime(2026, 10, 6, 18, 0)
        _add_class(w, past, past + timedelta(minutes=60), [w["ana_id"]], _present(w))
        token = create_access_token(identity=str(db.session.get(Coach, w["coach_id"]).user_id))
    headers = {"Authorization": f"Bearer {token}"}
    params = {"from": "2026-10-01", "to": "2099-12-31"}

    counted = client.get("/api/app/class_instances/pending_validation/count", query_string=params, headers=headers)
    listed = client.get("/api/app/class_instances/pending_validation", query_string=params, headers=headers)
    assert counted.status_code == listed.status_code == 200
    assert counted.get_json()["to"] == listed.get_json()["to"] == "2099-12-31T23:59:59"

    # The two statistics routes, on the same window, do clamp: nothing after today is echoed.
    stats = client.get("/api/app/presence_stats", query_string=params, headers=headers).get_json()
    trend = client.get("/api/app/presence_trend", query_string=params, headers=headers).get_json()
    assert stats["to"] < "2099" and trend["to"] == stats["to"]
