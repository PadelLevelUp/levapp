"""PAD-531 (admin.foundation): admin_roles and admin_audit_log, seeded owners.

Rule 6: creates both tables and seeds one `owner` row for admin@levapp.app and one for the
lower-cased email of every user with is_superadmin = true (deduplicated), granted_by_email null.
Idempotent (prod schema drift memory): tables are created only when absent and a seeded email
that already has a row is skipped. `is_superadmin` is read here by design (the seed) and the
column is not dropped.

Revision ID: e4381787870f
Revises: 0d2107f3fa7b
"""
from datetime import datetime

import sqlalchemy as sa
from alembic import op

revision = "e4381787870f"
down_revision = "0d2107f3fa7b"
branch_labels = None
depends_on = None

SEED_OWNER = "admin@levapp.app"


def _tables(bind):
    return set(sa.inspect(bind).get_table_names())


def upgrade():
    bind = op.get_bind()
    tables = _tables(bind)

    if "admin_roles" not in tables:
        op.create_table(
            "admin_roles",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("email", sa.String(length=254), nullable=False),
            sa.Column("role", sa.String(length=16), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("granted_by_email", sa.String(length=254), nullable=True),
            sa.Column("granted_at", sa.DateTime(), nullable=False),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_admin_roles_email", "admin_roles", ["email"], unique=True)

    if "admin_audit_log" not in tables:
        op.create_table(
            "admin_audit_log",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("actor_email", sa.String(length=254), nullable=False),
            sa.Column("actor_role", sa.String(length=16), nullable=True),
            sa.Column("action", sa.String(length=64), nullable=False),
            sa.Column("target_type", sa.String(length=64), nullable=True),
            sa.Column("target_id", sa.String(length=64), nullable=True),
            sa.Column("before", sa.JSON(), nullable=True),
            sa.Column("after", sa.JSON(), nullable=True),
            sa.Column("request_id", sa.String(length=64), nullable=False),
            sa.Column("outcome", sa.String(length=16), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_admin_audit_log_created_at", "admin_audit_log", ["created_at"])
        op.create_index("ix_admin_audit_log_actor_email", "admin_audit_log", ["actor_email"])
        op.create_index("ix_admin_audit_log_action", "admin_audit_log", ["action"])
        op.create_index("ix_admin_audit_log_target", "admin_audit_log", ["target_type", "target_id"])

    # Seed (rule 6). Lower-cased, deduplicated; a non-company email is kept so the
    # owner sees it in the roles screen and revokes it (it can never sign in, rule 1).
    emails = {SEED_OWNER}
    rows = bind.execute(
        sa.text("SELECT email FROM users WHERE is_superadmin = :t AND email IS NOT NULL AND email <> ''"),
        {"t": True},
    ).fetchall()
    emails.update(r[0].strip().lower() for r in rows if r[0] and r[0].strip())
    existing = {r[0] for r in bind.execute(sa.text("SELECT email FROM admin_roles")).fetchall()}
    now = datetime.utcnow().replace(microsecond=0)
    for email in sorted(emails - existing):
        bind.execute(
            sa.text(
                "INSERT INTO admin_roles (email, role, user_id, granted_by_email, granted_at, revoked_at, created_at, updated_at) "
                "VALUES (:email, 'owner', (SELECT id FROM users WHERE lower(email) = :email LIMIT 1), NULL, :now, NULL, :now, :now)"
            ),
            {"email": email, "now": now},
        )


def downgrade():
    bind = op.get_bind()
    tables = _tables(bind)
    if "admin_audit_log" in tables:
        op.drop_table("admin_audit_log")
    if "admin_roles" in tables:
        op.drop_table("admin_roles")
