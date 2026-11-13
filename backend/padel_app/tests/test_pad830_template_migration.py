"""PAD-830 migration e830f1a2b3c4: a saved template identical to an old default follows the new one.

Scratch SQLite with a hand-made notification_configs table, the way test_pad771_migration proves its own.
"""
import importlib.util
import pathlib

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from padel_app.models.notification_config import DEFAULT_MESSAGE_TEMPLATES, DEFAULT_MESSAGE_TEMPLATES_PT

OLD_EN_INVITE = "Hey {name}, we have an opening in the {level} class next {weekday} at {time}. Do you want to come?"
OLD_PT_REMINDER = "Olá {name}, lembrete: tens a aula de {level} esta {weekday} às {time}. Vens?"


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("*pad830_templates_follow_new_defaults*.py")
    spec = importlib.util.spec_from_file_location("pad830_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _scratch(*saved):
    conn = sa.create_engine("sqlite://").connect()
    conn.exec_driver_sql("CREATE TABLE notification_configs (id INTEGER PRIMARY KEY, message_templates JSON)")
    for i, templates in enumerate(saved, start=1):
        conn.execute(
            sa.text("INSERT INTO notification_configs (id, message_templates) VALUES (:i, :t)"),
            {"i": i, "t": None if templates is None else sa.JSON().bind_processor(conn.dialect)(templates)},
        )
    return conn


def _run(conn, fn):
    mod = _load()
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        mod.op = Operations(ctx)
        getattr(mod, fn)()


def _saved(conn):
    import json

    rows = conn.execute(sa.text("SELECT id, message_templates FROM notification_configs ORDER BY id")).fetchall()
    return [None if raw is None else json.loads(raw) for _id, raw in rows]


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-28")
def test_exact_old_defaults_follow_the_new_default():
    """Exact match in en and pt is replaced; one changed character, a text of their own, other keys and
    a coach with nothing saved are left alone."""
    mod = _load()
    near_miss = OLD_EN_INVITE.replace("Hey", "Hi")
    own = "Boa tarde {name}, vens treinar?"
    conn = _scratch(
        {"invite": OLD_EN_INVITE, "side_moved": "my own side text"},
        {"reminder": OLD_PT_REMINDER},
        {"invite": near_miss, "reminder": own},
        {"invite": OLD_EN_INVITE + " "},
        None,
    )
    _run(conn, "upgrade")
    en, pt, miss, trailing, nothing = _saved(conn)
    assert en == {"invite": DEFAULT_MESSAGE_TEMPLATES["invite"], "side_moved": "my own side text"}
    assert pt == {"reminder": DEFAULT_MESSAGE_TEMPLATES_PT["reminder"]}
    assert miss == {"invite": near_miss, "reminder": own}
    assert trailing == {"invite": OLD_EN_INVITE + " "}
    assert nothing is None
    assert "{level}" not in en["invite"] and "{level}" in mod.EN["invite"][0]


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-28")
def test_every_old_default_in_both_locales_is_migrated():
    """The seven keys, pt and en, each exact match becomes the model's current default."""
    mod = _load()
    for table, defaults in ((mod.EN, DEFAULT_MESSAGE_TEMPLATES), (mod.PT, DEFAULT_MESSAGE_TEMPLATES_PT)):
        assert len(table) == 7
        for key, (old, new) in table.items():
            assert "{level}" in old and "{level}" not in new
            assert new == defaults[key], f"{key}: the migration's new text drifted from the model default"
            conn = _scratch({key: old})
            _run(conn, "upgrade")
            assert _saved(conn) == [{key: new}]


@pytest.mark.criterion("NOTIFICATIONS-MESSAGE-TEMPLATES-28")
def test_upgrade_twice_changes_nothing_more_and_downgrade_restores_the_old_text():
    conn = _scratch({"invite": OLD_EN_INVITE, "reminder": "own"}, {"reminder": OLD_PT_REMINDER})
    _run(conn, "upgrade")
    once = _saved(conn)
    _run(conn, "upgrade")
    assert _saved(conn) == once
    _run(conn, "downgrade")
    assert _saved(conn) == [{"invite": OLD_EN_INVITE, "reminder": "own"}, {"reminder": OLD_PT_REMINDER}]
    _run(conn, "downgrade")
    assert _saved(conn) == [{"invite": OLD_EN_INVITE, "reminder": "own"}, {"reminder": OLD_PT_REMINDER}]


def test_it_revises_the_head_before_it():
    mod = _load()
    assert (mod.revision, mod.down_revision) == ("e830f1a2b3c4", "e932a7c1d4f2")  # PAD-932 (#980) landed first
