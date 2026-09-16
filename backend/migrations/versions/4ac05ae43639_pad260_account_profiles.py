"""PAD-260 (auth.account-profiles, B-049): players.user_id and coaches.user_id
NOT NULL, UNIQUE, ON DELETE CASCADE.

Fails closed (rule 2, owner decision 2026-09-10): before any change it looks,
on both tables, for profile rows with a NULL user_id and for user_id values
held by more than one row. If it finds any it raises with the ids; nothing is
altered, the transaction rolls back, and the deploy stops at staging (a copy of
production) before production.

Idempotent: every step checks the live schema first, so re-running it on an
already migrated database changes nothing. Reversible: the downgrade restores a
nullable, non-unique user_id with the plain foreign key.

Revision ID: 4ac05ae43639
Revises: 7794a8acc55b
Create Date: 2026-09-10 13:00:00
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "4ac05ae43639"
down_revision = "7794a8acc55b"
branch_labels = None
depends_on = None

TABLES = ("players", "coaches")


def _inspector():
    # A fresh inspector every time: reflection results are cached per instance.
    return inspect(op.get_bind())


def _user_id_fks(table):
    return [fk for fk in _inspector().get_foreign_keys(table) if fk.get("constrained_columns") == ["user_id"]]


def _user_id_uniques(table):
    """(constraint names, unique index names) covering exactly user_id."""
    insp = _inspector()
    constraints = [u["name"] for u in insp.get_unique_constraints(table) if u.get("column_names") == ["user_id"]]
    # Postgres also reports the index that backs a unique constraint through
    # get_indexes() (flagged `duplicates_constraint`); count only standalone
    # unique indexes here, or the downgrade drops the same object twice.
    indexes = [
        i["name"]
        for i in insp.get_indexes(table)
        if i.get("unique")
        and i.get("column_names") == ["user_id"]
        and not i.get("duplicates_constraint")
        and i["name"] not in constraints
    ]
    return constraints, indexes


def _user_id_nullable(table):
    return next(c for c in _inspector().get_columns(table) if c["name"] == "user_id")["nullable"]


def _is_cascade(fk):
    return str((fk.get("options") or {}).get("ondelete", "")).upper() == "CASCADE"


def _refuse_bad_rows():
    bind = op.get_bind()
    problems = []
    for table in TABLES:
        nulls = [row[0] for row in bind.execute(sa.text(f"SELECT id FROM {table} WHERE user_id IS NULL ORDER BY id"))]
        if nulls:
            problems.append(f"{table}: user_id IS NULL for id(s) {nulls}")
        shared = bind.execute(sa.text(
            f"SELECT user_id FROM {table} WHERE user_id IS NOT NULL "
            f"GROUP BY user_id HAVING COUNT(*) > 1 ORDER BY user_id"
        )).fetchall()
        for (user_id,) in shared:
            ids = [row[0] for row in bind.execute(
                sa.text(f"SELECT id FROM {table} WHERE user_id = :user_id ORDER BY id"), {"user_id": user_id}
            )]
            problems.append(f"{table}: user_id {user_id} is held by id(s) {ids}")
    if problems:
        raise RuntimeError(
            "PAD-260 (auth.account-profiles rule 2): refusing to migrate - "
            + "; ".join(problems)
            + ". Resolve these rows (scan query in the PAD-260 PR) and re-run. Nothing was changed."
        )


def upgrade():
    _refuse_bad_rows()
    for table in TABLES:
        if _user_id_nullable(table):
            op.alter_column(table, "user_id", existing_type=sa.Integer(), nullable=False)

        fks = _user_id_fks(table)
        if not any(fk.get("name") == f"fk_{table}_user_id" and _is_cascade(fk) for fk in fks):
            for fk in fks:
                if fk.get("name"):
                    op.drop_constraint(fk["name"], table, type_="foreignkey")
            op.create_foreign_key(f"fk_{table}_user_id", table, "users", ["user_id"], ["id"], ondelete="CASCADE")

        constraints, indexes = _user_id_uniques(table)
        if not constraints and not indexes:
            op.create_unique_constraint(f"uq_{table}_user_id", table, ["user_id"])


def downgrade():
    for table in TABLES:
        constraints, indexes = _user_id_uniques(table)
        for name in constraints:
            op.drop_constraint(name, table, type_="unique")
        for name in indexes:
            op.drop_index(name, table_name=table)

        for fk in _user_id_fks(table):
            if _is_cascade(fk):
                op.drop_constraint(fk["name"], table, type_="foreignkey")
        if not _user_id_fks(table):
            op.create_foreign_key(f"{table}_user_id_fkey", table, "users", ["user_id"], ["id"])

        if not _user_id_nullable(table):
            op.alter_column(table, "user_id", existing_type=sa.Integer(), nullable=True)
