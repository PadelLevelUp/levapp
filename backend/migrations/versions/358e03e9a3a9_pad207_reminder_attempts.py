"""PAD-207: reminder state out of messages.msg_metadata into reminder_attempts

Revision ID: 358e03e9a3a9
Revises: ad97ec649746
Create Date: 2026-09-10

notifications.reminders rule 14 (audit M6). Idempotent: the table is created
only if absent, and the backfill inserts one row per existing
`notification_reminder` message that has no row yet. The player is the
conversation participant who is not the sender (the coach sends reminders).
Messages whose metadata carries no instance id are skipped (nothing to key on),
and so are messages whose instance has since been deleted (B-059: the row would
break the foreign key). No behaviour change.

On Postgres the backfill is one INSERT … SELECT (B-059 follow-up). The per-row
loop below took about five minutes on the production VM for 8,371 reminders, and
the API is down while the entrypoint migrates. The statement reproduces
`attempt_from_metadata` in SQL: the same instance-id fallback, integer
conversion and truthiness. The one difference is that where Python would raise
on a non-numeric id, the statement skips the row. Other dialects (the SQLite
test suite) keep the loop, which reads the JSON in Python.
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


def _truthy(key):
    """SQL for Python's bool(metadata.get(key)) on the jsonb `md`."""
    v, t = f"md -> '{key}'", f"md ->> '{key}'"
    return (
        f"(CASE jsonb_typeof({v}) WHEN 'boolean' THEN ({t})::boolean "
        f"WHEN 'number' THEN ({t})::numeric <> 0 WHEN 'string' THEN {t} <> '' "
        f"WHEN 'array' THEN jsonb_array_length({v}) > 0 WHEN 'object' THEN {v} <> '{{}}'::jsonb "
        f"ELSE false END)"
    )


def _int_or_null(key):
    """SQL for Python's int(metadata.get(key)); NULL where int() would raise."""
    t = f"md ->> '{key}'"
    return (
        f"(CASE jsonb_typeof(md -> '{key}') WHEN 'number' THEN trunc(({t})::numeric)::int "
        f"WHEN 'string' THEN CASE WHEN {t} ~ '^ *[+-]?[0-9]+ *$' THEN btrim({t})::int END "
        f"WHEN 'boolean' THEN ({t})::boolean::int ELSE NULL END)"
    )


# attempt_from_metadata, the B-059 skip and the player/presence lookups as one
# SELECT. Its columns are the INSERT's, in order.
BACKFILL_SELECT = f"""
SELECT (now() AT TIME ZONE 'utc') AS created_at, (now() AT TIME ZONE 'utc') AS updated_at,
       r.inst AS lesson_instance_id, pl.player_id, pr.id AS presence_id, r.number,
       r.message_id, r.sent_at,
       CASE WHEN r.responded THEN r.sent_at END AS responded_at,
       CASE WHEN r.responded THEN r.response END AS response,
       r.superseded, r.expired
FROM (
    SELECT m.id AS message_id, m.sent_at, m.sender_id, m.conversation_id,
           CASE WHEN {_truthy('lessonInstanceId')} THEN {_int_or_null('lessonInstanceId')}
                ELSE {_int_or_null('instanceId')} END AS inst,
           CASE WHEN {_truthy('reminderNumber')} THEN coalesce({_int_or_null('reminderNumber')}, 1)
                ELSE 1 END AS number,
           {_truthy('responded')} AS responded,
           md ->> 'response' AS response,
           {_truthy('superseded')} AS superseded,
           {_truthy('expired')} AS expired
    FROM messages m
    CROSS JOIN LATERAL (SELECT m.msg_metadata::jsonb AS md) j
    WHERE m.message_type = 'notification_reminder'
      AND jsonb_typeof(j.md) = 'object'
      AND NOT EXISTS (SELECT 1 FROM reminder_attempts ra WHERE ra.message_id = m.id)
) r
JOIN lesson_instances li ON li.id = r.inst
CROSS JOIN LATERAL (
    SELECT p.id AS player_id
    FROM conversation_participants cp JOIN players p ON p.user_id = cp.user_id
    WHERE cp.conversation_id = r.conversation_id AND cp.user_id <> r.sender_id
    ORDER BY p.id LIMIT 1
) pl
LEFT JOIN LATERAL (
    SELECT pz.id FROM presences pz
    WHERE pz.lesson_instance_id = r.inst AND pz.player_id = pl.player_id
    ORDER BY pz.id LIMIT 1
) pr ON true
ORDER BY r.message_id
"""

BACKFILL_INSERT = (
    "INSERT INTO reminder_attempts (created_at, updated_at, lesson_instance_id, player_id, "
    "presence_id, number, message_id, sent_at, responded_at, response, superseded, expired)"
    + BACKFILL_SELECT
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

    if bind.dialect.name == "postgresql":
        # B-059 follow-up: one set-based statement instead of three queries a row.
        bind.execute(sa.text(BACKFILL_INSERT))
        return

    # Backfill (other dialects): reminder messages without a row yet.
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
        # B-059: a reminder whose class was deleted since names an instance that is
        # gone. The table cascades on instance delete, so such a row could not
        # exist; inserting it broke the FK and rolled back the whole deploy.
        if bind.execute(
            sa.text("SELECT 1 FROM lesson_instances WHERE id = :inst"),
            dict(inst=fields["lesson_instance_id"]),
        ).fetchone() is None:
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
