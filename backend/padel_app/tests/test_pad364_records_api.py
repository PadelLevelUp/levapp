"""evaluations.records over the v2 API (PAD-364): PUT /evaluation_record,
DELETE /evaluation_record/<id>, GET /player/<id>/evaluations.

"Today" is pinned (B-100): every fixture hangs off NOW, never the wall clock.
"""
import datetime as dt

import pytest

from padel_app.sql_db import db
from padel_app.tests.helpers import pin_clock
from padel_app.tests.test_pad362_evaluation_contract import (  # noqa: F401
    _coach_headers,
    _jwt_secret,
    _save,
    _seed,  # Forehand 1-10 and Volley 0-10, both legacy
)

BASE = "/api/app"
NOW = dt.datetime(2026, 9, 21, 10, 0, 0)  # a Monday morning, UTC; 11:00 on the club's clock
TODAY = "2026-09-21"


@pytest.fixture(autouse=True)
def _clock(monkeypatch, app):
    # import the modules that bind utcnow_naive by name before pinning it
    import padel_app.services.evaluation_api_service  # noqa: F401
    import padel_app.services.evaluation_record_service  # noqa: F401

    pin_clock(monkeypatch, NOW)


def _put(app, client, ids, body):
    return client.put(f"{BASE}/evaluation_record", json={"playerId": ids["student_id"], **body},
                      headers=_coach_headers(app, ids))


def _history(app, client, ids):
    res = client.get(f"{BASE}/player/{ids['student_id']}/evaluations", headers=_coach_headers(app, ids))
    assert res.status_code == 200, res.get_data(as_text=True)
    return res.get_json()


def test_put_gets_or_creates_the_days_record_and_answers_it(app, client):
    ids = _seed(app)

    res = _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 7}, "note": "  Late to the ball. "})

    assert res.status_code == 200, res.get_data(as_text=True)
    record = res.get_json()
    assert {k: record[k] for k in ("evaluatedOn", "classInstanceId", "className", "note", "editable", "share")} == {
        "evaluatedOn": TODAY, "classInstanceId": None, "className": None, "note": "Late to the ball.",
        "editable": True, "share": None,
    }
    assert record["ratings"] == [
        {"categoryId": ids["forehand_id"], "name": "Forehand", "key": None, "score": 7, "scaleMin": 1, "scaleMax": 10},
    ]
    again = _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 8}}).get_json()
    assert again["id"] == record["id"] and again["ratings"][0]["score"] == 8  # in place: one row, re-rated


def test_the_record_day_is_the_clubs_day(app, client, monkeypatch):
    ids = _seed(app)
    pin_clock(monkeypatch, dt.datetime(2026, 7, 1, 23, 30))  # 00:30 on 2 July in Lisbon

    assert _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 7}}).get_json()["evaluatedOn"] == "2026-07-02"


@pytest.mark.parametrize("score", [0, 11, 2.5, "7", True, [7]])
def test_a_score_must_be_an_integer_within_the_scale(app, client, score):
    """B-126: this is where the range rule is finally enforced. Forehand is 1-10."""
    from padel_app.models import EvaluationEntry, EvaluationRecord

    ids = _seed(app)

    res = _put(app, client, ids, {"ratings": {str(ids["volley_id"]): 5, str(ids["forehand_id"]): score}})

    assert res.status_code == 400, res.get_data(as_text=True)
    with app.app_context():  # nothing of the body was written — the v2 save is atomic
        assert EvaluationEntry.query.count() == 0 and EvaluationRecord.query.count() == 0


def test_a_whole_number_sent_as_a_float_is_an_integer(app, client):
    ids = _seed(app)

    assert _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 7.0}}).get_json()["ratings"][0]["score"] == 7


def test_malformed_bodies_are_400(app, client):
    ids = _seed(app)
    headers = _coach_headers(app, ids)

    assert client.put(f"{BASE}/evaluation_record", json={"ratings": {}}, headers=headers).status_code == 400  # no playerId
    for body in ({"ratings": [1, 2]}, {"ratings": {"abc": 3}}, {"note": 5}, {"note": "x" * 2001},
                 {"classRef": "lesson"}, {"classRef": {"model": "Club", "id": 1, "date": TODAY}}):
        assert _put(app, client, ids, body).status_code == 400, body


def test_a_new_rating_in_a_switched_off_competency_is_refused_but_an_existing_one_can_change(app, client):
    ids = _seed(app)
    headers = _coach_headers(app, ids)
    assert _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 7}}).status_code == 200
    for cid in (ids["forehand_id"], ids["volley_id"]):
        assert client.patch(f"{BASE}/evaluation_competency/{cid}", json={"isActive": False}, headers=headers).status_code == 200

    assert _put(app, client, ids, {"ratings": {str(ids["volley_id"]): 4}}).status_code == 409
    assert _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 9}}).get_json()["ratings"][0]["score"] == 9


