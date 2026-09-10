"""PAD-269 follow-up: invitation and join tokens stored hashed; device tokens per (user, token)

players.join-token, players.invite-completion and clubs.coach-invitation keep only the
SHA-256 of the link token (token_hash). The stored tokens are hashed in place, so every
link already sent keeps working, and the plaintext column is dropped.
messaging.push-notifications rule 9: device_tokens is unique on (user_id, token) instead
of token alone.

Every step is guarded (prod carries objects no revision created; staging is a prod copy),
so the upgrade is safe to rerun.

Revision ID: 95bfee084ad1
Revises: 2c18f5a47c8b (PAD-270)
"""
import sqlalchemy as sa
from alembic import op

revision = "95bfee084ad1"
# Chain (coordinator, 2026-09-10): … → 76395824b9cf (PAD-274) → 2c18f5a47c8b (PAD-270) → this.
down_revision = "2c18f5a47c8b"
branch_labels = None
depends_on = None

TOKEN_TABLES = ("coach_invitations", "player_invitations", "coach_join_tokens")


def _insp():
    return sa.inspect(op.get_bind())


def _has_column(table, column):
    return column in {c["name"] for c in _insp().get_columns(table)}


def _has_index(table, name):
    return name in {i["name"] for i in _insp().get_indexes(table)}


def _has_unique(table, name):
    return name in {u["name"] for u in _insp().get_unique_constraints(table)}


def _unique_constraints_on(table, columns):
    return [u["name"] for u in _insp().get_unique_constraints(table) if list(u["column_names"]) == columns]


def _unique_indexes_on(table, columns):
    # Skip indexes that only back a unique constraint (dropped with the constraint).
    return [
        i["name"]
        for i in _insp().get_indexes(table)
        if i.get("unique") and list(i["column_names"]) == columns and not i.get("duplicates_constraint")
    ]


def upgrade():
    for table in TOKEN_TABLES:
        if not _has_column(table, "token_hash"):
            op.add_column(table, sa.Column("token_hash", sa.String(64), nullable=True))
        if _has_column(table, "token"):
            # sha256() is core PostgreSQL since 11; no extension needed.
            op.execute(
                f"UPDATE {table} SET token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex') "
                "WHERE token_hash IS NULL AND token IS NOT NULL"
            )
        op.alter_column(table, "token_hash", existing_type=sa.String(64), nullable=False)
        if not _has_index(table, f"ix_{table}_token_hash"):
            op.create_index(f"ix_{table}_token_hash", table, ["token_hash"], unique=True)
        if _has_column(table, "token"):
            # Dropping the column drops its unique index or constraint with it.
            op.drop_column(table, "token")

    for name in _unique_constraints_on("device_tokens", ["token"]):
        op.drop_constraint(name, "device_tokens", type_="unique")
    for name in _unique_indexes_on("device_tokens", ["token"]):
        op.drop_index(name, table_name="device_tokens")
    if not _has_index("device_tokens", "ix_device_tokens_token"):
        op.create_index("ix_device_tokens_token", "device_tokens", ["token"], unique=False)
    if not _has_unique("device_tokens", "uq_device_tokens_user_token"):
        op.create_unique_constraint("uq_device_tokens_user_token", "device_tokens", ["user_id", "token"])


def downgrade():
    # Back to one row per token: keep the newest registration of each token.
    op.execute("DELETE FROM device_tokens a USING device_tokens b WHERE a.token = b.token AND a.id < b.id")
    if _has_unique("device_tokens", "uq_device_tokens_user_token"):
        op.drop_constraint("uq_device_tokens_user_token", "device_tokens", type_="unique")
    if not _unique_constraints_on("device_tokens", ["token"]):
        op.create_unique_constraint("uq_device_tokens_token", "device_tokens", ["token"])

    for table in TOKEN_TABLES:
        if not _has_column(table, "token"):
            op.add_column(table, sa.Column("token", sa.String(64), nullable=True))
        # The plaintext is gone for good: every row gets a fresh random token, so links
        # issued while this revision was live stop working after a downgrade.
        op.execute(f"UPDATE {table} SET token = md5(random()::text || id::text) || md5(id::text || clock_timestamp()::text) WHERE token IS NULL")
        op.alter_column(table, "token", existing_type=sa.String(64), nullable=False)
        if not _has_index(table, f"ix_{table}_token"):
            op.create_index(f"ix_{table}_token", table, ["token"], unique=True)
        if _has_index(table, f"ix_{table}_token_hash"):
            op.drop_index(f"ix_{table}_token_hash", table_name=table)
        if _has_column(table, "token_hash"):
            op.drop_column(table, "token_hash")
