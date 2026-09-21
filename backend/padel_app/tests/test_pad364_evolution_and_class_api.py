"""PAD-364 — evolution (rule R-048: the server is the only place these figures are
computed), the class roster read, classRef on PUT, and authorisation per endpoint.
"""
import datetime as dt
import json

import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_notification_reminder_flow import _seed_instance
from padel_app.tests.test_pad362_evaluation_contract import (  # noqa: F401
    _coach_headers,
    _headers,
    _jwt_secret,
    _other_coach,
    _seed,
)

BASE = "/api/app"
NOW = dt.datetime(2026, 9, 21, 10, 0, 0)


@pytest.fixture(autouse=True)
def _clock(monkeypatch, app):
    import padel_app.services.evaluation_api_service  # noqa: F401
    import padel_app.services.evaluation_record_service  # noqa: F401

    pin_clock(monkeypatch, NOW)


def _rated(ids, category_id, score, when):
    """A rating as the record API files it: in the class-less record of its club day."""
    from padel_app.services import evaluation_record_service as svc

    record = svc.get_or_create_record(ids["rel_id"], day=svc.record_day(when))
    return svc.upsert_rating(record, category_id, score, evaluated_at=when)


def _bandeja(app, ids):
    """João / Bandeja, the canvas's worked example, as rows: monthly means 2.5, 3, 3.5, 4."""
    from padel_app.models import EvaluationCategory, EvaluationEntry

    rows = (
        (2, "2025-11-04"), (3, "2025-11-25"),   # November 2025: 2.5
        (3, "2026-01-13"), (3, "2026-01-27"),   # January 2026: 3.0
        (3, "2026-05-05"), (4, "2026-05-19"),   # May 2026: 3.5
        (4, "2026-09-15"),                      # September 2026: 4.0
    )
    with app.app_context():
        bandeja = EvaluationCategory(coach_id=ids["coach_id"], name="Bandeja", scale_min=1, scale_max=5,
                                     competency_group="technique", catalogue_key="bandeja")
        db.session.add(bandeja)
        db.session.commit()
        for score, day in rows:
            _rated(ids, bandeja.id, score, dt.datetime.fromisoformat(day + "T18:00:00"))
        # a record-less row of the same competency: in the table, read by nothing in v2 (Q28)
        db.session.add(EvaluationEntry(coach_player_id=ids["rel_id"], category_id=bandeja.id, score=1,
                                       evaluated_at=dt.datetime(2026, 9, 10, 9, 0)))
        db.session.commit()
        return bandeja.id


def _evolution(app, client, ids, category_id):
    return client.get(f"{BASE}/player/{ids['student_id']}/evaluations/evolution?categoryId={category_id}",
                      headers=_coach_headers(app, ids))


def test_the_evolution_of_the_canvas_example(app, client):
    ids = _seed(app)
    bandeja = _bandeja(app, ids)

    res = _evolution(app, client, ids, bandeja)

    assert res.status_code == 200, res.get_data(as_text=True)
    assert res.get_json() == {
        "scaleMin": 1, "scaleMax": 5,
        "series": [{"month": "2025-11", "mean": 2.5}, {"month": "2026-01", "mean": 3.0},
                   {"month": "2026-05", "mean": 3.5}, {"month": "2026-09", "mean": 4.0}],
        "means": {"m1": 4.0, "m6": 3.7, "m12": 3.1},   # 4/1 · 11/3 = 3.67 · 22/7 = 3.14
        "delta": {"value": 1.5, "sinceMonth": "2025-11"},
    }


def test_one_month_has_no_delta_and_an_empty_window_no_mean(app, client):
    from padel_app.models import EvaluationEntry

    ids = _seed(app)
    with app.app_context():
        _rated(ids, ids["forehand_id"], 6, dt.datetime(2026, 2, 10, 9, 0))

    body = _evolution(app, client, ids, ids["forehand_id"]).get_json()

    assert body["series"] == [{"month": "2026-02", "mean": 6.0}] and body["delta"] is None
    assert body["means"] == {"m1": None, "m6": None, "m12": 6.0}
    assert _evolution(app, client, ids, ids["volley_id"]).get_json() == {
        "scaleMin": 0, "scaleMax": 10, "series": [], "means": {"m1": None, "m6": None, "m12": None}, "delta": None,
    }


