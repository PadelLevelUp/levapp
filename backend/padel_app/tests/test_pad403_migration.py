"""PAD-403 migration e25428020888 — every legacy 1-10 evaluation score becomes
1-5 stars, in one data migration, with the original values preserved in
``score_before_conversion`` / ``scale_max_before_conversion`` (evaluations.
legacy-conversion rules 2, 3).

Scratch SQLite with hand-made tables, the way test_pad363_migration proves its
migration (that file's harness is not Postgres-only — it loads the migration
module and drives ``upgrade()``/``downgrade()`` directly against a scratch
``sqlite://`` connection, no Flask app or real Alembic environment needed).
"""
import importlib.util
import pathlib

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("*pad403_legacy_scores_to_stars*.py")
    spec = importlib.util.spec_from_file_location("pad403_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


DDL = (
    "CREATE TABLE evaluation_categories (id INTEGER PRIMARY KEY, coach_id INTEGER NOT NULL, "
    "name VARCHAR(100) NOT NULL, competency_group VARCHAR(16), scale_min INTEGER, scale_max INTEGER)",
    "CREATE TABLE evaluation_entries (id INTEGER PRIMARY KEY, coach_player_id INTEGER NOT NULL, "
    "category_id INTEGER NOT NULL, record_id INTEGER, score FLOAT NOT NULL, comment VARCHAR(500), "
    "evaluated_at DATETIME NOT NULL)",
)

FOREHAND, TECHNIQUE, VOLLEY = 10, 11, 12
RECORD = 900

# (id, coach_player_id, category_id, record_id, score, evaluated_at)
ENTRIES = (
    (1, 1, FOREHAND, RECORD, 7.0, "2026-07-01 10:00:00"),  # record-held
    (2, 1, FOREHAND, None, 9.0, "2026-07-01 15:00:00"),    # record-less (Q29): converts with the rest
    (3, 1, TECHNIQUE, None, 4.0, "2026-07-02 09:00:00"),   # catalogue competency, already 1-5: untouched
    (4, 1, VOLLEY, None, 0.0, "2026-07-03 09:00:00"),      # 0-10 category, bottom: 0 -> 1 (the mapping is total)
    (5, 1, VOLLEY, None, 10.0, "2026-07-03 10:00:00"),     # 0-10 category, top: 10 -> 5
)


def _scratch():
    conn = sa.create_engine("sqlite://").connect()
    for ddl in DDL:
        conn.exec_driver_sql(ddl)
    conn.exec_driver_sql(
        "INSERT INTO evaluation_categories (id, coach_id, name, competency_group, scale_min, scale_max) VALUES "
        f"({FOREHAND}, 1, 'Forehand', NULL, 1, 10), ({TECHNIQUE}, 1, 'Technique', 'technique', 1, 5), "
        f"({VOLLEY}, 1, 'Volley', NULL, 0, 10)"
    )
    for row in ENTRIES:
        conn.exec_driver_sql(
            "INSERT INTO evaluation_entries (id, coach_player_id, category_id, record_id, score, evaluated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            row,
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


def _categories(conn):
    cols = "id, name, competency_group, scale_min, scale_max"
    if "scale_max_before_conversion" in _cols(conn, "evaluation_categories"):
        cols += ", scale_max_before_conversion, scale_min_before_conversion"
    return conn.exec_driver_sql(
        f"SELECT {cols} FROM evaluation_categories ORDER BY id"
    ).fetchall()


def _entries(conn):
    cols = "id, coach_player_id, category_id, record_id, score, evaluated_at"
    if "score_before_conversion" in _cols(conn, "evaluation_entries"):
        cols += ", score_before_conversion"
    return conn.exec_driver_sql(
        f"SELECT {cols} FROM evaluation_entries ORDER BY id"
    ).fetchall()


def _snapshot(conn):
    return (_categories(conn), _entries(conn))


def test_upgrade_converts_the_legacy_category_and_its_entries_only():
    conn = _scratch()
    seed = _snapshot(conn)

    _run(conn, "upgrade")

    categories = _categories(conn)
    assert categories == [
        (FOREHAND, "Forehand", None, 1, 5, 10, 1),  # 1-5 now, original scale preserved
        (TECHNIQUE, "Technique", "technique", 1, 5, None, None),  # catalogue competency untouched
        (VOLLEY, "Volley", None, 1, 5, 10, 0),  # 0-10 -> 1-5, original min 0 preserved
    ]

    entries = {row[0]: row for row in _entries(conn)}
    # (id, coach_player_id, category_id, record_id, score, evaluated_at, score_before_conversion)
    assert entries[1] == (1, 1, FOREHAND, RECORD, 4.0, "2026-07-01 10:00:00", 7.0)  # record-held: 7 -> 4
    assert entries[2] == (2, 1, FOREHAND, None, 5.0, "2026-07-01 15:00:00", 9.0)    # record-less: 9 -> 5
    assert entries[3] == (3, 1, TECHNIQUE, None, 4.0, "2026-07-02 09:00:00", None)  # catalogue: untouched
    assert entries[4] == (4, 1, VOLLEY, None, 1.0, "2026-07-03 09:00:00", 0.0)      # 0 -> 1, never 0 stars
    assert entries[5] == (5, 1, VOLLEY, None, 5.0, "2026-07-03 10:00:00", 10.0)     # 10 -> 5

    # evaluated_at and record_id are never touched
    assert entries[1][3] == RECORD
    assert entries[2][3] is None
    assert entries[1][5] == "2026-07-01 10:00:00"
    assert entries[2][5] == "2026-07-01 15:00:00"
    assert entries[3][5] == "2026-07-02 09:00:00"

    after_first_upgrade = _snapshot(conn)

    # downgrade to the parent -> byte-identical to the seed
    _run(conn, "downgrade")
    assert "score_before_conversion" not in _cols(conn, "evaluation_entries")
    assert "scale_max_before_conversion" not in _cols(conn, "evaluation_categories")
    assert _snapshot(conn) == seed

    # upgrade again -> byte-identical to after the first upgrade
    _run(conn, "upgrade")
    assert _snapshot(conn) == after_first_upgrade

    # a third upgrade (re-running the data step) changes nothing: idempotent
    mod = _load()
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        mod.op = Operations(ctx)
        mod._convert()
    assert _snapshot(conn) == after_first_upgrade


def test_a_second_upgrade_is_a_no_op():
    conn = _scratch()
    _run(conn, "upgrade")
    first = _snapshot(conn)
    _run(conn, "upgrade")
    assert _snapshot(conn) == first


def test_downgrade_twice_is_a_no_op():
    conn = _scratch()
    seed = _snapshot(conn)
    _run(conn, "upgrade")
    _run(conn, "downgrade")
    once = _snapshot(conn)
    assert once == seed
    _run(conn, "downgrade")  # nothing left to restore or drop
    assert _snapshot(conn) == once
