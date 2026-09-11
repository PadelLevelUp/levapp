"""PAD-303 / B-046 — the occurrence key and the open vacancy are unique in the
database (classes.instances rule 9, notifications.invitations rule 13).

Two layers, like test_pad263:
* the MODEL declares both unique indexes (the pytest schema is built with
  ``create_all``), so a duplicate occurrence or a duplicate open vacancy is
  refused on both backends while NULL dates, expired rows and structural
  vacancies are not covered;
* the MIGRATION is walked for real on Postgres (test_pad279's pattern): it
  refuses with the offending group while a duplicate exists, applies once the
  duplicate is gone, re-applies as a no-op, downgrades to the PAD-263 state and
  comes back. Plus a scratch-SQLite idempotency walk that runs on both backends.
"""
import importlib.util
import os
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from padel_app.sql_db import db

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
PARENT = "fed5ed4916a8"  # PAD-259 (batch 5)
OCCURRENCE_UNIQUE = "uq_lesson_instance_occurrence"
OLD_PLAIN_INDEX = "ix_lesson_instances_lesson_id_occurrence_date"
OPEN_VACANCY_UNIQUE = "uq_vacancies_open_original_player"
OPEN_VACANCY_WHERE = "status = 'open' AND original_player_id IS NOT NULL"

postgres_only = pytest.mark.skipif(
    os.getenv("LEVAPP_TEST_DB", "sqlite").strip().lower() != "postgres",
    reason="walks the real Alembic revision; Postgres backend only",
)


