"""a side on join requests and waiting-list entries (PAD-672 slice 1)

Revision ID: 6988ec068d41
Revises: f846919317aa
Create Date: 2026-10-21 22:30:00.000000

classes.join-requests rule 20, classes.academy-class-booking rule 6, notifications.waiting-list
rule 4e: `side` (`left` | `right` | `both`, NULL = no side named) on `class_join_requests`,
`waiting_list_entries` and `standing_waiting_list_entries`. Data-free: every existing row stays
NULL, which the engine reads as today's "any spot". Guarded, so a second run changes nothing.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '6988ec068d41'
down_revision = 'f846919317aa'  # #760 for now; onto c3e9a1f0d719 (PAD-719, #789) once it lands
branch_labels = None
depends_on = None

TABLES = ("class_join_requests", "waiting_list_entries", "standing_waiting_list_entries")


def _has_side(table):
    return "side" in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade():
    for table in TABLES:
        if not _has_side(table):
            op.add_column(table, sa.Column("side", sa.String(5), nullable=True))


def downgrade():
    for table in TABLES:
        if not _has_side(table):
            continue
        if op.get_bind().dialect.name == "sqlite":
            with op.batch_alter_table(table) as batch:
                batch.drop_column("side")
        else:
            op.drop_column(table, "side")
