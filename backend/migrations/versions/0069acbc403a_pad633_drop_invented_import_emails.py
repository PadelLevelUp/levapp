"""PAD-633 data repair: users the spreadsheet import gave an invented address lose it.

Until PAD-633 the import wrote `first_second@email.com` (suffixed `_2`, `_3`… when taken) for a
Players row without an email, and set the username to that address's local part. `email.com` is
a real public mail domain, so the address could belong to a stranger. Production holds 339 such
users, all `inactive` (counted 2026-10-11).

A row is in the import's shape when ALL of these hold: the email ends in `@email.com`, the
username equals its local part, and the account is `inactive`. A coach-typed `@email.com`
address carries a `pending-…` username and is never touched; so is any account that was ever
activated (`active`) or deleted (`disabled`).

Within that shape the password decides (production 2026-10-12: 176 NULL, 163 not NULL):
- NULL: repaired. The import has stored no password since 933d7827c (2026-06-09).
- the hash of "": repaired, and the password goes back to NULL. Before 933d7827c the import's
  User form hashed JsonRequestAdapter's empty default, so every import from 007041961
  (2026-03-03) to then got generate_password_hash(""). Nobody chose it; /api/app/login refuses
  an empty password, so it never opened the account. With it NULL the user is claimable and a
  placeholder like every other never-activated import.
- anything else: skipped and counted. Someone chose that password; a new username would lock
  them out, since login refuses only `disabled` accounts.

The repair sets `email` to NULL and gives the user a fresh `pending-<16 hex>` placeholder, the
username every coach-created player has (PAD-105), so the student chooses one at activation and
the account becomes claimable. The id, roster links and activation link are unchanged (the link
is derived from id and created_at).

Only matching rows are written, so a second run is a no-op. Downgrade does nothing: the invented
values were never worth restoring.

Revision ID: 0069acbc403a
Revises: 661763c8e361
"""
import secrets

import sqlalchemy as sa
from alembic import op
from werkzeug.security import check_password_hash

revision = "0069acbc403a"
down_revision = "661763c8e361"  # PAD-591
branch_labels = None
depends_on = None

INVENTED_DOMAIN = "@email.com"
PLACEHOLDER_PREFIX = "pending-"  # padel_app.tools.username_tools.PLACEHOLDER_USERNAME_PREFIX


def _invented(email, username):
    """True when (email, username) is what the import wrote for a row without an email."""
    if not email or not username or not email.lower().endswith(INVENTED_DOMAIN):
        return False
    return email.rsplit("@", 1)[0].lower() == username.lower()


def _never_chosen(password):
    """True for no password, or the hash of "" the import wrote before 933d7827c."""
    return password is None or check_password_hash(password, "")


def upgrade():
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, email, username, password FROM users WHERE lower(email) LIKE :domain AND status = 'inactive'"),
        {"domain": "%" + INVENTED_DOMAIN},
    ).all()
    shaped = [row for row in rows if _invented(row.email, row.username)]
    targets = [row for row in shaped if _never_chosen(row.password)]
    taken = {name for (name,) in conn.execute(sa.text("SELECT username FROM users")).all()}
    for row in targets:
        placeholder = f"{PLACEHOLDER_PREFIX}{secrets.token_hex(8)}"
        while placeholder in taken:
            placeholder = f"{PLACEHOLDER_PREFIX}{secrets.token_hex(8)}"
        taken.add(placeholder)
        conn.execute(
            sa.text("UPDATE users SET email = NULL, username = :username, password = NULL WHERE id = :id"),
            {"username": placeholder, "id": row.id},
        )
    empty_hash = sum(1 for row in targets if row.password is not None)
    print(
        f"PAD-633: removed the invented @email.com address from {len(targets)} user(s)"
        f" ({len(targets) - empty_hash} without a password, {empty_hash} with the empty-string hash);"
        f" skipped {len(shaped) - len(targets)} with a chosen password"
    )


def downgrade():
    pass
