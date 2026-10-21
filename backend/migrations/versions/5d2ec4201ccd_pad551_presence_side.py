"""a player's side in one occurrence (PAD-551)

Revision ID: 5d2ec4201ccd
Revises: 734b8e37b4e2
Create Date: 2026-10-14 21:00:00.000000

classes.instance-enrollment rule 13: `presences.side`, nullable (`left` | `right`; NULL = the
player's usual side on the coach–player link). Data-free: every existing row stays NULL, which is
exactly today's behaviour. Guarded, so a second run changes nothing.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5d2ec4201ccd'
down_revision = '734b8e37b4e2'  # PAD-644
branch_labels = None
depends_on = None

CHECK_NAME = "ck_presences_side"
CHECK_SQL = "side IS NULL OR side IN ('left', 'right')"


def _inspector():
    return sa.inspect(op.get_bind())


def _has_column():
    return "side" in {c["name"] for c in _inspector().get_columns("presences")}


def _has_check():
    try:
        return CHECK_NAME in {c["name"] for c in _inspector().get_check_constraints("presences")}
    except NotImplementedError:
        return False


def upgrade():
    sqlite = op.get_bind().dialect.name == "sqlite"
    if not _has_column():
        op.add_column("presences", sa.Column("side", sa.String(5), nullable=True))
    if not _has_check():
        if sqlite:
            with op.batch_alter_table("presences") as batch:
                batch.create_check_constraint(CHECK_NAME, CHECK_SQL)
        else:
            op.create_check_constraint(CHECK_NAME, "presences", CHECK_SQL)


def downgrade():
    if not _has_column():
        return
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("presences") as batch:
            if _has_check():
                batch.drop_constraint(CHECK_NAME, type_="check")
            batch.drop_column("side")
    else:
        if _has_check():
            op.drop_constraint(CHECK_NAME, "presences", type_="check")
        op.drop_column("presences", "side")
