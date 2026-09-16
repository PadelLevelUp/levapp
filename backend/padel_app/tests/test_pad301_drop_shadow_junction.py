"""PAD-301 (classes.instance-enrollment phase 2): the shadow junction is gone.

The migration drops ``player_in_lesson_instance`` only when every junction
pair has a presence, refuses otherwise, re-runs as a no-op, and its downgrade
refills the table from presences. Scratch SQLite with hand-made tables, the
same way ``test_pad271_migration`` proves its migration.
"""
import importlib.util
import pathlib

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("*pad301_drop_player_in_lesson_instance*.py")
    spec = importlib.util.spec_from_file_location("pad301_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


DDL = (
    "CREATE TABLE players (id INTEGER PRIMARY KEY)",
    "CREATE TABLE lesson_instances (id INTEGER PRIMARY KEY)",
    "CREATE TABLE presences (id INTEGER PRIMARY KEY, lesson_instance_id INTEGER, player_id INTEGER)",
    "CREATE TABLE player_in_lesson_instance (created_at DATETIME, updated_at DATETIME, id INTEGER PRIMARY KEY, "
    "player_id INTEGER NOT NULL REFERENCES players (id), lesson_instance_id INTEGER NOT NULL REFERENCES lesson_instances (id), "
    "CONSTRAINT uq_player_lesson_instance UNIQUE (player_id, lesson_instance_id))",
    "CREATE INDEX ix_player_in_lesson_instance_lesson_instance_id ON player_in_lesson_instance (lesson_instance_id)",
)


def _scratch(pairs, presences):
    engine = sa.create_engine("sqlite://")
    conn = engine.connect()
    for ddl in DDL:
        conn.exec_driver_sql(ddl)
    conn.exec_driver_sql("INSERT INTO players (id) VALUES (1), (2), (3)")
    conn.exec_driver_sql("INSERT INTO lesson_instances (id) VALUES (10), (11)")
    for p, i in pairs:
        conn.exec_driver_sql(
            "INSERT INTO player_in_lesson_instance (player_id, lesson_instance_id) VALUES (?, ?)", (p, i)
        )
    for p, i in presences:
        conn.exec_driver_sql("INSERT INTO presences (player_id, lesson_instance_id) VALUES (?, ?)", (p, i))
    return conn


def _run(conn, fn):
    mod = _load()
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        mod.op = Operations(ctx)
        getattr(mod, fn)()


def _tables(conn):
    return set(sa.inspect(conn).get_table_names())


def _pairs(conn):
    return sorted(
        tuple(r) for r in conn.exec_driver_sql(
            "SELECT player_id, lesson_instance_id FROM player_in_lesson_instance"
        ).fetchall()
    )


def test_upgrade_drops_the_table_when_every_pair_has_a_presence():
    conn = _scratch(pairs=[(1, 10), (2, 10)], presences=[(1, 10), (2, 10), (3, 11)])
    _run(conn, "upgrade")
    assert "player_in_lesson_instance" not in _tables(conn)
    # A presence without a junction row never needed one; nothing else moved.
    assert conn.exec_driver_sql("SELECT count(*) FROM presences").scalar() == 3


def test_upgrade_is_a_no_op_when_the_table_is_already_gone():
    conn = _scratch(pairs=[(1, 10)], presences=[(1, 10)])
    _run(conn, "upgrade")
    _run(conn, "upgrade")
    assert "player_in_lesson_instance" not in _tables(conn)


def test_upgrade_refuses_when_a_pair_has_no_presence():
    conn = _scratch(pairs=[(1, 10), (2, 11)], presences=[(1, 10)])
    with pytest.raises(RuntimeError) as exc:
        _run(conn, "upgrade")
    assert "(player 2, instance 11)" in str(exc.value)
    assert "player_in_lesson_instance" in _tables(conn), "a refusal drops nothing"
    assert _pairs(conn) == [(1, 10), (2, 11)]


def test_downgrade_recreates_and_refills_from_presences_then_is_a_no_op():
    conn = _scratch(pairs=[(1, 10)], presences=[(1, 10), (3, 11)])
    _run(conn, "upgrade")
    _run(conn, "downgrade")
    assert "player_in_lesson_instance" in _tables(conn)
    assert _pairs(conn) == [(1, 10), (3, 11)]
    # The shape the pre-drop code writes (review round, Session A): the mixin
    # timestamps, NOT NULL keys, the FKs under production's names, the unique pair and PAD-263's index.
    insp = sa.inspect(conn)
    cols = {c["name"]: c for c in insp.get_columns("player_in_lesson_instance")}
    assert set(cols) == {"created_at", "updated_at", "id", "player_id", "lesson_instance_id"}
    assert cols["player_id"]["nullable"] is False and cols["lesson_instance_id"]["nullable"] is False
    assert sorted(fk["name"] for fk in insp.get_foreign_keys("player_in_lesson_instance")) == [
        "player_in_lesson_instance_lesson_instance_id_fkey",
        "player_in_lesson_instance_player_id_fkey",
    ]
    assert [ix["name"] for ix in insp.get_indexes("player_in_lesson_instance")] == [
        "ix_player_in_lesson_instance_lesson_instance_id"
    ]
    assert conn.exec_driver_sql(
        "SELECT count(*) FROM player_in_lesson_instance WHERE created_at IS NULL OR updated_at IS NULL"
    ).scalar() == 0
    _run(conn, "downgrade")
    assert _pairs(conn) == [(1, 10), (3, 11)]
    # And up again.
    _run(conn, "upgrade")
    assert "player_in_lesson_instance" not in _tables(conn)