def test_a_month_is_the_clubs_month_and_a_half_rounds_up(app, client):
    from padel_app.models import EvaluationEntry

    ids = _seed(app)
    with app.app_context():
        for score, when in ((2, dt.datetime(2026, 7, 31, 23, 30)),   # 00:30 on 1 August in Lisbon
                            (3, dt.datetime(2026, 8, 10, 9, 0)), (2, dt.datetime(2026, 8, 11, 9, 0)),
                            (2, dt.datetime(2026, 8, 12, 9, 0))):
            _rated(ids, ids["forehand_id"], score, when)

    body = _evolution(app, client, ids, ids["forehand_id"]).get_json()

    assert body["series"] == [{"month": "2026-08", "mean": 2.3}]  # 9/4 = 2.25 → 2.3, never banker's 2.2


def test_evolution_needs_a_category_of_the_coachs_own(app, client):
    ids = _seed(app)
    other = _other_coach(app)

    assert _evolution(app, client, ids, other["category_id"]).status_code == 403
    assert _evolution(app, client, ids, "abc").status_code == 400
    assert client.get(f"{BASE}/player/{ids['student_id']}/evaluations/evolution",
                      headers=_coach_headers(app, ids)).status_code == 400


# ── the class ───────────────────────────────────────────────────────────────


def _class(app, client, ids, query):
    return client.post(f"{BASE}/class_instance/evaluations?{query}", headers=_coach_headers(app, ids))


def test_the_class_roster_lists_participants_absent_last_with_their_most_recent_record(app, client, monkeypatch):
    from padel_app.models.presences import Presence

    ids = _seed(app)
    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"])
    put = client.put(f"{BASE}/evaluation_record", headers=_coach_headers(app, ids), json={
        "playerId": ids["student_id"], "classRef": {"model": "LessonInstance", "id": instance_id, "date": "2026-09-23"},
        "ratings": {str(ids["forehand_id"]): 8},
    })
    assert put.status_code == 200, put.get_data(as_text=True)
    assert put.get_json()["classInstanceId"] == instance_id and put.get_json()["className"]

    body = _class(app, client, ids, f"model=LessonInstance&id={instance_id}").get_json()

    assert body["classInstanceId"] == instance_id
    assert [c["name"] for c in body["competencies"]] == ["Forehand", "Volley"]
    (participant,) = body["participants"]
    assert {k: participant[k] for k in ("playerId", "coachPlayerId", "name", "absent", "due")} == {
        "playerId": ids["student_id"], "coachPlayerId": ids["rel_id"], "name": "Test Student", "absent": False, "due": False,
    }
    assert participant["record"]["id"] == put.get_json()["id"]

    # Q29: the next day the coach opens the same class — the record made in it is still there, read-only
    pin_clock(monkeypatch, NOW + dt.timedelta(days=1))
    later = _class(app, client, ids, f"model=LessonInstance&id={instance_id}").get_json()["participants"][0]["record"]
    assert (later["id"], later["evaluatedOn"], later["editable"]) == (put.get_json()["id"], "2026-09-21", False)
    # ... and the first tap that day starts that day's record for the same occurrence, which the next read returns
    second = client.put(f"{BASE}/evaluation_record", headers=_coach_headers(app, ids), json={
        "playerId": ids["student_id"], "classRef": {"model": "LessonInstance", "id": instance_id},
        "ratings": {str(ids["forehand_id"]): 9}}).get_json()
    latest = _class(app, client, ids, f"model=LessonInstance&id={instance_id}").get_json()["participants"][0]["record"]
    assert second["id"] != put.get_json()["id"] and (latest["id"], latest["editable"]) == (second["id"], True)

    with app.app_context():
        Presence.query.filter_by(lesson_instance_id=instance_id, player_id=ids["student_id"]).update({"status": "absent"})
        db.session.commit()
    assert _class(app, client, ids, f"model=LessonInstance&id={instance_id}").get_json()["participants"][0]["absent"] is True


