"""where a moved invitation came from (PAD-719)

Revision ID: c3e9a1f0d719
Revises: f846919317aa
Create Date: 2026-10-22 03:30:00.000000

notifications.invitations rule 18a: `moved_from_vacancy_id` (FK vacancies, SET NULL) and
`moved_at` on `notification_events`, stamped by `_move_to_open_sibling`. Data-free: every existing
row stays NULL ("never moved"). Guarded, so a second run changes nothing.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3e9a1f0d719'
down_revision = 'f846919317aa'  # #760
branch_labels = None
depends_on = None

TABLE = "notification_events"
FK = "notification_events_moved_from_vacancy_id_fkey"


def _columns():
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(TABLE)}


def upgrade():
    cols = _columns()
    sqlite = op.get_bind().dialect.name == "sqlite"
    if "moved_from_vacancy_id" not in cols:
        if sqlite:
            with op.batch_alter_table(TABLE) as batch:
                batch.add_column(sa.Column("moved_from_vacancy_id", sa.Integer(), nullable=True))
                batch.create_foreign_key(FK, "vacancies", ["moved_from_vacancy_id"], ["id"], ondelete="SET NULL")
        else:
            op.add_column(TABLE, sa.Column("moved_from_vacancy_id", sa.Integer(), nullable=True))
            op.create_foreign_key(FK, TABLE, "vacancies", ["moved_from_vacancy_id"], ["id"], ondelete="SET NULL")
    if "moved_at" not in cols:
        op.add_column(TABLE, sa.Column("moved_at", sa.DateTime(), nullable=True))


def downgrade():
    cols = _columns()
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table(TABLE) as batch:
            for name in ("moved_at", "moved_from_vacancy_id"):
                if name in cols:
                    batch.drop_column(name)
        return
    if "moved_at" in cols:
        op.drop_column(TABLE, "moved_at")
    if "moved_from_vacancy_id" in cols:
        op.drop_constraint(FK, TABLE, type_="foreignkey")
        op.drop_column(TABLE, "moved_from_vacancy_id")
