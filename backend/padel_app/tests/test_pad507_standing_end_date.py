"""PAD-507 (notifications.waiting-list rules 2, 6 and 11a): a standing waiting-list entry runs to an
end date the coach picks — at most 12 months ahead, renewable, never "forever" — and B-293: an
entry no longer fans out to classes after its end, nor once it has expired.

Owner decision 2026-10-03: custom end date, maximum 12 months, renewable, no "forever".
"""
from datetime import date, datetime, timedelta

import pytest
from dateutil.relativedelta import relativedelta
from flask_jwt_extended import create_access_token

from padel_app.sql_db import db
from padel_app.utils.dates import club_now_naive, utcnow_naive, wall_to_utc_naive

URL = "/api/app/notify/standing_waiting_list"


@pytest.fixture(autouse=True)
def _jwt_secret(app):
    app.config["JWT_SECRET_KEY"] = "test-jwt-secret"


def _today():
    return club_now_naive().date()


def _seed(app, *, class_in_days=(3,)):
    """One coach, one player and a coached class instance per entry of `class_in_days`."""
    from padel_app.models import User
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.Association_CoachPlayer import Association_CoachPlayer
    from padel_app.models.clubs import Club
    from padel_app.models.coaches import Coach
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson
    from padel_app.models.players import Player

    with app.app_context():
        users = [
            User(name=n, username=n, email=f"{n}@t.test", password="x", status="active")
            for n in ("p507_coach", "p507_other", "p507_player")
        ]
        db.session.add_all(users)
        db.session.flush()
        coach, other = Coach(user_id=users[0].id), Coach(user_id=users[1].id)
        player = Player(user_id=users[2].id)
        db.session.add_all([coach, other, player])
        db.session.flush()
        db.session.add(Association_CoachPlayer(coach_id=coach.id, player_id=player.id))
        club = Club(name="C507", description="", location="x")
        db.session.add(club)
        db.session.flush()
        instances = []
        for days in class_in_days:
            start = club_now_naive().replace(hour=10, minute=0, second=0, microsecond=0) + timedelta(days=days)
            lesson = Lesson(title=f"P507 {days}", start_datetime=start, end_datetime=start + timedelta(hours=1),
                            is_recurring=False, type="academy", max_players=4, color="#000",
                            status="active", club_id=club.id)
            db.session.add(lesson)
            db.session.flush()
            inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                                  original_lesson_occurence_date=start.date(), max_players=4,
                                  status="scheduled", notifications_enabled=True)
            db.session.add(inst)
            db.session.flush()
            db.session.add(Association_CoachLessonInstance(coach_id=coach.id, lesson_instance_id=inst.id))
            instances.append(inst.id)
        db.session.commit()
        tokens = [create_access_token(identity=str(u.id)) for u in users[:2]]
        return dict(coach_id=coach.id, player_id=player.id, instances=instances,
                    h={"Authorization": f"Bearer {tokens[0]}"}, other_h={"Authorization": f"Bearer {tokens[1]}"})


def _entries(app, coach_id):
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry

    with app.app_context():
        return [(e.is_active, e.expires_at, e.credits_used) for e in StandingWaitingListEntry.query.filter_by(coach_id=coach_id)]


def _end_of(day: date):
    """The UTC instant an entry ending on `day` (a club date, inclusive) expires at."""
    return wall_to_utc_naive(datetime.combine(day + timedelta(days=1), datetime.min.time()))


# --- POST: an end date, at most 12 months ahead -------------------------------------------------

def test_an_entry_runs_to_the_end_date_the_coach_picks(app, client):
    w = _seed(app)
    end = _today() + timedelta(days=20)
    res = client.post(URL, json={"playerId": w["player_id"], "credits": 3, "expiresOn": end.isoformat()}, headers=w["h"])
    assert res.status_code == 201, res.get_json()
    body = res.get_json()
    assert body["expiresOn"] == end.isoformat()
    assert _entries(app, w["coach_id"]) == [(True, _end_of(end), 0)]


@pytest.mark.parametrize("offset", ["today", "twelve_months"])
def test_the_end_date_may_be_today_or_twelve_months_ahead(app, client, offset):
    w = _seed(app)
    end = _today() if offset == "today" else _today() + relativedelta(months=12)
    res = client.post(URL, json={"playerId": w["player_id"], "credits": 3, "expiresOn": end.isoformat()}, headers=w["h"])
    assert res.status_code == 201, res.get_json()


