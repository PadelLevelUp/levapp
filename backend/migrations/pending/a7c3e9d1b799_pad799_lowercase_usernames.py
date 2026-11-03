"""PAD-799: store every users.username trimmed and lowercased, and make it unique ignoring case
(auth.register rule 2a).

PENDING, NOT IN THE CHAIN. This file sits in ``migrations/pending/``, which Alembic does not load,
because every deploy runs ``flask db upgrade`` and this migration refuses while two accounts differ
only by case: in the chain it would fail the deploy. It lands once the owner has resolved those
accounts (PAD-799): move it to ``migrations/versions/``, set ``down_revision`` to the head at that
time, and declare the index on the ``User`` model in the same change.

- **Refuses** (raises, nothing written) while any two usernames are equal once trimmed and
  lowercased, or while any username fails the username rule (``[a-z0-9._-]{3,80}``) once trimmed
  and lowercased. The message names the account ids, never a username.
- Rewrites each username not already in that form; keeps each original in
  ``pad799_username_originals`` (an operational table no model declares), as PAD-781 did for email.
- Adds the unique index ``uq_users_username_lower`` on ``lower(username)``: two accounts can never
  again differ only by case.
- Downgrade: drops the index and puts back every original whose row still holds the rewritten form.

Revision ID: a7c3e9d1b799
Revises: 13395db9fee4 (the head when written; set to the head when it lands)
Create Date: 2026-11-03 12:45:00.000000
"""
import re

from alembic import op
import sqlalchemy as sa

revision = "a7c3e9d1b799"
down_revision = "13395db9fee4"
branch_labels = None
depends_on = None

ORIGINALS = "pad799_username_originals"
INDEX = "uq_users_username_lower"
RULE = re.compile(r"^[a-z0-9._-]{3,80}$")  # registration_service.USERNAME_RE, lowercase


class UsernameMigrationRefused(RuntimeError):
    """Raised by the gate; the message names account ids only."""


def blockers(bind) -> dict:
    """``{"collisions": [[ids], …], "invalid": [ids]}`` — what stops the migration."""
    rows = bind.execute(sa.text("SELECT id, username FROM users ORDER BY id")).fetchall()
    groups: dict = {}
    invalid = []
    for user_id, username in rows:
        key = (username or "").strip().lower()
        groups.setdefault(key, []).append(user_id)
        if not RULE.match(key):
            invalid.append(user_id)
    return {"collisions": [ids for ids in groups.values() if len(ids) > 1], "invalid": invalid}


def gate(bind) -> None:
    found = blockers(bind)
    if found["collisions"] or found["invalid"]:
        raise UsernameMigrationRefused(
            "PAD-799: usernames not lowercased. Accounts whose usernames are equal ignoring case: "
            f"{found['collisions'] or 'none'}; accounts whose username fails the rule once lowercased: "
            f"{found['invalid'] or 'none'}. Resolve them first (PAD-799)."
        )


def normalise(bind) -> int:
    """The upgrade's work on ``bind``; returns the number of usernames rewritten."""
    gate(bind)
    bind.execute(sa.text(
        f"CREATE TABLE IF NOT EXISTS {ORIGINALS} (user_id INTEGER PRIMARY KEY, original_username VARCHAR(80) NOT NULL)"
    ))
    bind.execute(sa.text(
        f"INSERT INTO {ORIGINALS} (user_id, original_username) SELECT id, username FROM users "
        f"WHERE username <> lower(trim(username)) AND id NOT IN (SELECT user_id FROM {ORIGINALS})"
    ))
    rewritten = bind.execute(sa.text(
        f"UPDATE users SET username = lower(trim(username)) WHERE id IN (SELECT user_id FROM {ORIGINALS}) "
        "AND username <> lower(trim(username))"
    )).rowcount
    bind.execute(sa.text(f"CREATE UNIQUE INDEX {INDEX} ON users (lower(username))"))
    return rewritten


def restore(bind) -> int:
    """The downgrade's work on ``bind``; returns the number of usernames put back."""
    bind.execute(sa.text(f"DROP INDEX IF EXISTS {INDEX}"))
    if ORIGINALS not in sa.inspect(bind).get_table_names():
        return 0
    restored = bind.execute(sa.text(
        f"UPDATE users SET username = (SELECT b.original_username FROM {ORIGINALS} b WHERE b.user_id = users.id) "
        f"WHERE id IN (SELECT b.user_id FROM {ORIGINALS} b WHERE users.username = lower(trim(b.original_username)))"
    )).rowcount
    bind.execute(sa.text(f"DROP TABLE {ORIGINALS}"))
    return restored


def upgrade():
    normalise(op.get_bind())


def downgrade():
    restore(op.get_bind())
