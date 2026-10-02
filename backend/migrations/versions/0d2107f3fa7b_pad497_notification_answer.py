"""PAD-497: the answer a student gave to an invitation

Revision ID: 0d2107f3fa7b
Revises: b3a1c474d07b
Create Date: 2026-10-02

Adds ``answer`` (String(8), nullable: 'yes' | 'no') to ``notification_events``
(notifications.invitations rule 18). Until now a "no" left only ``status = 'expired'``, which
retirement, class expiry and a refused yes also leave, plus the invite message's
``msg_metadata.response``; the rule needs the answer itself.

Backfill: ``answer = 'no'`` from the invite message's recorded response, for classes that have not
started only (a past class can no longer be invited to), and only where ``answer`` is still NULL,
so a second run changes nothing. Idempotent: the column is added only when absent.
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0d2107f3fa7b"
down_revision = "b3a1c474d07b"
branch_labels = None
depends_on = None

TABLE = "notification_events"
COLUMN = "answer"


def _has_column() -> bool:
    inspector = sa.inspect(op.get_bind())
    return any(col["name"] == COLUMN for col in inspector.get_columns(TABLE))


def _backfill() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        response = "m.msg_metadata ->> 'response'"
        # Class times are club wall-clock (R-023, CLUB_TZ = Europe/Lisbon), so compare with the
        # club's now, not UTC's (#513 review F6). SQLite (tests only) has no zone database.
        now = "(now() AT TIME ZONE 'Europe/Lisbon')"
    else:
        response = "json_extract(m.msg_metadata, '$.response')"
        # SQLite runs only in tests: it has no zone database, so this compares in UTC — up to an
        # hour off the club's clock, which no test relies on.
        now = "datetime('now')"
    bind.execute(sa.text(f"""
        UPDATE notification_events SET answer = 'no'
         WHERE answer IS NULL
           AND id IN (
               SELECT ne.id FROM notification_events ne
                 JOIN messages m ON m.id = ne.message_id
                 JOIN lesson_instances li ON li.id = ne.lesson_instance_id
                WHERE {response} = 'no' AND li.start_datetime > {now})
    """))


def upgrade():
    if not _has_column():
        op.add_column(TABLE, sa.Column(COLUMN, sa.String(length=8), nullable=True))
    _backfill()


def downgrade():
    if _has_column():
        op.drop_column(TABLE, COLUMN)
