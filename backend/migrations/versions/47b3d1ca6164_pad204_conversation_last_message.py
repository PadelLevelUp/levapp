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

revision = "47b3d1ca6164"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    # 1 + 2 — the denormalised pointer, and its constraint added separately so
    # the conversations <-> messages cycle never lands in one statement.
    op.add_column(
        "conversations", sa.Column("last_message_at", sa.DateTime(), nullable=True)
    )
    op.add_column(
        "conversations", sa.Column("last_message_id", sa.Integer(), nullable=True)
    )
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
    op.create_unique_constraint(
        "uq_conversation_participant",
        "conversation_participants",
        ["conversation_id", "user_id"],
    )
    op.create_index(
        "ix_conversation_participants_user_id",
        "conversation_participants",
        ["user_id"],
    )
    op.create_index(
        "ix_messages_conversation_id_sent_at",
        "messages",
        ["conversation_id", "sent_at"],
    )
    op.create_index("ix_messages_sender_id", "messages", ["sender_id"])


def downgrade():
    op.drop_index("ix_messages_sender_id", table_name="messages")
    op.drop_index("ix_messages_conversation_id_sent_at", table_name="messages")
    op.drop_index(
        "ix_conversation_participants_user_id",
        table_name="conversation_participants",
    )
    op.drop_constraint(
        "uq_conversation_participant",
        "conversation_participants",
        type_="unique",
    )
    # The de-duplication in step 4 is not reversible — the rows it removed were
    # duplicates of rows that remain, and re-creating them would only re-break
    # what rule 13 fixed.
    op.drop_constraint(
        "fk_conversations_last_message_id", "conversations", type_="foreignkey"
    )
    op.drop_column("conversations", "last_message_id")
    op.drop_column("conversations", "last_message_at")
