"""PAD-680: the notification sound (notifications.notification-sound rules 1 and 5).

`users.notif_sound` (default on) is the per-user switch; `device_tokens.sound_capable` (default off)
says the registering build has the switch, so its pushes may carry `sound`. Both are added only when
absent (prod and staging drift: migrations must be idempotent). No data is written: the server
defaults fill existing rows.

Revision ID: f846919317aa
Revises: c6203aa9b167
"""
from alembic import op
import sqlalchemy as sa

revision = "f846919317aa"
down_revision = "c6203aa9b167"
branch_labels = None
depends_on = None

def _has_column(table, name):
    return name in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade():
    if not _has_column("users", "notif_sound"):
        op.add_column("users", sa.Column("notif_sound", sa.Boolean(), nullable=False, server_default=sa.true()))
    if not _has_column("device_tokens", "sound_capable"):
        op.add_column(
            "device_tokens",
            sa.Column("sound_capable", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade():
    if _has_column("device_tokens", "sound_capable"):
        op.drop_column("device_tokens", "sound_capable")
    if _has_column("users", "notif_sound"):
        op.drop_column("users", "notif_sound")
