"""evaluations.records (PAD-363) — the one writer of evaluation scores.

An evaluation is a record: one coach-player, one club-local day, an optional
class, a private note, and at most one rating per category. Everything that
writes a score goes through `evaluation_record_service`.
"""
import datetime as dt

import pytest

from padel_app.sql_db import db
from padel_app.tests.test_notification_reminder_flow import _seed_coach_and_student, _seed_instance


def _seed(app):
    from padel_app.models import Association_CoachPlayer, EvaluationCategory

    ids = _seed_coach_and_student(app)
    with app.app_context():
        rel = Association_CoachPlayer(coach_id=ids["coach_id"], player_id=ids["student_id"])
        forehand = EvaluationCategory(coach_id=ids["coach_id"], name="Forehand", scale_min=1, scale_max=10)
        volley = EvaluationCategory(coach_id=ids["coach_id"], name="Volley", scale_min=1, scale_max=10)
        db.session.add_all([rel, forehand, volley])
        db.session.commit()
        ids.update(rel_id=rel.id, forehand_id=forehand.id, volley_id=volley.id)
    return ids


JULY_1 = dt.date(2026, 7, 1)


def test_the_day_is_read_off_the_clubs_clock():
    from padel_app.services.evaluation_record_service import record_day

    assert record_day(dt.datetime(2026, 7, 1, 22, 59)) == dt.date(2026, 7, 1)
    # 23:30 UTC in summer is 00:30 the next day in Lisbon
    assert record_day(dt.datetime(2026, 7, 1, 23, 30)) == dt.date(2026, 7, 2)
    # in winter Lisbon is on UTC
    assert record_day(dt.datetime(2026, 1, 10, 23, 30)) == dt.date(2026, 1, 10)
    # an aware instant (the import accepts ISO strings with an offset) is the same instant
    aware = dt.datetime(2026, 7, 2, 1, 30, tzinfo=dt.timezone(dt.timedelta(hours=2)))
    assert record_day(aware) == dt.date(2026, 7, 2)


def test_one_record_per_coach_player_and_day_and_one_more_per_class(app):
    from padel_app.models import EvaluationRecord
    from padel_app.services import evaluation_record_service as svc

    ids = _seed(app)
    instance_id = _seed_instance(app, ids["coach_id"], ids["student_id"])  # a dated class occurrence
    with app.app_context():
        first = svc.get_or_create_record(ids["rel_id"], day=JULY_1)
        again = svc.get_or_create_record(ids["rel_id"], day=JULY_1)
        next_day = svc.get_or_create_record(ids["rel_id"], day=dt.date(2026, 7, 2))
        in_class = svc.get_or_create_record(ids["rel_id"], day=JULY_1, lesson_instance_id=instance_id)
        in_class_again = svc.get_or_create_record(ids["rel_id"], day=JULY_1, lesson_instance_id=instance_id)

        assert first.id == again.id
        assert len({first.id, next_day.id, in_class.id}) == 3
        assert in_class.id == in_class_again.id
        assert (first.evaluated_on, first.lesson_instance_id, first.note) == (JULY_1, None, None)
        assert EvaluationRecord.query.count() == 3


def test_a_rating_is_upserted_in_place(app):
    from padel_app.models import EvaluationEntry
    from padel_app.services import evaluation_record_service as svc

    ids = _seed(app)
    with app.app_context():
        record = svc.get_or_create_record(ids["rel_id"], day=JULY_1)
        entry = svc.upsert_rating(record, ids["forehand_id"], 3)
        same = svc.upsert_rating(record, ids["forehand_id"], 4)
        svc.upsert_rating(record, ids["volley_id"], 2)

        assert same.id == entry.id and same.score == 4.0
        assert (entry.record_id, entry.coach_player_id, entry.category_id) == (record.id, ids["rel_id"], ids["forehand_id"])
        assert EvaluationEntry.query.count() == 2


def test_an_appended_rating_keeps_the_history_and_takes_the_records_slot(app):
    """The legacy save and the import append: every score they write stays a row
    of its own, and the day's record holds the latest one per category."""
    from padel_app.models import EvaluationEntry
    from padel_app.services import evaluation_record_service as svc

    ids = _seed(app)
    with app.app_context():
        record = svc.get_or_create_record(ids["rel_id"], day=JULY_1)
        morning = svc.upsert_rating(record, ids["forehand_id"], 5, evaluated_at=dt.datetime(2026, 7, 1, 9, 0), append=True)
        evening = svc.upsert_rating(record, ids["forehand_id"], 7, evaluated_at=dt.datetime(2026, 7, 1, 18, 0), append=True)
        noon = svc.upsert_rating(record, ids["forehand_id"], 6, evaluated_at=dt.datetime(2026, 7, 1, 12, 0), append=True)

        rows = EvaluationEntry.query.order_by(EvaluationEntry.evaluated_at).all()
        assert [(r.score, r.record_id) for r in rows] == [(5.0, None), (6.0, None), (7.0, record.id)]
        assert {morning.id, evening.id, noon.id} == {r.id for r in rows}
        assert morning.evaluated_at == dt.datetime(2026, 7, 1, 9, 0)  # the earlier row was not re-dated


