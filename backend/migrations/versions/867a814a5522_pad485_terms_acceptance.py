"""PAD-485: the Terms acceptance a self-registration records

Revision ID: 867a814a5522
Revises: b3a1c474d07b
Create Date: 2026-10-02

Adds two nullable columns to ``users`` (auth.register rule 19): ``terms_accepted_at`` (UTC, naive, the
moment the sign-up was accepted) and ``terms_version`` (the Terms page's effective date, e.g.
``2026-07-14``). Only new self-registrations from a client declaring ``terms-acceptance`` write them;
every existing row stays NULL and nothing is backfilled. No index, no default.
Idempotent: each ADD COLUMN is skipped when it already exists (prod schema drift), and the downgrade
drops only what is there. Promotion gate: dry-run on a prod-shaped copy before the deploy.
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "867a814a5522"
down_revision = "b3a1c474d07b"
branch_labels = None
depends_on = None

TABLE = "users"
COLUMNS = (
    ("terms_accepted_at", sa.DateTime()),
    ("terms_version", sa.String(length=32)),
)


def _has_column(name: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(col["name"] == name for col in inspector.get_columns(TABLE))


def upgrade():
    for name, type_ in COLUMNS:
        if not _has_column(name):
            op.add_column(TABLE, sa.Column(name, type_, nullable=True))


def downgrade():
    for name, _type in reversed(COLUMNS):
        if _has_column(name):
            op.drop_column(TABLE, name)
