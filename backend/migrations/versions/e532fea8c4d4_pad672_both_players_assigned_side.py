"""a "both" player's side: chosen per class, frozen at the start (PAD-672 slice 3)

Revision ID: e532fea8c4d4
Revises: bd9540d946e7
Create Date: 2026-10-21 23:00:00.000000

classes.instance-enrollment rule 13a:
1. `presences.side` may also be `both` (a join request that chose to play either side in this
   class, join-requests rule 20): the check `ck_presences_side` is recreated with the third value.
2. `presences.assigned_side` (`left` | `right`, nullable): written once by the engine's tick from
   the class's start; NULL before. Data-free: every existing row stays NULL.
Guarded, so a second run changes nothing.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e532fea8c4d4'
down_revision = 'bd9540d946e7'  # PAD-672 slice 2
branch_labels = None
depends_on = None

TABLE = "presences"
SIDE_CHECK = "ck_presences_side"
OLD_SQL = "side IS NULL OR side IN ('left', 'right')"
NEW_SQL = "side IS NULL OR side IN ('left', 'right', 'both')"


def _columns():
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(TABLE)}


def _check_sql():
    try:
        for c in sa.inspect(op.get_bind()).get_check_constraints(TABLE):
            if c["name"] == SIDE_CHECK:
                return c.get("sqltext") or ""
    except NotImplementedError:
        pass
    return None


def _set_check(sql):
    current = _check_sql()
    if current is not None and "both" in current and "both" in sql:
        return
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table(TABLE) as batch:
            if current is not None:
                batch.drop_constraint(SIDE_CHECK, type_="check")
            batch.create_check_constraint(SIDE_CHECK, sql)
    else:
        if current is not None:
            op.drop_constraint(SIDE_CHECK, TABLE, type_="check")
        op.create_check_constraint(SIDE_CHECK, TABLE, sql)


def upgrade():
    if "assigned_side" not in _columns():
        op.add_column(TABLE, sa.Column("assigned_side", sa.String(5), nullable=True))
    _set_check(NEW_SQL)


def downgrade():
    op.execute("UPDATE presences SET side = NULL WHERE side = 'both'")
    _set_check(OLD_SQL)
    if "assigned_side" in _columns():
        if op.get_bind().dialect.name == "sqlite":
            with op.batch_alter_table(TABLE) as batch:
                batch.drop_column("assigned_side")
        else:
            op.drop_column(TABLE, "assigned_side")
