"""PAD-753: fill ``push_subscriptions.endpoint`` from each row's JSON (auth.push-subscription rule 11).

Every row that can be sent to keeps working. A row with no readable endpoint cannot be: it is deleted
and counted in the log (expected 0). Of two rows with one endpoint (one browser saved under two
accounts) the most recently updated stays. The log carries counts only: an endpoint is a capability
(B-254). A row already filled is left alone, so running it again changes nothing.

Downgrade changes nothing: the revision before this one drops the column.

Revision ID: b753c2d3e4f5
Revises: a753b1c2d3e4
Create Date: 2026-11-25 10:35:00.000000
"""
import json
import logging

from alembic import op
import sqlalchemy as sa


revision = "b753c2d3e4f5"
down_revision = "a753b1c2d3e4"
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")


def _endpoint(subscription_json):
    try:
        endpoint = json.loads(subscription_json)["endpoint"]
    except (ValueError, TypeError, KeyError):
        return None
    # The API's own limit (rule 10): a longer value does not fit the unique index.
    return endpoint if isinstance(endpoint, str) and 0 < len(endpoint.encode()) <= 2048 else None


def upgrade():
    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT id, subscription_json, endpoint FROM push_subscriptions "
        "ORDER BY CASE WHEN updated_at IS NULL THEN 1 ELSE 0 END, updated_at DESC, id DESC"
    )).all()
    taken = {endpoint for _, _, endpoint in rows if endpoint is not None}
    unreadable = duplicates = filled = 0
    for row_id, subscription_json, stored in rows:
        if stored is not None:
            continue
        endpoint = _endpoint(subscription_json)
        if endpoint is None or endpoint in taken:
            unreadable += endpoint is None
            duplicates += endpoint is not None
            bind.execute(sa.text("DELETE FROM push_subscriptions WHERE id = :id"), {"id": row_id})
            continue
        taken.add(endpoint)
        filled += 1
        bind.execute(sa.text("UPDATE push_subscriptions SET endpoint = :e WHERE id = :id"),
                     {"e": endpoint, "id": row_id})
    logger.info("PAD-753: %d push subscriptions filled, %d with no endpoint deleted, %d duplicates deleted",
                filled, unreadable, duplicates)


def downgrade():
    pass
