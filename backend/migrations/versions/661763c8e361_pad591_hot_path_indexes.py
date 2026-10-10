"""PAD-591: four more hot-path indexes (the PAD-571 study)

Revision ID: 661763c8e361
Revises: 38891288dc5c
Create Date: 2026-10-10

- ``messages(message_type)`` — the messaging feed and the notification digests filter on it.
- ``conversations(last_message_at)`` — the conversation list orders by it (PAD-204 added the
  column without an index).
- ``lessons(start_datetime)`` — the calendar loaders bound lessons by start (calendar.view rule 19).
- ``lessons(club_id)`` — the foreign key every club-scoped class lookup and cascade walks.

Plain, guarded ``CREATE INDEX`` like PAD-263's ``cf030b78b088``: the tables are small, staging is a
prod copy (PAD-200), and prod has carried indexes no revision created, so each create and drop
checks what is there first. The models declare the same four (``index=True``), pinned by
``tests/test_pad591_hot_path_indexes.py``.
"""
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "661763c8e361"
down_revision = "38891288dc5c"
branch_labels = None
depends_on = None

# (name, table, columns)
INDEXES = (
    ("ix_messages_message_type", "messages", ("message_type",)),
    ("ix_conversations_last_message_at", "conversations", ("last_message_at",)),
    ("ix_lessons_start_datetime", "lessons", ("start_datetime",)),
    ("ix_lessons_club_id", "lessons", ("club_id",)),
)


def _has_index(table, name):
    # A fresh inspector per call: a shared one would not see an index created a moment earlier.
    return name in {i["name"] for i in sa_inspect(op.get_bind()).get_indexes(table)}


def upgrade():
    for name, table, columns in INDEXES:
        if not _has_index(table, name):
            op.create_index(name, table, list(columns))


def downgrade():
    for name, table, _columns in reversed(INDEXES):
        if _has_index(table, name):
            op.drop_index(name, table_name=table)