def _load_migration():
    (path,) = (MIGRATIONS_DIR / "versions").glob("*pad303_unique_occurrence*.py")
    spec = importlib.util.spec_from_file_location("pad303_migration", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _reflected(engine, table):
    return {i["name"]: i for i in sa.inspect(engine).get_indexes(table)}


# ── seed helpers (one coach, one club, one lesson, two players) ──────────────

def _world():
    from padel_app.models import Club, Coach, Lesson, Player, User

    coach_user = User(name="C", username="p303c", email="p303c@t.test", password="x", status="active")
    student_a = User(name="A", username="p303a", email="p303a@t.test", password="x", status="active")
    student_b = User(name="B", username="p303b", email="p303b@t.test", password="x", status="active")
    db.session.add_all([coach_user, student_a, student_b])
    db.session.flush()
    coach = Coach(user_id=coach_user.id)
    club = Club(name="P303", description="", location="X")
    pa, pb = Player(user_id=student_a.id), Player(user_id=student_b.id)
    db.session.add_all([coach, club, pa, pb])
    db.session.flush()
    start = datetime(2027, 9, 10, 10, 0)
    lesson = Lesson(title="P303", type="academy", status="active", start_datetime=start,
                    end_datetime=start + timedelta(hours=1), max_players=4, color="#000", club_id=club.id)
    db.session.add(lesson)
    db.session.commit()
    return {"coach_id": coach.id, "lesson_id": lesson.id, "player_a": pa.id, "player_b": pb.id, "start": start}


def _instance(w, occurrence, **extra):
    from padel_app.models import LessonInstance

    inst = LessonInstance(lesson_id=w["lesson_id"], original_lesson_occurence_date=occurrence,
                          start_datetime=w["start"], end_datetime=w["start"] + timedelta(hours=1),
                          max_players=4, status="scheduled", **extra)
    db.session.add(inst)
    db.session.flush()
    return inst


def _vacancy(w, instance_id, player_id, status="open"):
    from padel_app.models import Vacancy

    v = Vacancy(lesson_instance_id=instance_id, coach_id=w["coach_id"], original_player_id=player_id,
                status=status, approval_status="not_required")
    db.session.add(v)
    db.session.flush()
    return v


# ── the model: both uniques declared and enforced on both backends ───────────

def test_the_models_declare_the_two_unique_indexes(app):
    li = db.metadata.tables["lesson_instances"]
    occ = next(i for i in li.indexes if i.name == OCCURRENCE_UNIQUE)
    assert occ.unique and [c.name for c in occ.columns] == ["lesson_id", "original_lesson_occurence_date"]
    assert not any(i.name == OLD_PLAIN_INDEX for i in li.indexes), "the unique index supersedes PAD-263's plain one"

    vac = db.metadata.tables["vacancies"]
    open_uq = next(i for i in vac.indexes if i.name == OPEN_VACANCY_UNIQUE)
    assert open_uq.unique and [c.name for c in open_uq.columns] == ["lesson_instance_id", "original_player_id"]
    for dialect in ("postgresql", "sqlite"):
        assert str(open_uq.dialect_options[dialect]["where"]) == OPEN_VACANCY_WHERE

    with app.app_context():
        reflected = _reflected(db.engine, "lesson_instances")
        assert reflected[OCCURRENCE_UNIQUE]["unique"]
        assert OLD_PLAIN_INDEX not in reflected
        assert _reflected(db.engine, "vacancies")[OPEN_VACANCY_UNIQUE]["unique"]


def test_a_second_instance_for_the_same_occurrence_is_refused_but_null_dates_are_not_covered(app):
    with app.app_context():
        w = _world()
        _instance(w, date(2027, 9, 10))
        db.session.commit()
        with pytest.raises(IntegrityError):
            _instance(w, date(2027, 9, 10))
            db.session.commit()
        db.session.rollback()
        # Legacy rows without an occurrence date: NULLs never collide.
        _instance(w, None)
        _instance(w, None)
        db.session.commit()


def test_a_second_open_vacancy_for_the_same_departing_player_is_refused_but_closed_and_structural_ones_are_not(app):
    with app.app_context():
        w = _world()
        inst = _instance(w, date(2027, 9, 10))
        _vacancy(w, inst.id, w["player_a"])
        db.session.commit()
        with pytest.raises(IntegrityError):
            _vacancy(w, inst.id, w["player_a"])
            db.session.commit()
        db.session.rollback()
        # An expired one next to the open one, and two structural vacancies, are fine.
        _vacancy(w, inst.id, w["player_a"], status="expired")
        _vacancy(w, inst.id, None)
        _vacancy(w, inst.id, None)
        # A different departing player on the same occurrence is fine too.
        _vacancy(w, inst.id, w["player_b"])
        db.session.commit()


# ── the migration, walked for real on Postgres ───────────────────────────────

def _release():
    db.session.commit()
    db.session.remove()


@postgres_only
def test_the_migration_refuses_on_duplicates_then_applies_reapplies_downgrades_and_returns(app):
    from flask_migrate import downgrade, upgrade

    migration = _load_migration()
    with app.app_context():
        try:
            _release()
            downgrade(directory=str(MIGRATIONS_DIR), revision=PARENT)
            assert OLD_PLAIN_INDEX in _reflected(db.engine, "lesson_instances")
            assert OCCURRENCE_UNIQUE not in _reflected(db.engine, "lesson_instances")

            w = _world()
            first = _instance(w, date(2027, 9, 10))
            second = _instance(w, date(2027, 9, 10))  # the duplicate the parent schema allows
            first_id, second_id = first.id, second.id
            inst_ids = sorted([first_id, second_id])
            v1_id = _vacancy(w, first_id, w["player_a"]).id
            v2_id = _vacancy(w, first_id, w["player_a"]).id  # duplicate open vacancy
            _vacancy(w, first_id, w["player_a"], status="expired")  # not a duplicate: not open
            _release()  # instances are detached from here on: use the captured ids

            # Refuses, names both groups, creates nothing. The revision is run
            # directly here so the RuntimeError arrives unwrapped (flask_migrate
            # would turn it into SystemExit(1) after logging it, and Alembic's
            # fileConfig swaps the log handlers under caplog).
            with pytest.raises(RuntimeError) as excinfo:
                with db.engine.begin() as connection:
                    with Operations.context(MigrationContext.configure(connection)):
                        migration.upgrade()
            message = str(excinfo.value)
            assert "PAD-303" in message
            assert f"lesson_id={w['lesson_id']}" in message and "2027-09-10" in message
            assert all(str(i) in message for i in inst_ids)
            assert f"lesson_instance_id={first_id}" in message and f"original_player_id={w['player_a']}" in message
            _release()
            assert OCCURRENCE_UNIQUE not in _reflected(db.engine, "lesson_instances")
            assert OPEN_VACANCY_UNIQUE not in _reflected(db.engine, "vacancies")

            # Remove the duplicates (the B-046 merge, here by hand) and apply.
            db.session.execute(text("DELETE FROM vacancies WHERE id = :id"), {"id": v2_id})
            db.session.execute(text("DELETE FROM lesson_instances WHERE id = :id"), {"id": second_id})
            _release()
            upgrade(directory=str(MIGRATIONS_DIR))
            li = _reflected(db.engine, "lesson_instances")
            assert li[OCCURRENCE_UNIQUE]["unique"]
            assert li[OCCURRENCE_UNIQUE]["column_names"] == ["lesson_id", "original_lesson_occurence_date"]
            assert OLD_PLAIN_INDEX not in li
            vac = _reflected(db.engine, "vacancies")
            assert vac[OPEN_VACANCY_UNIQUE]["unique"]
            assert vac[OPEN_VACANCY_UNIQUE]["column_names"] == ["lesson_instance_id", "original_player_id"]
            assert "open" in (vac[OPEN_VACANCY_UNIQUE].get("dialect_options", {}).get("postgresql_where") or "")

            # Live: the surviving open vacancy blocks a second open one, the expired one did not.
            with pytest.raises(IntegrityError):
                db.session.execute(text(
                    "INSERT INTO vacancies (lesson_instance_id, coach_id, original_player_id, status, approval_status, current_round_number, current_batch_number) "
                    "VALUES (:i, :c, :p, 'open', 'not_required', 1, 0)"), {"i": first_id, "c": w["coach_id"], "p": w["player_a"]})
            db.session.rollback()
            assert db.session.execute(text("SELECT count(*) FROM vacancies WHERE id = :id"), {"id": v1_id}).scalar() == 1  # the survivor

            # Second upgrade: a no-op.
            _release()
            upgrade(directory=str(MIGRATIONS_DIR))
            assert OCCURRENCE_UNIQUE in _reflected(db.engine, "lesson_instances")

            # Downgrade restores PAD-263's plain index and removes both uniques; upgrade brings them back.
            _release()
            downgrade(directory=str(MIGRATIONS_DIR), revision=PARENT)
            li = _reflected(db.engine, "lesson_instances")
            assert OLD_PLAIN_INDEX in li and OCCURRENCE_UNIQUE not in li
            assert OPEN_VACANCY_UNIQUE not in _reflected(db.engine, "vacancies")
            _release()
            upgrade(directory=str(MIGRATIONS_DIR))
            assert OCCURRENCE_UNIQUE in _reflected(db.engine, "lesson_instances")
            assert OPEN_VACANCY_UNIQUE in _reflected(db.engine, "vacancies")
        finally:
            _release()
            upgrade(directory=str(MIGRATIONS_DIR))  # leave the shared scratch DB at head


# ── the migration module on a scratch SQLite: guards and idempotency ─────────

def _run(engine, step):
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            step()


@pytest.mark.parametrize("already_there", [(), (OCCURRENCE_UNIQUE,), (OPEN_VACANCY_UNIQUE,)])
def test_upgrade_and_downgrade_are_guarded_and_idempotent(app, tmp_path, already_there):
    """Staging is a prod copy (PAD-200) and has carried indexes no revision created
    (PAD-204's crash-loop): every create and drop is guarded, so the revision
    applies over a schema that already has part of it, and either direction
    re-runs as a no-op."""
    migration = _load_migration()
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'pad303.db'}")
    with app.app_context():
        db.metadata.create_all(engine)
    # The schema as PAD-263 left it, except whatever prod already has.
    with engine.begin() as connection:
        for name in (OCCURRENCE_UNIQUE, OPEN_VACANCY_UNIQUE):
            if name not in already_there:
                connection.execute(sa.text(f"DROP INDEX {name}"))
        if OCCURRENCE_UNIQUE not in already_there:
            connection.execute(sa.text(
                f"CREATE INDEX {OLD_PLAIN_INDEX} ON lesson_instances (lesson_id, original_lesson_occurence_date)"))

    _run(engine, migration.upgrade)
    _run(engine, migration.upgrade)
    li = _reflected(engine, "lesson_instances")
    assert li[OCCURRENCE_UNIQUE]["unique"] and OLD_PLAIN_INDEX not in li
    assert _reflected(engine, "vacancies")[OPEN_VACANCY_UNIQUE]["unique"]

    _run(engine, migration.downgrade)
    _run(engine, migration.downgrade)
    li = _reflected(engine, "lesson_instances")
    assert OCCURRENCE_UNIQUE not in li and OLD_PLAIN_INDEX in li
    assert OPEN_VACANCY_UNIQUE not in _reflected(engine, "vacancies")
