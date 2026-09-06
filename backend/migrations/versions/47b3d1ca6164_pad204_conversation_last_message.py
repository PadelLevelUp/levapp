"""PAD-204: denormalise the conversation's last message, index the messaging access paths

Listing conversations sorted `conversation.messages` in Python to find the last
one and to count unread, and ordered the page by a correlated
`MAX(messages.sent_at)` subquery — over a `messages` table with no index on
`conversation_id`. Twenty threads of a few hundred reminder messages each is
thousands of ORM objects and a full scan per list page, on a 192 MB instance.

This revision gives `conversations` the two columns that make the list a plain
column sort (`messaging.conversations` rules 11-12), and adds the four
constraints/indexes the messaging access paths always needed
(`messaging.conversations` Entities, rule 13).

Order matters, and it is the order below:

1. add both columns nullable — a table this size cannot take a NOT NULL
   backfill in one statement, and "no messages yet" is a real state anyway;
2. add the foreign key SEPARATELY from the column. `conversations.last_message_id`
   references `messages.id` while `messages.conversation_id` references
   `conversations.id`, so the two tables are mutually dependent. Adding the
   constraint on its own (`use_alter`-style, which is also how the model
   declares it) keeps that cycle out of any single DDL statement;
3. backfill from the newest message per conversation;
4. de-duplicate `conversation_participants` BEFORE the unique constraint —
   the constraint cannot be created over existing duplicates, and duplicates
   are exactly what rule 13 exists to stop being created again;
5. the unique constraint, then the indexes.

The pytest suite builds its schema with `create_all` on SQLite, so it exercises
the model definitions rather than this file — the models carry the same columns,
constraint and indexes so the two schemas do not drift.

Revision ID: 47b3d1ca6164
Revises: f1a2b3c4d5e6
Create Date: 2026-09-06
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect


# Every DDL step below is guarded, so the revision can be applied to a database
# that already carries part of it. That is not hypothetical: staging is copied
# from prod on every deploy (PAD-200), and prod already had
# `ix_messages_conversation_id_sent_at` and `ix_messages_sender_id` without any
# migration recording them, so the first staging deploy of this revision died
# on DuplicateTable and crash-looped the container. The UPDATE and DELETE are
# idempotent by construction; the guards make the DDL match.
def _inspector():
    return sa_inspect(op.get_bind())


def _has_column(table, name):
    return name in {c["name"] for c in _inspector().get_columns(table)}


def _has_index(table, name):
    return name in {i["name"] for i in _inspector().get_indexes(table)}


def _has_unique(table, name):
    return name in {u["name"] for u in _inspector().get_unique_constraints(table)}


def _has_fk(table, name):
    return name in {f["name"] for f in _inspector().get_foreign_keys(table)}

revision = "47b3d1ca6164"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    # 1 + 2 — the denormalised pointer, and its constraint added separately so
    # the conversations <-> messages cycle never lands in one statement.
    if not _has_column("conversations", "last_message_at"):
        op.add_column(
            "conversations", sa.Column("last_message_at", sa.DateTime(), nullable=True)
        )
    if not _has_column("conversations", "last_message_id"):
        op.add_column(
            "conversations", sa.Column("last_message_id", sa.Integer(), nullable=True)
        )
    if not _has_fk("conversations", "fk_conversations_last_message_id"):
        op.create_foreign_key(
            "fk_conversations_last_message_id",
            "conversations",
            "messages",
            ["last_message_id"],
            ["id"],
            ondelete="SET NULL",
        )

    # 3 — backfill: the newest message per conversation. `DISTINCT ON` takes the
    # first row of each ordered group, and the `id DESC` tie-break makes the
    # choice deterministic when two messages share a `sent_at` (system messages
    # written in the same job commonly do).
    op.execute(
        """
        UPDATE conversations AS c
        SET last_message_id = newest.id,
            last_message_at = newest.sent_at
        FROM (
            SELECT DISTINCT ON (conversation_id)
                   conversation_id, id, sent_at
            FROM messages
            ORDER BY conversation_id, sent_at DESC, id DESC
        ) AS newest
        WHERE newest.conversation_id = c.id
        """
    )

    # 4 — drop duplicate participant rows, keeping the lowest id per pair. The
    # lowest id is the original row; anything above it is a re-insert, and its
    # `last_read_at` is by definition never the one the app has been writing to.
    op.execute(
        """
        DELETE FROM conversation_participants
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM conversation_participants
            GROUP BY conversation_id, user_id
        )
        """
    )

    # 5 — the constraint rule 13 asks for, then the access-path indexes.
    if not _has_unique("conversation_participants", "uq_conversation_participant"):
        op.create_unique_constraint(
            "uq_conversation_participant",
            "conversation_participants",
            ["conversation_id", "user_id"],
        )
    for name, table, cols in (
        ("ix_conversation_participants_user_id", "conversation_participants", ["user_id"]),
        ("ix_messages_conversation_id_sent_at", "messages", ["conversation_id", "sent_at"]),
        ("ix_messages_sender_id", "messages", ["sender_id"]),
    ):
        if not _has_index(table, name):
            op.create_index(name, table, cols)


def downgrade():
    for name, table in (
        ("ix_messages_sender_id", "messages"),
        ("ix_messages_conversation_id_sent_at", "messages"),
        ("ix_conversation_participants_user_id", "conversation_participants"),
    ):
        if _has_index(table, name):
            op.drop_index(name, table_name=table)
    if _has_unique("conversation_participants", "uq_conversation_participant"):
        op.drop_constraint(
            "uq_conversation_participant",
            "conversation_participants",
            type_="unique",
        )
    # The de-duplication in step 4 is not reversible — the rows it removed were
    # duplicates of rows that remain, and re-creating them would only re-break
    # what rule 13 fixed.
    if _has_fk("conversations", "fk_conversations_last_message_id"):
        op.drop_constraint(
            "fk_conversations_last_message_id", "conversations", type_="foreignkey"
        )
    for col in ("last_message_id", "last_message_at"):
        if _has_column("conversations", col):
            op.drop_column("conversations", col)
