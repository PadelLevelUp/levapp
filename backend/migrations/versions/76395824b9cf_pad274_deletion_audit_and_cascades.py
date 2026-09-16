"""PAD-274: deletion_audit table; ON DELETE CASCADE asserted on the keys passive deletes rely on

Revision ID: 76395824b9cf
Revises: 501dcb2c12f5
Create Date: 2026-09-10

Two changes. Both are guarded, so the revision is idempotent, and it never
deletes data.

1. `deletion_audit`: one row per delete that has no undo, recorded before
   the delete (players.remove, evaluations.categories; B-057, audit M15b).
2. PAD-274 moved 38 ORM relationships to `passive_deletes=True`. The ORM no
   longer walks the children; it trusts the database to cascade them. On a
   database built by these migrations every one of those keys is already
   ON DELETE CASCADE. Staging is a copy of prod, which carries objects no
   migration created (PAD-200/220), so each key is checked BY COLUMN and
   rewritten to CASCADE only if it is not. A missing key is added only when no
   row points at a missing parent; otherwise it is skipped with a
   "PAD-274: SKIPPED" warning. On a matching database this step changes nothing.

Downgrade drops the table. It leaves the delete rules as CASCADE, because the
models declare them that way.
"""
import logging

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "76395824b9cf"
down_revision = "501dcb2c12f5"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

#: (child table, key column, parent table) for every relationship PAD-274 made passive.
CASCADED = (
    ("evaluation_entries", "coach_player_id", "coach_in_player"),
    ("coach_player_notes", "coach_player_id", "coach_in_player"),
    ("coach_in_club", "club_id", "clubs"),
    ("courts", "club_id", "clubs"),
    ("lessons", "club_id", "clubs"),
    ("player_in_club", "club_id", "clubs"),
    ("coach_in_club", "coach_id", "coaches"),
    ("evaluation_categories", "coach_id", "coaches"),
    ("coach_exercise_group", "coach_id", "coaches"),
    ("coach_exercise", "coach_id", "coaches"),
    ("coach_in_lesson_instance", "coach_id", "coaches"),
    ("coach_in_lesson", "coach_id", "coaches"),
    ("coach_levels", "coach_id", "coaches"),
    ("exercise_groups", "owner_coach_id", "coaches"),
    ("exercises", "owner_coach_id", "coaches"),
    ("player_level_history", "coach_id", "coaches"),
    ("coach_in_player", "coach_id", "coaches"),
    ("coach_seasons", "coach_id", "coaches"),
    ("messages", "conversation_id", "conversations"),
    ("conversation_participants", "conversation_id", "conversations"),
    ("evaluation_entries", "category_id", "evaluation_categories"),
    ("coach_exercise", "exercise_id", "exercises"),
    ("coach_exercise_group", "exercise_group_id", "exercise_groups"),
    ("images", "imageable_id", "imageables"),
    ("coach_in_lesson", "lesson_id", "lessons"),
    ("lesson_instances", "lesson_id", "lessons"),
    ("player_in_lesson", "lesson_id", "lessons"),
    ("coach_in_lesson_instance", "lesson_instance_id", "lesson_instances"),
    ("player_in_lesson_instance", "lesson_instance_id", "lesson_instances"),
    ("presences", "lesson_instance_id", "lesson_instances"),
    ("message_reactions", "message_id", "messages"),
    ("player_in_club", "player_id", "players"),
    ("coach_in_player", "player_id", "players"),
    ("player_in_lesson_instance", "player_id", "players"),
    ("player_in_lesson", "player_id", "players"),
    ("player_level_history", "player_id", "players"),
    ("presences", "player_id", "players"),
    ("messages", "sender_id", "users"),
)


def _inspector():
    return sa_inspect(op.get_bind())


def _fk(table, column, parent):
    for fk in _inspector().get_foreign_keys(table):
        if fk["constrained_columns"] == [column] and fk["referred_table"] == parent:
            return fk
    return None


def _parent_key(parent):
    return "imageable_id" if parent == "imageables" else "id"


def _orphans(table, column, parent):
    """Rows whose key points at no parent. A new foreign key would refuse them,
    and this migration never fails on data, so such a key is skipped and logged."""
    # Table and column names come from CASCADED above, never from input.
    return op.get_bind().execute(sa.text(
        f"SELECT count(*) FROM {table} c WHERE c.{column} IS NOT NULL "
        f"AND NOT EXISTS (SELECT 1 FROM {parent} p WHERE p.{_parent_key(parent)} = c.{column})"
    )).scalar()


def upgrade():
    insp = _inspector()

    # 1. The audit table (created_at/updated_at come from the model mixin).
    if not insp.has_table("deletion_audit"):
        op.create_table(
            "deletion_audit",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("entity", sa.String(length=40), nullable=False),
            sa.Column("entity_id", sa.Integer(), nullable=False),
            sa.Column("action", sa.String(length=40), nullable=False),
            sa.Column("label", sa.String(length=255), nullable=True),
            sa.Column("details", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_deletion_audit_entity", "deletion_audit", ["entity", "entity_id"])

    # 2. Every key the passive relationships rely on cascades in the database.
    for table, column, parent in CASCADED:
        if not _inspector().has_table(table):
            continue
        fk = _fk(table, column, parent)
        if fk is None:
            orphans = _orphans(table, column, parent)
            if orphans:
                log.warning("PAD-274: SKIPPED %s.%s: no foreign key to %s and %d orphan row(s); left as is", table, column, parent, orphans)
                continue
            log.warning("PAD-274: %s.%s had no foreign key to %s; adding one with ON DELETE CASCADE", table, column, parent)
        elif (fk.get("options") or {}).get("ondelete", "").upper() == "CASCADE":
            continue
        else:
            op.drop_constraint(fk["name"], table, type_="foreignkey")
        op.create_foreign_key(f"fk_{table}_{column}", table, parent, [column], [_parent_key(parent)], ondelete="CASCADE")


def downgrade():
    if _inspector().has_table("deletion_audit"):
        op.drop_index("ix_deletion_audit_entity", table_name="deletion_audit")
        op.drop_table("deletion_audit")