@pytest.mark.parametrize("value", ["past", "beyond", "2026-13-01", "", None, "soon"])
def test_an_end_date_out_of_bounds_or_not_a_date_is_refused_and_nothing_is_written(app, client, value):
    w = _seed(app)
    if value == "past":
        value = (_today() - timedelta(days=1)).isoformat()
    elif value == "beyond":
        value = (_today() + relativedelta(months=12) + timedelta(days=1)).isoformat()
    res = client.post(URL, json={"playerId": w["player_id"], "credits": 3, "expiresOn": value}, headers=w["h"])
    assert res.status_code == 400, res.get_json()
    assert res.get_json() == {"error": "invalid_fields", "fields": ["expiresOn"]}
    assert _entries(app, w["coach_id"]) == []


def test_old_builds_still_send_a_number_of_days(app, client):
    w = _seed(app)
    res = client.post(URL, json={"playerId": w["player_id"], "credits": 3, "durationDays": 30}, headers=w["h"])
    assert res.status_code == 201, res.get_json()
    [(active, expires_at, _used)] = _entries(app, w["coach_id"])
    assert active and abs(expires_at - (utcnow_naive() + timedelta(days=30))) < timedelta(minutes=1)


@pytest.mark.parametrize("days", [0, -2, 367, "abc", 1.5])
def test_a_number_of_days_outside_one_to_twelve_months_is_refused(app, client, days):
    w = _seed(app)
    res = client.post(URL, json={"playerId": w["player_id"], "credits": 3, "durationDays": days}, headers=w["h"])
    assert res.status_code == 400, res.get_json()
    assert res.get_json() == {"error": "invalid_fields", "fields": ["durationDays"]}
    assert _entries(app, w["coach_id"]) == []


# --- PATCH: renew --------------------------------------------------------------------------------

def _add(client, w, end):
    res = client.post(URL, json={"playerId": w["player_id"], "credits": 3, "expiresOn": end.isoformat()}, headers=w["h"])
    assert res.status_code == 201, res.get_json()
    return res.get_json()["id"]


def test_renewing_moves_the_end_date_and_keeps_the_credits_used(app, client):
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry

    w = _seed(app)
    entry_id = _add(client, w, _today() + timedelta(days=5))
    with app.app_context():
        entry = StandingWaitingListEntry.query.get(entry_id)
        entry.credits_used = 2
        db.session.commit()
    new_end = _today() + relativedelta(months=6)
    res = client.patch(f"{URL}/{entry_id}", json={"expiresOn": new_end.isoformat()}, headers=w["h"])
    assert res.status_code == 200, res.get_json()
    assert res.get_json()["expiresOn"] == new_end.isoformat()
    assert res.get_json()["creditsUsed"] == 2
    assert _entries(app, w["coach_id"]) == [(True, _end_of(new_end), 2)]


def test_an_expired_entry_still_listed_can_be_renewed(app, client):
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry

    w = _seed(app)
    entry_id = _add(client, w, _today() + timedelta(days=5))
    with app.app_context():
        StandingWaitingListEntry.query.get(entry_id).expires_at = utcnow_naive() - timedelta(days=2)
        db.session.commit()
    new_end = _today() + timedelta(days=30)
    res = client.patch(f"{URL}/{entry_id}", json={"expiresOn": new_end.isoformat()}, headers=w["h"])
    assert res.status_code == 200, res.get_json()
    assert _entries(app, w["coach_id"])[0][:2] == (True, _end_of(new_end))


def test_renewing_is_bounded_like_adding(app, client):
    w = _seed(app)
    entry_id = _add(client, w, _today() + timedelta(days=5))
    beyond = _today() + relativedelta(months=12) + timedelta(days=1)
    for value in (beyond.isoformat(), (_today() - timedelta(days=1)).isoformat(), None):
        res = client.patch(f"{URL}/{entry_id}", json={"expiresOn": value}, headers=w["h"])
        assert res.status_code == 400 and res.get_json()["fields"] == ["expiresOn"]
    assert _entries(app, w["coach_id"])[0][1] == _end_of(_today() + timedelta(days=5))


def test_only_the_entrys_coach_renews_it(app, client):
    w = _seed(app)
    entry_id = _add(client, w, _today() + timedelta(days=5))
    end = (_today() + timedelta(days=30)).isoformat()
    assert client.patch(f"{URL}/{entry_id}", json={"expiresOn": end}, headers=w["other_h"]).status_code == 404
    assert client.patch(f"{URL}/999999", json={"expiresOn": end}, headers=w["h"]).status_code == 404


# --- B-293: the end bounds the fan-out -----------------------------------------------------------

def _rows(app, instance_id, player_id):
    from padel_app.models.waiting_list_entry import WaitingListEntry

    with app.app_context():
        return [r.is_active for r in WaitingListEntry.query.filter_by(lesson_instance_id=instance_id, player_id=player_id)]


