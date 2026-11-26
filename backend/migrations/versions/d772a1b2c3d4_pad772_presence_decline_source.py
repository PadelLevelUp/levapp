"""PAD-772: ``presences.decline_source`` (attendance.confirm rule 30, calendar.student-blockers rule 23).

A nullable string with a CHECK: why a student's decline was made. The only value today is
``availability_block`` (the student answered yes to "mark the classes my block covers"). Any other
decline leaves it NULL. It cannot live in ``left_reason``, which the new engine reads to decide who
holds a seat.

- Upgrade: adds the column and its CHECK, each only when absent (prod and staging drift: migrations
  must be idempotent). Expand-only: no data is written, existing rows read NULL.
- Downgrade: drops the CHECK, then the column, each only when present.

Revision ID: d772a1b2c3d4
Revises: c840d1e2f3a4
Create Date: 2026-11-26 11:30:00.000000
"""
import sqlalchemy as sa
from alembic import op

revision = "d772a1b2c3d4"
down_revision = "c840d1e2f3a4"
branch_labels = None
depends_on = None

CK = "ck_presences_decline_source"
CK_SQL = "decline_source IS NULL OR decline_source IN ('availability_block')"


def _has_column(bind) -> bool:
    return "decline_source" in {c["name"] for c in sa.inspect(bind).get_columns("presences")}


def _has_check(bind) -> bool:
    return CK in {c["name"] for c in sa.inspect(bind).get_check_constraints("presences")}


def upgrade():
    bind = op.get_bind()
    if not _has_column(bind):
        op.add_column("presences", sa.Column("decline_source", sa.String(20), nullable=True))
    if not _has_check(bind):
        with op.batch_alter_table("presences") as batch:
            batch.create_check_constraint(CK, CK_SQL)


def downgrade():
    bind = op.get_bind()
    if _has_check(bind):
        with op.batch_alter_table("presences") as batch:
            batch.drop_constraint(CK, type_="check")
    if _has_column(bind):
        with op.batch_alter_table("presences") as batch:
            batch.drop_column("decline_source")
