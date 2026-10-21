"""PAD-680: the per-user notification-sound switch (notifications.notification-sound rule 1).

One boolean on `users`, `notif_sound`, default on. Added only when absent (prod and staging drift:
migrations must be idempotent). No data is written: the server default fills existing rows.

Revision ID: f846919317aa
Revises: 741b857a286c
"""
from alembic import op
import sqlalchemy as sa

revision = "f846919317aa"
down_revision = "741b857a286c"
branch_labels = None
depends_on = None

TABLE = "users"


def _has_column(name):
    return name in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(TABLE)}


def upgrade():
    if not _has_column("notif_sound"):
        op.add_column(TABLE, sa.Column("notif_sound", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade():
    if _has_column("notif_sound"):
        op.drop_column(TABLE, "notif_sound")