def test_an_entry_is_not_queued_for_classes_after_its_end(app, client):
    w = _seed(app, class_in_days=(3, 10))
    _add(client, w, _today() + timedelta(days=5))
    assert _rows(app, w["instances"][0], w["player_id"]) == [True]
    assert _rows(app, w["instances"][1], w["player_id"]) == []


def test_renewing_reaches_the_classes_the_new_end_covers_and_shortening_leaves_the_rest(app, client):
    w = _seed(app, class_in_days=(3, 10))
    entry_id = _add(client, w, _today() + timedelta(days=5))
    later = (_today() + timedelta(days=15)).isoformat()
    assert client.patch(f"{URL}/{entry_id}", json={"expiresOn": later}, headers=w["h"]).status_code == 200
    assert _rows(app, w["instances"][1], w["player_id"]) == [True]
    sooner = (_today() + timedelta(days=5)).isoformat()
    assert client.patch(f"{URL}/{entry_id}", json={"expiresOn": sooner}, headers=w["h"]).status_code == 200
    assert _rows(app, w["instances"][1], w["player_id"]) == [False]
    assert _rows(app, w["instances"][0], w["player_id"]) == [True]


def test_a_new_class_after_the_end_or_of_an_expired_entry_gets_no_row(app, client):
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.standing_waiting_list_entry import StandingWaitingListEntry
    from padel_app.services.notification_service import _sync_standing_entries_for_new_instance

    w = _seed(app, class_in_days=())
    entry_id = _add(client, w, _today() + timedelta(days=5))
    w2 = _seed_more_instances(app, w, (3, 10))
    with app.app_context():
        for inst_id in w2:
            _sync_standing_entries_for_new_instance(LessonInstance.query.get(inst_id), w["coach_id"])
        db.session.commit()
    assert _rows(app, w2[0], w["player_id"]) == [True]
    assert _rows(app, w2[1], w["player_id"]) == []

    # Expired: nothing more is queued, even for a class inside the old window.
    with app.app_context():
        StandingWaitingListEntry.query.get(entry_id).expires_at = utcnow_naive() - timedelta(hours=1)
        db.session.commit()
    w3 = _seed_more_instances(app, w, (2,))
    with app.app_context():
        _sync_standing_entries_for_new_instance(LessonInstance.query.get(w3[0]), w["coach_id"])
        db.session.commit()
    assert _rows(app, w3[0], w["player_id"]) == []


def _seed_more_instances(app, w, days_list):
    from padel_app.models.Association_CoachLessonInstance import Association_CoachLessonInstance
    from padel_app.models.clubs import Club
    from padel_app.models.lesson_instances import LessonInstance
    from padel_app.models.lessons import Lesson

    ids = []
    with app.app_context():
        club = Club.query.filter_by(name="C507").first()
        for days in days_list:
            start = club_now_naive().replace(hour=11, minute=0, second=0, microsecond=0) + timedelta(days=days)
            lesson = Lesson(title=f"P507 more {days}", start_datetime=start, end_datetime=start + timedelta(hours=1),
                            is_recurring=False, type="academy", max_players=4, color="#000",
                            status="active", club_id=club.id)
            db.session.add(lesson)
            db.session.flush()
            inst = LessonInstance(lesson_id=lesson.id, start_datetime=start, end_datetime=start + timedelta(hours=1),
                                  original_lesson_occurence_date=start.date(), max_players=4,
                                  status="scheduled", notifications_enabled=True)
            db.session.add(inst)
            db.session.flush()
            db.session.add(Association_CoachLessonInstance(coach_id=w["coach_id"], lesson_instance_id=inst.id))
            ids.append(inst.id)
        db.session.commit()
    return ids


# --- E2E helper: backdating needs the debug flag ---------------------------------------------------

def test_backdating_an_entry_is_a_debug_route(app, client):
    w = _seed(app)
    entry_id = _add(client, w, _today() + timedelta(days=5))
    url = f"/api/app/notify/debug/standing_entry_expire/{entry_id}"
    app.config.pop("E2E_DEBUG_ENDPOINTS", None)
    assert client.post(url, json={"daysAgo": 2}, headers=w["h"]).status_code == 404
    app.config["E2E_DEBUG_ENDPOINTS"] = True
    try:
        assert client.post(url, json={"daysAgo": 2}, headers=w["other_h"]).status_code == 404
        res = client.post(url, json={"daysAgo": 2}, headers=w["h"])
        assert res.status_code == 200, res.get_json()
        [(active, expires_at, _)] = _entries(app, w["coach_id"])
        assert active and expires_at < utcnow_naive() - timedelta(days=1)
    finally:
        app.config.pop("E2E_DEBUG_ENDPOINTS", None)
