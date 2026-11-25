"""PAD-753: ``push_subscriptions.endpoint``, one row per browser (auth.push-subscription rule 11).

Expand only (delivery.zero-downtime-deploy rule 12): the release before this one inserts rows with no
endpoint while the deploy rolls, so the column is nullable and its unique index ignores NULLs. The
per-user index stops being unique. The next revision fills the column.

- Upgrade: adds the column and ``ix_push_subscriptions_endpoint`` (unique), and makes
  ``ix_push_subscriptions_user_id`` a plain index.
- Downgrade: keeps each user's most recently updated row, drops the endpoint and puts the unique
  per-user index back.

Revision ID: a753b1c2d3e4
Revises: 32e30677a843
Create Date: 2026-11-25 10:30:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "a753b1c2d3e4"
down_revision = "32e30677a843"
branch_labels = None
depends_on = None

TABLE = "push_subscriptions"
USER_INDEX = "ix_push_subscriptions_user_id"
ENDPOINT_INDEX = "ix_push_subscriptions_endpoint"


def _columns():
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(TABLE)}


def _indexes():
    return {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(TABLE)}


def upgrade():
    if "endpoint" not in _columns():
        op.add_column(TABLE, sa.Column("endpoint", sa.Text(), nullable=True))
    if ENDPOINT_INDEX not in _indexes():
        op.create_index(ENDPOINT_INDEX, TABLE, ["endpoint"], unique=True)
    if USER_INDEX in _indexes():
        op.drop_index(USER_INDEX, table_name=TABLE)
    op.create_index(USER_INDEX, TABLE, ["user_id"], unique=False)


def downgrade():
    bind = op.get_bind()
    seen, extra = set(), []
    for row_id, user_id in bind.execute(sa.text(
        "SELECT id, user_id FROM push_subscriptions "
        "ORDER BY CASE WHEN updated_at IS NULL THEN 1 ELSE 0 END, updated_at DESC, id DESC"
    )).all():
        if user_id in seen:
            extra.append(row_id)
        seen.add(user_id)
    for row_id in extra:
        bind.execute(sa.text("DELETE FROM push_subscriptions WHERE id = :id"), {"id": row_id})
    if USER_INDEX in _indexes():
        op.drop_index(USER_INDEX, table_name=TABLE)
    op.create_index(USER_INDEX, TABLE, ["user_id"], unique=True)
    if ENDPOINT_INDEX in _indexes():
        op.drop_index(ENDPOINT_INDEX, table_name=TABLE)
    if "endpoint" in _columns():
        with op.batch_alter_table(TABLE) as batch:
            batch.drop_column("endpoint")