def test_nothing_to_write_creates_no_record(app, client):
    from padel_app.models import EvaluationRecord

    ids = _seed(app)

    res = _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): None}, "note": ""})

    assert res.status_code == 200 and res.get_json() == {"deleted": True}
    with app.app_context():
        assert EvaluationRecord.query.count() == 0


def test_delete_removes_the_record_and_its_ratings_any_day(app, client, monkeypatch):
    from padel_app.models import EvaluationEntry, EvaluationRecord

    ids = _seed(app)
    record_id = _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 7}, "note": "x"}).get_json()["id"]
    pin_clock(monkeypatch, NOW + dt.timedelta(days=3))

    res = client.delete(f"{BASE}/evaluation_record/{record_id}", headers=_coach_headers(app, ids))

    assert res.status_code == 200 and res.get_json() == {"status": "ok"}
    with app.app_context():
        assert EvaluationRecord.query.count() == 0 and EvaluationEntry.query.count() == 0
    assert client.delete(f"{BASE}/evaluation_record/{record_id}", headers=_coach_headers(app, ids)).status_code == 404


def test_a_put_on_a_later_day_never_edits_yesterdays_record(app, client, monkeypatch):
    """Q9: a record is editable on the day it was made. PUT addresses today's
    record only, so tomorrow's PUT makes tomorrow's record and yesterday's stands."""
    ids = _seed(app)
    first = _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 7}}).get_json()
    pin_clock(monkeypatch, NOW + dt.timedelta(days=1))

    second = _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 9}}).get_json()

    assert second["id"] != first["id"] and second["evaluatedOn"] == "2026-09-22"
    records = _history(app, client, ids)["records"]
    assert [(r["evaluatedOn"], r["editable"], r["ratings"][0]["score"]) for r in records] == [
        ("2026-09-22", True, 9), ("2026-09-21", False, 7),
    ]


def test_the_history_lists_records_only_newest_first(app, client, monkeypatch):
    """Q29: record-less entries are served NOWHERE in v2. A same-day superseded
    legacy score stays in the table (data survives) and is simply not read: the
    day's record has one value per competency, and what is averaged is what the
    cards show."""
    from padel_app.tests.evaluation_history import seed_evaluation_history

    ids = _seed(app)
    with app.app_context():  # written around the service: record-less rows, 40 and 10 days ago
        seed_evaluation_history(ids["rel_id"], ids["forehand_id"], [(40, 5), (10, 6)], anchor=NOW)
        db.session.commit()
    pin_clock(monkeypatch, NOW - dt.timedelta(days=3))
    assert _put(app, client, ids, {"ratings": {str(ids["volley_id"]): 3}}).status_code == 200
    pin_clock(monkeypatch, NOW)
    assert _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 7, str(ids["volley_id"]): 0}}).status_code == 200

    body = _history(app, client, ids)

    assert body["lastEvaluatedOn"] == TODAY
    assert sorted(body["competenciesWithData"]) == sorted([ids["forehand_id"], ids["volley_id"]])
    assert [(r["evaluatedOn"], r["editable"], [x["score"] for x in r["ratings"]]) for r in body["records"]] == [
        (TODAY, True, [7, 0]),
        ("2026-09-18", False, [3]),
    ]
    assert all(r["id"] is not None for r in body["records"])


def test_a_competency_with_only_record_less_rows_has_no_data_in_v2(app, client):
    from padel_app.tests.evaluation_history import seed_evaluation_history

    ids = _seed(app)
    with app.app_context():
        seed_evaluation_history(ids["rel_id"], ids["forehand_id"], [(40, 5)], anchor=NOW)
        db.session.commit()

    assert _history(app, client, ids) == {"lastEvaluatedOn": None, "records": [], "competenciesWithData": []}


def test_an_empty_history_has_no_last_evaluation(app, client):
    ids = _seed(app)

    assert _history(app, client, ids) == {"lastEvaluatedOn": None, "records": [], "competenciesWithData": []}


def test_a_legacy_save_shows_up_in_the_history(app, client):
    ids = _seed(app)
    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 7}]).status_code == 200

    (record,) = _history(app, client, ids)["records"]

    assert record["id"] is not None and [x["score"] for x in record["ratings"]] == [7]


