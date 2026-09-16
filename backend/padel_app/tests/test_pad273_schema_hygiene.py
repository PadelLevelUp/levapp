"""PAD-273 (data-model audit M12, M13) — schema hygiene.

M13: `updated_at` was unreliable three ways. The mixin had no `onupdate`, so a
plain commit never bumped it; `Model.save()` stamped LOCAL time
(`datetime.now()`) into a column everything else fills with UTC; and
`token_blocklist.created_at` defaulted a timezone-aware value into a naive
column.

M12: flag and order columns were nullable with Python-only defaults, so a row
written by raw SQL, an older client or a migration got NULL, and readers that
compare `== True` silently dropped it (the KPI dashboard).
"""
import time
from datetime import datetime

from sqlalchemy import text

from padel_app.sql_db import db
from padel_app.tests.helpers import make_coach


def _seconds_from_utc_now(value):
    return abs((value - datetime.utcnow()).total_seconds())


def test_save_stamps_updated_at_in_utc(app):
    from padel_app.models import CoachLevel

    coach_id = make_coach(app)
    with app.app_context():
        level = CoachLevel(coach_id=coach_id, label="Beginner", code="B1", display_order=1)
        db.session.add(level)
        db.session.commit()
        level.label = "Beginners"
        level.save()
        drift = _seconds_from_utc_now(level.updated_at)
        assert drift < 60, f"updated_at is {drift:.0f}s away from UTC now (local time written?)"


def test_any_commit_bumps_updated_at_not_only_save(app):
    from padel_app.models import CoachLevel

    coach_id = make_coach(app)
    with app.app_context():
        level = CoachLevel(coach_id=coach_id, label="Beginner", code="B1", display_order=1)
        db.session.add(level)
        db.session.commit()
        before = level.updated_at
        time.sleep(0.01)
        level.label = "Renamed by a service"
        db.session.commit()  # not save(): ~34 call sites commit directly
        db.session.refresh(level)
        assert level.updated_at > before


def test_token_blocklist_created_at_is_naive_utc(app):
    from padel_app.models import TokenBlocklist

    with app.app_context():
        row = TokenBlocklist(jti="pad273-jti")
        db.session.add(row)
        db.session.flush()
        assert row.created_at.tzinfo is None
        assert _seconds_from_utc_now(row.created_at) < 60


TARGETS = [
    ("presences", "invited"),
    ("presences", "confirmed"),
    ("presences", "validated"),
    ("lessons", "status"),
    ("coach_levels", "display_order"),
    ("evaluation_entries", "evaluated_at"),
]


def test_flag_and_order_columns_are_not_null_with_database_defaults(app):
    loose = []
    for table, column in TARGETS:
        col = db.metadata.tables[table].c[column]
        if col.nullable or col.server_default is None:
            loose.append(f"{table}.{column} (nullable={col.nullable}, server_default={col.server_default})")
    assert loose == [], f"columns still nullable or without a database default: {loose}"


def test_a_raw_insert_gets_the_database_default(app):
    """A row written without the ORM (raw SQL, an import script) must not end
    up NULL: the default lives in the database, not only in Python."""
    coach_id = make_coach(app)
    with app.app_context():
        db.session.execute(
            text("INSERT INTO coach_levels (coach_id, label, code) VALUES (:c, 'Raw', 'R1')"),
            {"c": coach_id},
        )
        db.session.commit()
        value = db.session.execute(
            text("SELECT display_order FROM coach_levels WHERE code = 'R1'")
        ).scalar()
        assert value == 0


def test_the_migration_is_guarded_never_deletes_and_follows_pad_260():
    import importlib.util
    import pathlib

    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    matches = list(versions.glob("*pad273_schema_hygiene*.py"))
    assert len(matches) == 1, matches
    source = matches[0].read_text()
    code = source.split('"""', 2)[2]  # below the docstring
    assert "DELETE" not in code.upper(), "PAD-273 never deletes data (coordinator decision)"
    for guard in ("_column(", "_has_index(", "has_table", "log.warning"):
        assert guard in code, guard
    spec = importlib.util.spec_from_file_location("pad273_mig", matches[0])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.down_revision == "4ac05ae43639"
    assert {t for t, *_ in module.DEFAULTED} == {"presences", "lessons", "coach_levels", "evaluation_entries"}
    assert len(module.ASSOCIATIONS) == 9
    assert {name for _t, name, _c, _p in module.UNIQUES} == UNIQUE_INDEXES


# ---------------------------------------------------------------------------
# M14 — uniques the domain implies
# ---------------------------------------------------------------------------

# notification_events (vacancy, player, round) is deliberately NOT here: the
# engine can re-invite a player whose earlier invite was declined or expired,
# so that index could fail a live batch (left to the engine's owner).
UNIQUE_INDEXES = {
    "uq_coach_levels_coach_code",
    "uq_evaluation_categories_coach_name",
    "uq_standing_entries_active_coach_player",
}


def test_the_three_domain_uniques_are_declared(app):
    declared = {
        index.name
        for table in db.metadata.tables.values()
        for index in table.indexes
        if index.unique
    }
    assert UNIQUE_INDEXES <= declared, UNIQUE_INDEXES - declared


def test_a_coach_cannot_hold_two_levels_with_the_same_code(app):
    import pytest
    from sqlalchemy.exc import IntegrityError

    from padel_app.models import CoachLevel

    coach_id = make_coach(app)
    with app.app_context():
        db.session.add_all([
            CoachLevel(coach_id=coach_id, label="First", code="X1", display_order=1),
            CoachLevel(coach_id=coach_id, label="Second", code="X1", display_order=2),
        ])
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()


def test_a_coach_cannot_hold_two_categories_with_the_same_name(app):
    import pytest
    from sqlalchemy.exc import IntegrityError

    from padel_app.models import EvaluationCategory

    coach_id = make_coach(app)
    with app.app_context():
        db.session.add_all([
            EvaluationCategory(coach_id=coach_id, name="Serve", scale_min=1, scale_max=10),
            EvaluationCategory(coach_id=coach_id, name="Serve", scale_min=1, scale_max=5),
        ])
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()


def test_only_one_active_standing_entry_per_coach_and_player(app):
    """Inactive history rows may repeat; two ACTIVE ones may not."""
    from datetime import timedelta

    import pytest
    from sqlalchemy.exc import IntegrityError

    from padel_app.models import StandingWaitingListEntry
    from padel_app.tests.test_notification_reminder_flow import _seed_coach_and_student

    ids = _seed_coach_and_student(app)
    with app.app_context():
        def entry(active):
            return StandingWaitingListEntry(
                coach_id=ids["coach_id"], player_id=ids["student_id"], credits_total=3,
                credits_used=0, expires_at=datetime.utcnow() + timedelta(days=30), is_active=active,
            )

        db.session.add_all([entry(False), entry(False), entry(True)])
        db.session.commit()  # repeated inactive rows are fine
        db.session.add(entry(True))
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()