def test_a_class_less_record_and_a_class_record_of_one_day_are_two_records(app, client):
    from padel_app.models import EvaluationRecord

    ids = _seed(app)
    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"])
    headers = _coach_headers(app, ids)
    loose = client.put(f"{BASE}/evaluation_record", headers=headers, json={
        "playerId": ids["student_id"], "ratings": {str(ids["forehand_id"]): 5}}).get_json()
    in_class = client.put(f"{BASE}/evaluation_record", headers=headers, json={
        "playerId": ids["student_id"], "classRef": {"model": "LessonInstance", "id": instance_id, "date": None},
        "ratings": {str(ids["forehand_id"]): 8}}).get_json()

    assert loose["id"] != in_class["id"]
    with app.app_context():
        assert EvaluationRecord.query.count() == 2


def _recurring_lesson(app, ids, start):
    from padel_app.models import Lesson
    from padel_app.models.Association_CoachLesson import Association_CoachLesson
    from padel_app.models.Association_PlayerLesson import Association_PlayerLesson
    from padel_app.models.clubs import Club

    with app.app_context():
        club = Club(name="Recurring Club", description="", location="Lisbon")
        db.session.add(club)
        db.session.flush()
        lesson = Lesson(title="Monday group", type="academy", max_players=4, club_id=club.id, is_recurring=True,
                        recurrence_rule=json.dumps({"frequency": "weekly", "daysOfWeek": [(start.weekday() + 1) % 7]}),
                        recurrence_end=(start + dt.timedelta(weeks=12)).date(),
                        start_datetime=start, end_datetime=start + dt.timedelta(hours=1))
        db.session.add(lesson)
        db.session.flush()
        db.session.add_all([
            Association_CoachLesson(coach_id=ids["coach_id"], lesson_id=lesson.id),
            Association_PlayerLesson(player_id=ids["student_id"], lesson_id=lesson.id),
        ])
        db.session.commit()
        return lesson.id


def test_the_class_read_never_materialises_an_occurrence(app, client):
    from padel_app.models import LessonInstance

    ids = _seed(app)
    lesson_id = _recurring_lesson(app, ids, dt.datetime(2026, 9, 7, 18, 0))

    body = _class(app, client, ids, f"model=Lesson&id={lesson_id}&date=2026-09-14").get_json()

    assert body["classInstanceId"] is None
    assert [(p["playerId"], p["absent"], p["record"]) for p in body["participants"]] == [(ids["student_id"], False, None)]
    with app.app_context():
        assert LessonInstance.query.count() == 0


def test_rating_in_a_past_unmaterialised_class_is_409_and_enrols_nobody(app, client):
    """Slice 1 read `get_or_materialize_instance`: for a past date it still creates
    the instance, enrols the whole roster as unmarked presences and fans the
    standing waiting list out. Rating a player must never do that by accident."""
    from padel_app.models import LessonInstance
    from padel_app.models.presences import Presence

    ids = _seed(app)
    lesson_id = _recurring_lesson(app, ids, dt.datetime(2026, 9, 7, 18, 0))

    res = client.put(f"{BASE}/evaluation_record", headers=_coach_headers(app, ids), json={
        "playerId": ids["student_id"], "classRef": {"model": "Lesson", "id": lesson_id, "date": "2026-09-14"},
        "ratings": {str(ids["forehand_id"]): 8},
    })

    assert res.status_code == 409 and res.get_json()["error"] == "class_not_materialised"
    with app.app_context():
        assert LessonInstance.query.count() == 0 and Presence.query.count() == 0