def test_a_rating_can_be_cleared_and_an_empty_record_deleted(app):
    from padel_app.models import EvaluationEntry, EvaluationRecord
    from padel_app.services import evaluation_record_service as svc

    ids = _seed(app)
    with app.app_context():
        record = svc.get_or_create_record(ids["rel_id"], day=JULY_1)
        svc.upsert_rating(record, ids["forehand_id"], 3)
        assert svc.delete_record_if_empty(record) is False  # it holds a rating

        assert svc.clear_rating(record, ids["forehand_id"]) is True
        assert svc.clear_rating(record, ids["forehand_id"]) is False  # nothing left to clear
        assert EvaluationEntry.query.count() == 0

        svc.set_note(record, "  Works hard on the backhand side.  ")
        assert record.note == "Works hard on the backhand side."
        assert svc.delete_record_if_empty(record) is False  # it holds a note

        svc.set_note(record, "   ")
        assert record.note is None
        assert svc.delete_record_if_empty(record) is True
        assert EvaluationRecord.query.count() == 0


def test_a_rating_in_another_coachs_category_is_refused(app):
    from padel_app.models import Coach, EvaluationCategory, EvaluationEntry, User
    from padel_app.services import evaluation_record_service as svc

    ids = _seed(app)
    with app.app_context():
        other_user = User(name="Other", username="other-coach", email="other@test.com", password="x", status="active")
        db.session.add(other_user)
        db.session.flush()
        other = Coach(user_id=other_user.id)
        db.session.add(other)
        db.session.flush()
        foreign = EvaluationCategory(coach_id=other.id, name="Forehand", scale_min=1, scale_max=10)
        db.session.add(foreign)
        db.session.commit()

        record = svc.get_or_create_record(ids["rel_id"], day=JULY_1)
        with pytest.raises(ValueError):
            svc.upsert_rating(record, foreign.id, 3)
        assert EvaluationEntry.query.count() == 0


def test_deleting_a_record_takes_its_ratings_and_leaves_the_record_less_history(app):
    from padel_app.models import EvaluationEntry
    from padel_app.services import evaluation_record_service as svc

    ids = _seed(app)
    with app.app_context():
        record = svc.get_or_create_record(ids["rel_id"], day=JULY_1)
        svc.upsert_rating(record, ids["forehand_id"], 5, evaluated_at=dt.datetime(2026, 7, 1, 9, 0), append=True)
        svc.upsert_rating(record, ids["forehand_id"], 7, evaluated_at=dt.datetime(2026, 7, 1, 18, 0), append=True)
        db.session.delete(record)
        db.session.commit()
        assert [(r.score, r.record_id) for r in EvaluationEntry.query.all()] == [(5.0, None)]


def test_the_import_groups_its_rows_into_records_by_player_and_date(app):
    """evaluations.bulk-import: imported scores are written through the record
    service, one class-less record per (player, date)."""
    from padel_app.models import Coach, EvaluationEntry, EvaluationRecord
    from padel_app.services.import_service import bulk_create_evaluation_entries

    ids = _seed(app)
    with app.app_context():
        coach = Coach.query.get(ids["coach_id"])
        result = bulk_create_evaluation_entries(
            [
                {"player_name": "Test Student", "date": "2026-03-05", "Forehand": 6, "Volley": "7.5"},
                {"player_name": "Test Student", "date": "2026-03-05", "Forehand": 8},
                {"player_name": "Test Student", "date": "2026-04-02", "Forehand": 9},
            ],
            coach,
        )
        assert result["imported"] == 3 and result["errors"] == []
        assert len(result["created_ids"]["evaluation_entries"]) == 4

        records = EvaluationRecord.query.order_by(EvaluationRecord.evaluated_on).all()
        assert [(r.coach_player_id, r.evaluated_on, r.lesson_instance_id) for r in records] == [
            (ids["rel_id"], dt.date(2026, 3, 5), None),
            (ids["rel_id"], dt.date(2026, 4, 2), None),
        ]
        march = {(e.category_id, e.score): e.record_id for e in EvaluationEntry.query.all() if e.evaluated_at.month == 3}
        # two Forehand rows on one imported date: both kept, the later-written one holds the slot
        assert march == {
            (ids["forehand_id"], 6.0): None,
            (ids["forehand_id"], 8.0): records[0].id,
            (ids["volley_id"], 7.5): records[0].id,
        }
        assert all(e.evaluated_at == dt.datetime(2026, 3, 5) for e in EvaluationEntry.query.all() if e.evaluated_at.month == 3)
