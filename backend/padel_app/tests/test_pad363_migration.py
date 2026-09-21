"""PAD-363 migration 21c864b3dd59 — competency columns, evaluation_records and
evaluation_entries.record_id, every DDL guarded both ways, and the backfill
(evaluations.records): each existing entry gets the class-less record of its
(coach-player, club-local day); where one day holds several rows of one category
the latest joins the record and the earlier ones stay record-less. The only
column written on an existing row is `record_id`.

Scratch SQLite with hand-made tables, the way test_pad357 proves its migration.
The real-Alembic walk on Postgres is test_pad363_migration_postgres.py.
"""
import datetime as dt
import importlib.util
import pathlib

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("*pad363_evaluation_records*.py")
    spec = importlib.util.spec_from_file_location("pad363_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


DDL = (
    "CREATE TABLE coach_in_player (id INTEGER PRIMARY KEY)",
    "CREATE TABLE lesson_instances (id INTEGER PRIMARY KEY)",
    "CREATE TABLE evaluation_categories (id INTEGER PRIMARY KEY, coach_id INTEGER NOT NULL, "
    "name VARCHAR(100) NOT NULL, scale_min INTEGER, scale_max INTEGER, created_at DATETIME, updated_at DATETIME)",
    "CREATE TABLE evaluation_entries (id INTEGER PRIMARY KEY, coach_player_id INTEGER NOT NULL, "
    "category_id INTEGER NOT NULL, score FLOAT NOT NULL, comment VARCHAR(500), "
    "evaluated_at DATETIME NOT NULL, created_at DATETIME, updated_at DATETIME)",
)

FOREHAND, VOLLEY = 10, 11

# (id, coach_player_id, category_id, score, evaluated_at — naive UTC, as stored)
ENTRIES = (
    (1, 1, FOREHAND, 5.0, "2026-07-01 10:00:00"),  # earlier Forehand of 1 July: stays record-less
    (2, 1, FOREHAND, 7.0, "2026-07-01 15:00:00"),  # latest Forehand of 1 July: joins
    (3, 1, VOLLEY, 6.5, "2026-07-01 10:00:00"),    # same day, other category: same record
    (4, 1, FOREHAND, 8.0, "2026-07-01 23:30:00"),  # 00:30 on 2 July in Lisbon (WEST): next day
    (5, 1, FOREHAND, 4.0, "2026-01-10 23:30:00"),  # 23:30 on 10 January in Lisbon (WET): same day
    (6, 2, FOREHAND, 3.0, "2026-07-01 10:00:00"),  # another coach-player: its own record
    (7, 2, VOLLEY, 2.0, "2026-07-01 09:00:00"),    # a tie on the instant ...
    (8, 2, VOLLEY, 9.0, "2026-07-01 09:00:00"),    # ... the greater id joins
)


def _scratch(entries=ENTRIES):
    conn = sa.create_engine("sqlite://").connect()
    for ddl in DDL:
        conn.exec_driver_sql(ddl)
    conn.exec_driver_sql("INSERT INTO coach_in_player (id) VALUES (1), (2)")
    conn.exec_driver_sql(
        "INSERT INTO evaluation_categories (id, coach_id, name, scale_min, scale_max) VALUES "
        f"({FOREHAND}, 1, 'Forehand', 1, 10), ({VOLLEY}, 1, 'Volley', 0, 10)"
    )
    for row in entries:
        conn.exec_driver_sql(
            "INSERT INTO evaluation_entries (id, coach_player_id, category_id, score, evaluated_at, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (*row, row[4], row[4]),
        )
    return conn


def _run(conn, fn):
    mod = _load()
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        mod.op = Operations(ctx)
        getattr(mod, fn)()


def _cols(conn, table):
    return {c["name"] for c in sa.inspect(conn).get_columns(table)}


def _index_names(conn, table):
    return {i["name"] for i in sa.inspect(conn).get_indexes(table)}


def _entry_record_ids(conn):
    return dict(conn.exec_driver_sql("SELECT id, record_id FROM evaluation_entries ORDER BY id").fetchall())


def _untouched(conn):
    """Everything on an entry row that the migration must never write."""
    return conn.exec_driver_sql(
        "SELECT id, coach_player_id, category_id, score, comment, evaluated_at, created_at, updated_at "
        "FROM evaluation_entries ORDER BY id"
    ).fetchall()


def _records(conn):
    return conn.exec_driver_sql(
        "SELECT id, coach_player_id, lesson_instance_id, evaluated_on, note, created_at, updated_at "
        "FROM evaluation_records ORDER BY coach_player_id, evaluated_on"
    ).fetchall()


def test_upgrade_adds_the_schema_and_is_a_no_op_twice():
    conn = _scratch()
    _run(conn, "upgrade")
    assert {"catalogue_key", "competency_group", "is_active", "sort_order"} <= _cols(conn, "evaluation_categories")
    assert "record_id" in _cols(conn, "evaluation_entries")
    assert {"id", "coach_player_id", "lesson_instance_id", "evaluated_on", "note", "created_at", "updated_at"} == _cols(
        conn, "evaluation_records"
    )
    assert "uq_evaluation_categories_coach_catalogue_key" in _index_names(conn, "evaluation_categories")
    assert "uq_evaluation_entries_record_category" in _index_names(conn, "evaluation_entries")
    assert {"uq_evaluation_records_classless_day", "uq_evaluation_records_class_day"} <= _index_names(
        conn, "evaluation_records"
    )

    shape = {t: (_cols(conn, t), _index_names(conn, t)) for t in ("evaluation_categories", "evaluation_entries", "evaluation_records")}
    _run(conn, "upgrade")
    assert {t: (_cols(conn, t), _index_names(conn, t)) for t in shape} == shape


def test_existing_categories_stay_legacy_and_active():
    conn = _scratch()
    _run(conn, "upgrade")
    rows = conn.exec_driver_sql(
        "SELECT name, catalogue_key, competency_group, is_active, sort_order, scale_min, scale_max "
        "FROM evaluation_categories ORDER BY id"
    ).fetchall()
    assert rows == [("Forehand", None, None, 1, None, 1, 10), ("Volley", None, None, 1, None, 0, 10)]


def test_a_hand_applied_column_is_left_alone():
    conn = _scratch()
    conn.exec_driver_sql("ALTER TABLE evaluation_categories ADD COLUMN sort_order INTEGER")
    conn.exec_driver_sql("ALTER TABLE evaluation_entries ADD COLUMN record_id INTEGER")
    _run(conn, "upgrade")
    assert "competency_group" in _cols(conn, "evaluation_categories")
    assert _entry_record_ids(conn)[2] is not None  # the backfill still ran


def test_the_backfill_groups_by_coach_player_and_club_local_day():
    conn = _scratch()
    before = _untouched(conn)
    _run(conn, "upgrade")

    records = _records(conn)
    assert [(r[1], r[2], str(r[3]), r[4]) for r in records] == [
        (1, None, "2026-01-10", None),
        (1, None, "2026-07-01", None),
        (1, None, "2026-07-02", None),  # 23:30 UTC on 1 July is already 2 July on the club's clock
        (2, None, "2026-07-01", None),
    ]
    by_day = {(r[1], str(r[3])): r[0] for r in records}
    assert _entry_record_ids(conn) == {
        1: None,  # the earlier Forehand of the day stays record-less
        2: by_day[(1, "2026-07-01")],
        3: by_day[(1, "2026-07-01")],
        4: by_day[(1, "2026-07-02")],
        5: by_day[(1, "2026-01-10")],
        6: by_day[(2, "2026-07-01")],
        7: None,  # same instant: the greater id holds the slot
        8: by_day[(2, "2026-07-01")],
    }
    # the record is stamped with the span of the rows it groups
    july_first = next(r for r in records if (r[1], str(r[3])) == (1, "2026-07-01"))
    assert (str(july_first[5])[:19], str(july_first[6])[:19]) == ("2026-07-01 10:00:00", "2026-07-01 15:00:00")

    # data survives: nothing but record_id was written on any entry row
    assert _untouched(conn) == before


def test_running_the_backfill_again_changes_nothing():
    conn = _scratch()
    _run(conn, "upgrade")
    first = (_entry_record_ids(conn), _records(conn), _untouched(conn))
    _run(conn, "upgrade")
    assert (_entry_record_ids(conn), _records(conn), _untouched(conn)) == first


def test_a_second_run_never_lets_an_earlier_row_take_a_held_slot():
    """The unit of idempotence: a record-less row is backfilled only when no later
    row of its category already sits in that day's record."""
    conn = _scratch()
    _run(conn, "upgrade")
    held = _entry_record_ids(conn)
    conn.exec_driver_sql(
        "INSERT INTO evaluation_entries (id, coach_player_id, category_id, score, evaluated_at) "
        f"VALUES (20, 1, {FOREHAND}, 1.0, '2026-07-01 12:00:00')"  # earlier than entry 2 (15:00)
    )
    _run(conn, "upgrade")
    after = _entry_record_ids(conn)
    assert after.pop(20) is None
    assert after == held


def test_a_second_run_gives_the_slot_to_a_later_record_less_row():
    """A row written around the service after the first run (a deploy window) and
    later than the slot's holder: the latest of the day holds the slot, the former
    holder becomes record-less. Still only `record_id` is written."""
    conn = _scratch()
    _run(conn, "upgrade")
    record = _entry_record_ids(conn)[2]
    conn.exec_driver_sql(
        "INSERT INTO evaluation_entries (id, coach_player_id, category_id, score, evaluated_at) "
        f"VALUES (21, 1, {FOREHAND}, 2.0, '2026-07-01 18:00:00')"  # later than entry 2 (15:00), same local day
    )
    before = _untouched(conn)
    _run(conn, "upgrade")
    ids = _entry_record_ids(conn)
    assert (ids[21], ids[2], ids[3]) == (record, None, record)
    assert _untouched(conn) == before
    assert len(_records(conn)) == 4


def test_an_orphan_entry_is_skipped_not_fatal():
    """Production drifts (no FK guaranteed): an entry whose coach-player row is
    gone cannot own a record, and must not stop the migration."""
    conn = _scratch(ENTRIES + ((30, 999, FOREHAND, 5.0, "2026-07-01 10:00:00"),))
    _run(conn, "upgrade")
    assert _entry_record_ids(conn)[30] is None
    assert 999 not in {r[1] for r in _records(conn)}


def test_the_database_refuses_a_second_classless_record_for_the_day():
    conn = _scratch()
    _run(conn, "upgrade")
    with pytest.raises(sa.exc.IntegrityError):
        conn.exec_driver_sql(
            "INSERT INTO evaluation_records (coach_player_id, evaluated_on) VALUES (1, '2026-07-01')"
        )
    # a class-linked record of the same day is a different record
    conn.exec_driver_sql(
        "INSERT INTO evaluation_records (coach_player_id, lesson_instance_id, evaluated_on) VALUES (1, 5, '2026-07-01')"
    )
    with pytest.raises(sa.exc.IntegrityError):
        conn.exec_driver_sql(
            "INSERT INTO evaluation_records (coach_player_id, lesson_instance_id, evaluated_on) VALUES (1, 5, '2026-07-01')"
        )


def test_downgrade_removes_the_schema_keeps_every_entry_and_upgrades_again():
    conn = _scratch()
    before = _untouched(conn)
    _run(conn, "upgrade")
    grouping = _entry_record_ids(conn)
    _run(conn, "downgrade")
    assert "evaluation_records" not in sa.inspect(conn).get_table_names()
    assert "record_id" not in _cols(conn, "evaluation_entries")
    assert not {"catalogue_key", "competency_group", "is_active", "sort_order"} & _cols(conn, "evaluation_categories")
    assert _untouched(conn) == before
    _run(conn, "downgrade")  # a no-op twice

    _run(conn, "upgrade")
    regrouped = _entry_record_ids(conn)
    assert {k: v is None for k, v in regrouped.items()} == {k: v is None for k, v in grouping.items()}
    assert _untouched(conn) == before


def test_downgrade_refuses_to_discard_what_only_the_new_schema_holds(monkeypatch):
    """Rolling back is lossless only while nothing lives in the new columns. A
    non-legacy competency would become visible to App Store 1.0/1.1.0 the moment
    `competency_group` is dropped, and a record's note would be gone."""
    conn = _scratch()
    _run(conn, "upgrade")
    conn.exec_driver_sql(
        "INSERT INTO evaluation_categories (id, coach_id, name, scale_min, scale_max, competency_group, is_active) "
        "VALUES (50, 1, 'Serve', 1, 5, 'technique', 1)"
    )
    with pytest.raises(RuntimeError, match="PAD363_DOWNGRADE_DISCARDS_DATA"):
        _run(conn, "downgrade")
    assert "evaluation_records" in sa.inspect(conn).get_table_names()

    monkeypatch.setenv("PAD363_DOWNGRADE_DISCARDS_DATA", "1")
    _run(conn, "downgrade")
    assert "evaluation_records" not in sa.inspect(conn).get_table_names()


def test_the_migration_reads_the_day_off_the_same_zone_as_the_app():
    from padel_app.utils.dates import CLUB_TZ, utc_to_wall_naive

    mod = _load()
    assert mod.CLUB_TZ == CLUB_TZ
    instant = dt.datetime(2026, 7, 1, 23, 30)
    assert mod.club_day(instant) == utc_to_wall_naive(instant).date() == dt.date(2026, 7, 2)