def test_latest_is_the_greatest_evaluated_at_then_id(app, client, monkeypatch):
    """One definition of "latest" everywhere in v2, over the rows that sit in a
    record: two records' rows at the same instant → the greater id."""
    from padel_app.models import EvaluationEntry
    from padel_app.services import evaluation_record_service as svc
    from padel_app.services.evaluation_api_service import latest_entries

    ids = _seed(app)
    with app.app_context():
        instant = NOW - dt.timedelta(days=2)
        yesterday = svc.get_or_create_record(ids["rel_id"], day=dt.date(2026, 9, 19))
        earlier = svc.get_or_create_record(ids["rel_id"], day=dt.date(2026, 9, 18))
        first = svc.upsert_rating(earlier, ids["forehand_id"], 3, evaluated_at=instant)
        second = svc.upsert_rating(yesterday, ids["forehand_id"], 9, evaluated_at=instant)
        loose = EvaluationEntry(coach_player_id=ids["rel_id"], category_id=ids["forehand_id"], score=1, evaluated_at=NOW)
        db.session.add(loose)  # later than both, but in no record: not read by v2
        db.session.commit()

        assert latest_entries(ids["rel_id"])[ids["forehand_id"]].id == max(first.id, second.id)


def test_a_form_left_open_across_midnight_is_refused_not_filed_under_a_new_day(app, client, monkeypatch):
    """Rule 11: `recordId` names the record the client has open."""
    from padel_app.models import EvaluationRecord

    ids = _seed(app)
    record_id = _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 7}}).get_json()["id"]
    assert _put(app, client, ids, {"recordId": record_id, "ratings": {str(ids["forehand_id"]): 8}}).status_code == 200
    pin_clock(monkeypatch, NOW + dt.timedelta(days=1))

    res = _put(app, client, ids, {"recordId": record_id, "ratings": {str(ids["forehand_id"]): 9}})

    assert res.status_code == 409 and res.get_json() == {"error": "record_not_editable"}
    with app.app_context():
        assert EvaluationRecord.query.count() == 1
    assert _history(app, client, ids)["records"][0]["ratings"][0]["score"] == 8
    assert _put(app, client, ids, {"recordId": 987654, "ratings": {}}).status_code == 404


def test_a_value_equal_to_the_latest_is_still_a_rating(app, client, monkeypatch):
    """"Still a 4" is a rating: the equal-to-latest skip is the legacy handler's only."""
    ids = _seed(app)
    assert _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 4}}).status_code == 200
    pin_clock(monkeypatch, NOW + dt.timedelta(days=7))

    assert _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 4}}).status_code == 200

    assert [r["ratings"][0]["score"] for r in _history(app, client, ids)["records"]] == [4, 4]


def test_a_same_day_re_rating_moves_the_rows_evaluated_at(app, client, monkeypatch):
    from padel_app.models import EvaluationEntry

    ids = _seed(app)
    pin_clock(monkeypatch, NOW)  # B-100: "same day" means the pinned day, not the real clock's
    assert _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 4}}).status_code == 200
    pin_clock(monkeypatch, NOW + dt.timedelta(hours=3))
    assert _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 5}}).status_code == 200

    with app.app_context():
        (entry,) = EvaluationEntry.query.all()
        assert (entry.score, entry.evaluated_at) == (5.0, NOW + dt.timedelta(hours=3))


def test_a_legacy_save_after_a_v2_re_rating_compares_against_the_v2_value(app, client, monkeypatch):
    """Review N4: PUT moves the row's evaluated_at, so the legacy equal-to-latest
    skip reads the v2 value as the latest — a stale 4 from an old build is written
    as a change, a 5 is skipped."""
    ids = _seed(app)
    # B-100: every timestamp derives from the pinned instant. Unpinned, the first save ran on the
    # real clock and became the LATEST row once the real clock passed NOW+3h (red from 2026-09-22
    # 00:00 UTC, green all day on the 21st).
    pin_clock(monkeypatch, NOW + dt.timedelta(hours=1))
    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 4}]).status_code == 200
    pin_clock(monkeypatch, NOW + dt.timedelta(hours=2))
    assert _put(app, client, ids, {"ratings": {str(ids["forehand_id"]): 5}}).status_code == 200
    pin_clock(monkeypatch, NOW + dt.timedelta(hours=3))

    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 5}]).status_code == 200
    from padel_app.models import EvaluationEntry
    with app.app_context():
        assert [e.score for e in EvaluationEntry.query.order_by(EvaluationEntry.id)] == [5.0]  # equal to latest: skipped

    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 4}]).status_code == 200
    with app.app_context():
        assert sorted(e.score for e in EvaluationEntry.query.all()) == [4.0, 5.0]  # a change: appended