def test_rating_in_todays_unmaterialised_class_materialises_it_once(app, client):
    from padel_app.models import LessonInstance

    ids = _seed(app)
    lesson_id = _recurring_lesson(app, ids, dt.datetime(2026, 9, 7, 18, 0))
    body = {"playerId": ids["student_id"], "classRef": {"model": "Lesson", "id": lesson_id, "date": "2026-09-21"},
            "ratings": {str(ids["forehand_id"]): 8}}

    first = client.put(f"{BASE}/evaluation_record", headers=_coach_headers(app, ids), json=body)
    second = client.put(f"{BASE}/evaluation_record", headers=_coach_headers(app, ids), json=body)

    assert first.status_code == 200, first.get_data(as_text=True)
    assert first.get_json()["id"] == second.get_json()["id"] and first.get_json()["classInstanceId"] is not None
    with app.app_context():
        assert LessonInstance.query.count() == 1


# ── authorisation, per endpoint ─────────────────────────────────────────────


def _student_headers(app, ids):
    return _headers(app, ids["student_user_id"])


def test_a_student_is_refused_everywhere(app, client):
    ids = _seed(app)
    h = _student_headers(app, ids)
    calls = [
        ("get", "/evaluation_competencies", None), ("post", "/evaluation_competency", {"name": "X"}),
        ("patch", f"/evaluation_competency/{ids['forehand_id']}", {"isActive": False}),
        ("get", f"/evaluation_competency/{ids['forehand_id']}/impact", None),
        ("delete", f"/evaluation_competency/{ids['forehand_id']}", None),
        ("get", f"/player/{ids['student_id']}/evaluations", None),
        ("get", f"/player/{ids['student_id']}/evaluations/evolution?categoryId={ids['forehand_id']}", None),
        ("put", "/evaluation_record", {"playerId": ids["student_id"], "ratings": {}}),
        ("delete", "/evaluation_record/1", None),
        ("post", "/class_instance/evaluations?model=LessonInstance&id=1", None),
    ]
    for method, path, body in calls:
        res = getattr(client, method)(BASE + path, headers=h, **({"json": body} if body is not None else {}))
        assert res.status_code == 403, (method, path, res.status_code)


def test_another_coachs_player_competency_and_record_are_403_and_untouched(app, client):
    from padel_app.models import EvaluationCategory, EvaluationRecord

    ids = _seed(app)
    other = _other_coach(app)
    mine = _coach_headers(app, ids)
    record_id = client.put(f"{BASE}/evaluation_record", headers=mine, json={
        "playerId": ids["student_id"], "ratings": {str(ids["forehand_id"]): 7}}).get_json()["id"]
    theirs = _headers(app, other["user_id"])  # the other coach does not have this student

    # a player who is not on the caller's roster is 404, as the legacy endpoints answer (records rule 8)
    for method, path, body in [
        ("get", f"/player/{ids['student_id']}/evaluations", None),
        ("get", f"/player/{ids['student_id']}/evaluations/evolution?categoryId={other['category_id']}", None),
        ("put", "/evaluation_record", {"playerId": ids["student_id"], "ratings": {str(other["category_id"]): 3}}),
    ]:
        res = getattr(client, method)(BASE + path, headers=theirs, **({"json": body} if body is not None else {}))
        assert res.status_code == 404, (method, path, res.status_code)

    for method, path, body in [
        ("delete", f"/evaluation_record/{record_id}", None),
        ("patch", f"/evaluation_competency/{ids['forehand_id']}", {"isActive": False}),
        ("get", f"/evaluation_competency/{ids['forehand_id']}/impact", None),
        ("delete", f"/evaluation_competency/{ids['forehand_id']}", None),
    ]:
        res = getattr(client, method)(BASE + path, headers=theirs, **({"json": body} if body is not None else {}))
        assert res.status_code == 403, (method, path, res.status_code)

    # my own player, their category: refused, nothing written (B-145's rule, on the v2 write path too)
    res = client.put(f"{BASE}/evaluation_record", headers=mine, json={
        "playerId": ids["student_id"], "ratings": {str(other["category_id"]): 3}})
    assert res.status_code == 403
    with app.app_context():
        assert db.session.get(EvaluationCategory, ids["forehand_id"]).is_active is True
        assert EvaluationRecord.query.count() == 1
