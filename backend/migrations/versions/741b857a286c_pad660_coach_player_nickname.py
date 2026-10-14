"""PAD-660: a coach's private nickname for a student (players.nickname rule 1).

Two columns on the coach–student relation (`coach_in_player`), never on the user:
`nickname` (≤ 60, nullable) and `nickname_as_name` (default false). Both are added only when
absent (prod and staging drift: memory "prod schema drift, migrations must be idempotent").
No data is written, so it runs in milliseconds on any size.

Revision ID: 741b857a286c
Revises: 734b8e37b4e2
"""
from alembic import op
import sqlalchemy as sa

revision = "741b857a286c"
down_revision = "734b8e37b4e2"
branch_labels = None
depends_on = None

TABLE = "coach_in_player"


def _has_column(name):
    return name in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(TABLE)}


def upgrade():
    if not _has_column("nickname"):
        op.add_column(TABLE, sa.Column("nickname", sa.String(length=60), nullable=True))
    if not _has_column("nickname_as_name"):
        op.add_column(
            TABLE,
            sa.Column("nickname_as_name", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade():
    if _has_column("nickname_as_name"):
        op.drop_column(TABLE, "nickname_as_name")
    if _has_column("nickname"):
        op.drop_column(TABLE, "nickname")
