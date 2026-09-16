"""PAD-194: a club's courts, and an optional court on a class

Revision ID: 78878e1670aa
Revises: ad97ec649746
Create Date: 2026-09-10

clubs.courts v1. Idempotent on a prod-shaped database: the table is created
only if absent and the column added only if absent (prod carries drift that
never went through Alembic). No data step — nothing existing has a court.
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "78878e1670aa"
down_revision = "ad97ec649746"
branch_labels = None
depends_on = None


def _has_table(bind, name):
    return sa.inspect(bind).has_table(name)


def _columns(bind, table):
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def upgrade():
    bind = op.get_bind()
    if not _has_table(bind, "courts"):
        op.create_table(
            "courts",
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("club_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=80), nullable=False),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("club_id", "name", name="uq_courts_club_name"),
        )
    if _has_table(bind, "lessons") and "court_id" not in _columns(bind, "lessons"):
        op.add_column("lessons", sa.Column("court_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_lessons_court_id_courts", "lessons", "courts", ["court_id"], ["id"], ondelete="SET NULL"
        )


def downgrade():
    bind = op.get_bind()
    if _has_table(bind, "lessons") and "court_id" in _columns(bind, "lessons"):
        op.drop_constraint("fk_lessons_court_id_courts", "lessons", type_="foreignkey")
        op.drop_column("lessons", "court_id")
    if _has_table(bind, "courts"):
        op.drop_table("courts")
