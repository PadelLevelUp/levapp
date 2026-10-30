"""PAD-781: store every users.email trimmed and lower-cased (auth.password-recovery rule 12).

Every lookup by email compares a trimmed, lower-cased address with ``lower(users.email)``, so a
stored address with a space around it never matched: password recovery answered its 200 and sent
nothing, and login by email failed. The writers now normalise (``utils/emails.normalise_email``);
this rewrites the rows written before them.

- Idempotent: a row already in normalised form is never touched, so a second run changes nothing.
- Never collides: a row whose normalised form another account already holds (``users.email`` is
  unique, case-sensitively) is left as it is.
- A blank address (only spaces) is left as it is: normalising it would make it null, which is a
  different question from its form.
- Reversible: each original value it changes is kept in ``pad781_email_originals`` (an operational
  table no model declares; ``alembic_filters.EXTERNAL_TABLES`` keeps autogenerate off it). The
  downgrade puts back every original whose row still holds the normalised form, then drops the table.
- Pending recovery and verification codes stay valid: both are bound to the trimmed, lower-cased
  address (rule 11), which this does not change.

Revision ID: 13395db9fee4
Revises: c4e1a7d2f771
Create Date: 2026-10-30 09:45:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "13395db9fee4"
down_revision = "c4e1a7d2f771"  # PAD-771 notification_config_changes
branch_labels = None
depends_on = None

ORIGINALS = "pad781_email_originals"

_CREATE = (
    f"CREATE TABLE IF NOT EXISTS {ORIGINALS} ("
    " user_id INTEGER PRIMARY KEY,"
    " original_email VARCHAR(120) NOT NULL)"
)

_KEEP_ORIGINALS = f"""
INSERT INTO {ORIGINALS} (user_id, original_email)
SELECT u.id, u.email FROM users u
WHERE u.email IS NOT NULL
  AND trim(u.email) <> ''
  AND u.email <> lower(trim(u.email))
  AND NOT EXISTS (SELECT 1 FROM users o
                  WHERE o.id <> u.id AND o.email IS NOT NULL
                    AND lower(trim(o.email)) = lower(trim(u.email)))
  AND NOT EXISTS (SELECT 1 FROM {ORIGINALS} b WHERE b.user_id = u.id)
"""

_NORMALISE = f"""
UPDATE users SET email = lower(trim(email))
WHERE id IN (SELECT user_id FROM {ORIGINALS})
  AND email IS NOT NULL
  AND email <> lower(trim(email))
"""

_RESTORE = f"""
UPDATE users SET email = (SELECT b.original_email FROM {ORIGINALS} b WHERE b.user_id = users.id)
WHERE id IN (SELECT b.user_id FROM {ORIGINALS} b
             WHERE users.email = lower(trim(b.original_email)))
"""


def normalise(bind):
    """The upgrade's work on `bind`; returns the number of rows it rewrote."""
    bind.execute(sa.text(_CREATE))
    bind.execute(sa.text(_KEEP_ORIGINALS))
    return bind.execute(sa.text(_NORMALISE)).rowcount


def restore(bind):
    """The downgrade's work on `bind`; returns the number of rows it put back."""
    if ORIGINALS not in sa.inspect(bind).get_table_names():
        return 0
    restored = bind.execute(sa.text(_RESTORE)).rowcount
    bind.execute(sa.text(f"DROP TABLE {ORIGINALS}"))
    return restored


def upgrade():
    normalise(op.get_bind())


def downgrade():
    restore(op.get_bind())
