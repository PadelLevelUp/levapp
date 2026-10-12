"""PAD-633 data repair 0069acbc403a (import.confirm rule 8): users the import gave an invented
`@email.com` address get `email` NULL, a `pending-…` username and no password when they never
chose one (NULL, or the hash of "" the import wrote before 933d7827c); nothing else is touched.
Scratch SQLite with a hand-made table, the way test_b216 proves its migration."""
import importlib.util
import pathlib

import sqlalchemy as sa
from werkzeug.security import generate_password_hash
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load():
    versions = pathlib.Path(__file__).resolve().parents[2] / "migrations" / "versions"
    (path,) = versions.glob("*pad633_drop_invented_import_emails*.py")
    spec = importlib.util.spec_from_file_location("pad633_mig", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


EMPTY_HASH = generate_password_hash("")
CHOSEN_HASH = generate_password_hash("a password the student chose")

# id: (email, username, password, status)
ROWS = {
    1: ("joao_silva@email.com", "joao_silva", None, "inactive"),  # what the import wrote
    2: ("joao_silva_2@email.com", "joao_silva_2", None, "inactive"),  # its collision suffix
    3: ("rita@email.com", "pending-0123456789abcdef", None, "inactive"),  # coach-typed real address
    4: ("ana_costa@email.com", "ana_costa", "hash", "active"),  # activated: the student kept it
    5: ("ana_costa_2@email.com", "ana_costa_2", None, "disabled"),  # not inactive
    6: ("rui@example.com", "rui", None, "inactive"),  # another domain
    7: (None, "pending-fedcba9876543210", None, "inactive"),  # already without an email
    8: ("rui_lopes@email.com", "rui_lopes", EMPTY_HASH, "inactive"),  # imported before 933d7827c
    9: ("eva_reis@email.com", "eva_reis", CHOSEN_HASH, "inactive"),  # import shape, chosen password
    10: ("pending-x@email.com", "pending-x", EMPTY_HASH, "active"),  # empty hash, but activated
}
REPAIRED = (1, 2, 8)
UNTOUCHED = (3, 4, 5, 6, 7, 9, 10)


def _scratch():
    conn = sa.create_engine("sqlite://").connect()
    conn.exec_driver_sql(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(120) UNIQUE, "
        "username VARCHAR(80) NOT NULL UNIQUE, password VARCHAR(255), status VARCHAR(16))"
    )
    for user_id, (email, username, password, status) in ROWS.items():
        conn.execute(
            sa.text("INSERT INTO users VALUES (:i, :e, :u, :p, :s)"),
            {"i": user_id, "e": email, "u": username, "p": password, "s": status},
        )
    return conn


def _run(conn, fn):
    mod = _load()
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        mod.op = Operations(ctx)
        getattr(mod, fn)()


def _users(conn):
    return {r.id: (r.email, r.username, r.password, r.status) for r in conn.execute(sa.text("SELECT * FROM users"))}


def test_upgrade_drops_only_the_invented_addresses_and_gives_a_placeholder(capsys):
    conn = _scratch()
    _run(conn, "upgrade")
    users = _users(conn)
    for user_id in REPAIRED:
        email, username, password, status = users[user_id]
        assert email is None
        assert username.startswith("pending-") and len(username) == len("pending-") + 16
        assert (password, status) == (None, "inactive")
    assert len({users[user_id][1] for user_id in REPAIRED}) == 3
    for user_id in UNTOUCHED:
        assert users[user_id] == ROWS[user_id], f"user {user_id} must be untouched"
    assert (
        "from 3 user(s) (2 without a password, 1 with the empty-string hash); skipped 1 with a chosen password"
        in capsys.readouterr().out
    )


def test_upgrade_twice_is_a_no_op():
    conn = _scratch()
    _run(conn, "upgrade")
    once = _users(conn)
    _run(conn, "upgrade")
    assert _users(conn) == once


def test_downgrade_leaves_the_repair_in_place():
    conn = _scratch()
    _run(conn, "upgrade")
    once = _users(conn)
    _run(conn, "downgrade")
    assert _users(conn) == once
