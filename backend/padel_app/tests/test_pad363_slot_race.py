"""PAD-363 review S2 — a frozen endpoint may not gain a failure mode.

Two legacy saves for the same coach-player, category and club day in flight
together (two devices; a retry after a slow response): both flush their entry,
both read "nobody holds this category's slot in the day's record", both take it —
and the second one hits uq_evaluation_entries_record_category. Before PAD-363 the
same two requests simply appended two rows and both answered 200.

The race is forced, not hoped for: the moment the request under test has read
the slot's holder, a SECOND CONNECTION commits a competing entry that holds it.
That is exactly what the losing request of a real race sees. A legacy save must
never fail because of record bookkeeping: it answers 200, loses no score, and
the loser's row stays record-less — history, which the record API already shows.
"""
import datetime as dt
import os

import pytest
from sqlalchemy import text

from padel_app.sql_db import db
from padel_app.tests.test_pad362_evaluation_contract import (  # noqa: F401
    _jwt_secret,
    _rows,
    _save,
    _seed,
)


# SQLite has one writer: while the request under test holds its write transaction the
# rival connection is locked out ("database is locked"), so this race cannot happen
# there at all. The proof is Postgres-only; the not-racing half runs on both.
racing = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="a second concurrent writer exists only on Postgres",
)


def _race(app, monkeypatch, ids, category_key, score):
    """Make the next slot lookup lose a race to another connection."""
    from padel_app.services import evaluation_record_service as svc

    real_holder = svc._holder
    fired = []

    def holder_then_rival(record, category_id):
        seen = real_holder(record, category_id)
        if not fired and category_id == ids[category_key]:
            fired.append(True)
            with db.engine.begin() as rival:  # another request, its own transaction, committed on exit
                rival.execute(
                    text("INSERT INTO evaluation_entries (coach_player_id, category_id, record_id, score, evaluated_at, "
                         "created_at, updated_at) VALUES (:l, :c, :r, :s, :at, :at, :at)"),
                    {"l": ids["rel_id"], "c": category_id, "r": record.id, "s": score,
                     "at": dt.datetime.utcnow() + dt.timedelta(seconds=1)},
                )
        return seen

    monkeypatch.setattr(svc, "_holder", holder_then_rival)
    return fired


@racing
def test_two_legacy_saves_racing_for_one_slot_both_land(app, client, monkeypatch):
    from padel_app.models import EvaluationEntry, EvaluationRecord

    ids = _seed(app)
    with app.app_context():
        fired = _race(app, monkeypatch, ids, "forehand_id", 8)

        res = _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 6}])

    assert fired, "the rival never ran: the test did not race anything"
    assert res.status_code == 200 and res.get_json() == {"status": "ok", "playerId": ids["student_id"]}
    assert sorted(score for score, _ in _rows(app, ids, "forehand_id")) == [6.0, 8.0]  # no score lost
    with app.app_context():
        (record,) = EvaluationRecord.query.all()
        held = EvaluationEntry.query.filter_by(record_id=record.id).all()
        assert [e.score for e in held] == [8.0]  # the winner holds the slot; the loser is history


def test_the_same_two_saves_one_after_the_other_are_unchanged(app, client):
    """The not-racing half of the 2x2: append, the latest holds the slot."""
    from padel_app.models import EvaluationEntry

    ids = _seed(app)
    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 6}]).status_code == 200
    assert _save(app, client, ids, [{"categoryId": ids["forehand_id"], "value": 8}]).status_code == 200

    with app.app_context():
        rows = EvaluationEntry.query.order_by(EvaluationEntry.id).all()
        assert [(e.score, e.record_id is not None) for e in rows] == [(6.0, False), (8.0, True)]


@racing
def test_an_import_racing_a_save_keeps_every_row(app, monkeypatch):
    from padel_app.models import Coach, EvaluationEntry
    from padel_app.services.import_service import bulk_create_evaluation_entries

    ids = _seed(app)
    with app.app_context():
        fired = _race(app, monkeypatch, ids, "forehand_id", 4)
        today = dt.datetime.utcnow().date().isoformat()

        # 1-5 stars: an import refuses a score outside 1-5 (D111, PAD-403)
        result = bulk_create_evaluation_entries(
            [{"player_name": "Test Student", "date": today, "Forehand": 3}], db.session.get(Coach, ids["coach_id"]))

        assert fired and result["errors"] == [] and result["imported"] == 1
        assert sorted(e.score for e in EvaluationEntry.query.all()) == [3.0, 4.0]


@racing
def test_an_in_place_rating_that_loses_the_race_updates_the_winners_row(app, monkeypatch):
    """The record API's write (a double tap): the loser must not leave a second
    row behind — it re-reads and re-rates the row that won."""
    from padel_app.models import EvaluationEntry
    from padel_app.services import evaluation_record_service as svc

    ids = _seed(app)
    with app.app_context():
        record = svc.get_or_create_record(ids["rel_id"])
        fired = _race(app, monkeypatch, ids, "forehand_id", 2)

        entry = svc.upsert_rating(record, ids["forehand_id"], 4)

        assert fired
        rows = EvaluationEntry.query.filter_by(category_id=ids["forehand_id"]).all()
        assert [(e.score, e.record_id) for e in rows] == [(4.0, record.id)] and entry.id == rows[0].id
