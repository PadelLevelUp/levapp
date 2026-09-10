"""PAD-207: reminder state out of messages.msg_metadata into reminder_attempts

Revision ID: 358e03e9a3a9
Revises: ad97ec649746
Create Date: 2026-09-10

notifications.reminders rule 14 (audit M6). Idempotent: the table is created
only if absent, and the backfill inserts one row per existing
`notification_reminder` message that has no row yet, reading the row's fields
out of the message's JSON metadata in Python (portable across Postgres and
SQLite — no JSON operators). The player is the conversation participant who is
not the sender (the coach sends reminders). Messages whose metadata carries no
instance id are skipped (nothing to key on). No behaviour change.
"""
import json
from datetime import datetime

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "358e03e9a3a9"
down_revision = "ad97ec649746"
branch_labels = None
depends_on = None


def attempt_from_metadata(metadata, *, sent_at):
    """The row fields for one reminder message, or None when the metadata does
    not name an instance. Pure; unit-tested."""
    if not isinstance(metadata, dict):
        return None
    instance_id = metadata.get("lessonInstanceId") or metadata.get("instanceId")
    if instance_id is None:
        return None
    responded = bool(metadata.get("responded"))
    return dict(
        lesson_instance_id=int(instance_id),
        number=int(metadata.get("reminderNumber") or 1),
        responded_at=sent_at if responded else None,
        response=metadata.get("response") if responded else None,
        superseded=bool(metadata.get("superseded")),
        expired=bool(metadata.get("expired")),
    )


def _has_table(bind, name):
    return sa.inspect(bind).has_table(name)


def upgrade():
    bind = op.get_bind()
    if not _has_table(bind, "reminder_attempts"):
        op.create_table(
            "reminder_attempts",
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("lesson_instance_id", sa.Integer(), nullable=False),
            sa.Column("player_id", sa.Integer(), nullable=False),
            sa.Column("presence_id", sa.Integer(), nullable=True),
            sa.Column("number", sa.Integer(), nullable=False),
            sa.Column("message_id", sa.Integer(), nullable=True),
            sa.Column("sent_at", sa.DateTime(), nullable=True),
            sa.Column("responded_at", sa.DateTime(), nullable=True),
            sa.Column("response", sa.String(length=20), nullable=True),
            sa.Column("superseded", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("expired", sa.Boolean(), nullable=False, server_default="0"),
            sa.ForeignKeyConstraint(["lesson_instance_id"], ["lesson_instances.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["player_id"], ["players.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["presence_id"], ["presences.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="SET NULL"),
        )
        op.create_index("ix_reminder_attempts_instance_player", "reminder_attempts", ["lesson_instance_id", "player_id"])

    if not (_has_table(bind, "messages") and _has_table(bind, "conversation_participants") and _has_table(bind, "players")):
        return

    # Backfill: reminder messages without a row yet.
    rows = bind.execute(
        sa.text(
            "SELECT m.id, m.sent_at, m.sender_id, m.conversation_id, m.msg_metadata FROM messages m "
            "WHERE m.message_type = 'notification_reminder' "
            "AND m.id NOT IN (SELECT message_id FROM reminder_attempts WHERE message_id IS NOT NULL) "
            "ORDER BY m.id"
        )
    ).fetchall()
    now = datetime.utcnow()
    for message_id, sent_at, sender_id, conversation_id, raw in rows:
        metadata = raw if isinstance(raw, dict) else (json.loads(raw) if isinstance(raw, str) and raw else None)
        fields = attempt_from_metadata(metadata, sent_at=sent_at)
        if fields is None:
            continue
        player = bind.execute(
            sa.text(
                "SELECT p.id FROM conversation_participants cp JOIN players p ON p.user_id = cp.user_id "
                "WHERE cp.conversation_id = :conv AND cp.user_id <> :sender LIMIT 1"
            ),
            dict(conv=conversation_id, sender=sender_id),
        ).fetchone()
        if player is None:
            continue
        presence = bind.execute(
            sa.text("SELECT id FROM presences WHERE lesson_instance_id = :inst AND player_id = :player LIMIT 1"),
            dict(inst=fields["lesson_instance_id"], player=player[0]),
        ).fetchone()
        bind.execute(
            sa.text(
                "INSERT INTO reminder_attempts (created_at, updated_at, lesson_instance_id, player_id, presence_id, number, "
                "message_id, sent_at, responded_at, response, superseded, expired) VALUES (:created_at, :updated_at, "
                ":lesson_instance_id, :player_id, :presence_id, :number, :message_id, :sent_at, :responded_at, :response, "
                ":superseded, :expired)"
            ),
            dict(
                created_at=now,
                updated_at=now,
                player_id=player[0],
                presence_id=presence[0] if presence else None,
                message_id=message_id,
                sent_at=sent_at,
                **fields,
            ),
        )


def downgrade():
    bind = op.get_bind()
    if _has_table(bind, "reminder_attempts"):
        op.drop_index("ix_reminder_attempts_instance_player", table_name="reminder_attempts")
        op.drop_table("reminder_attempts")
