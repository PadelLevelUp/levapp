"""PAD-796: drop ``pad781_email_originals`` (auth.password-recovery rule 12).

Revision 13395db9fee4 kept every email value it normalised in this side table so its downgrade could
put them back. The normalised rows are on prod and recovery was verified on them, so the copies of
email addresses go. No model declares the table and no code reads it, so dropping it is safe while
the previous release still runs.

- Upgrade: drops the table if it is there (a database that never ran 13395db9fee4's upgrade has none).
- Downgrade: a no-op. The originals are gone and cannot be put back; 13395db9fee4's downgrade is a
  no-op too.

Revision ID: f796ea7e680b
Revises: 56e434e584d3
Create Date: 2026-11-13 21:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "f796ea7e680b"
down_revision = "56e434e584d3"
branch_labels = None
depends_on = None

ORIGINALS = "pad781_email_originals"


def drop(bind):
    """The upgrade's work on `bind`."""
    bind.execute(sa.text(f"DROP TABLE IF EXISTS {ORIGINALS}"))


def upgrade():
    drop(op.get_bind())


def downgrade():
    # No-op: the dropped originals cannot be put back (PAD-796).
    pass
