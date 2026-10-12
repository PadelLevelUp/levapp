"""PAD-639: a report keeps the reported text; deleted messages are erased

messaging.block-and-report rule 4a: `message_reports.message_text` holds a copy of the reported
text, backfilled here from the message row for every report filed before PAD-639.
messaging.messages rule 3: a deleted message keeps no content. Messages soft-deleted before
PAD-639 still held their text, metadata, attachment link and reactions; they are erased here,
AFTER the report backfill, so a reported message keeps its copy. The count erased is logged.

The erasure is not reversible: the downgrade drops the report column and restores nothing.
Images the erased attachments pointed at stay in `images` (no product path has ever written a
message attachment; deleting bucket objects is not a migration's job).

Revision ID: 4d61e34b9a19
Revises: 6aef46eb1421
Create Date: 2026-10-12 14:15:00.000000

"""
import logging

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4d61e34b9a19'
down_revision = '6aef46eb1421'
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

_NOT_YET_ERASED = (
    "is_deleted = true AND (text <> '' OR msg_metadata IS NOT NULL "
    "OR attachment_id IS NOT NULL OR edited = true)"
)


def _columns(bind, table):
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def upgrade():
    bind = op.get_bind()
    if "message_text" not in _columns(bind, "message_reports"):
        op.add_column("message_reports", sa.Column("message_text", sa.String(), nullable=True))

    # Rule 4a first: every report keeps what was reported, before anything is erased.
    backfilled = bind.execute(sa.text(
        "UPDATE message_reports SET message_text = "
        "(SELECT messages.text FROM messages WHERE messages.id = message_reports.message_id) "
        "WHERE message_text IS NULL"
    )).rowcount

    # Rule 3: messages deleted before PAD-639 lose their content now.
    reactions = bind.execute(sa.text(
        "DELETE FROM message_reactions WHERE message_id IN "
        "(SELECT id FROM messages WHERE is_deleted = true)"
    )).rowcount
    erased = bind.execute(sa.text(
        "UPDATE messages SET text = '', msg_metadata = NULL, attachment_id = NULL, edited = false "
        f"WHERE {_NOT_YET_ERASED}"
    )).rowcount
    message = (
        f"PAD-639: {backfilled} report(s) backfilled; erased {erased} deleted message(s) "
        f"and {reactions} reaction(s) on deleted messages"
    )
    log.info(message)
    print(message)


def downgrade():
    if "message_text" in _columns(op.get_bind(), "message_reports"):
        op.drop_column("message_reports", "message_text")
