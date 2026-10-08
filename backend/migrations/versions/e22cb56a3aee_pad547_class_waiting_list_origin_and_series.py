"""PAD-547: who put a student on a class's waiting list, and standing entries scoped to a series

Revision ID: e22cb56a3aee
Revises: bee8d57daf79
Create Date: 2026-10-07

- ``waiting_list_entries.added_by`` (String(8), nullable): 'student' | 'coach' — the origin of a
  row that did not come from a standing entry (notifications.waiting-list rule 20). NULL on older
  rows, which read as the student's own.
- ``standing_waiting_list_entries.lesson_id`` (FK lessons, nullable, CASCADE): a standing entry
  scoped to one series (rule 19); NULL keeps the coach-wide reach.
- The one-active-entry index becomes one active entry per coach, player AND scope:
  ``uq_standing_entries_active_coach_player`` (coach_id, player_id) WHERE is_active is replaced by
  ``uq_standing_entries_active_coach_player_scope`` (coach_id, player_id, COALESCE(lesson_id, 0))
  WHERE is_active.

Idempotent: each step checks what is there first.
"""
import sqlalchemy as sa
from alembic import op

revision = "e22cb56a3aee"
down_revision = "bee8d57daf79"
branch_labels = None
depends_on = None

OLD_INDEX = "uq_standing_entries_active_coach_player"
NEW_INDEX = "uq_standing_entries_active_coach_player_scope"


def _columns(table):
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _indexes(table):
    return {i["name"] for i in sa.inspect(op.get_bind()).get_indexes(table)}


def upgrade():
    if "added_by" not in _columns("waiting_list_entries"):
        op.add_column("waiting_list_entries", sa.Column("added_by", sa.String(8), nullable=True))
    if "lesson_id" not in _columns("standing_waiting_list_entries"):
        with op.batch_alter_table("standing_waiting_list_entries") as batch:
            batch.add_column(sa.Column("lesson_id", sa.Integer(), nullable=True))
            batch.create_foreign_key(
                "standing_waiting_list_entries_lesson_id_fkey", "lessons", ["lesson_id"], ["id"], ondelete="CASCADE"
            )
    indexes = _indexes("standing_waiting_list_entries")
    if OLD_INDEX in indexes:
        op.drop_index(OLD_INDEX, table_name="standing_waiting_list_entries")
    if NEW_INDEX not in indexes:
        op.create_index(
            NEW_INDEX, "standing_waiting_list_entries",
            ["coach_id", "player_id", sa.text("COALESCE(lesson_id, 0)")], unique=True,
            postgresql_where=sa.text("is_active"), sqlite_where=sa.text("is_active"),
        )


def downgrade():
    indexes = _indexes("standing_waiting_list_entries")
    if NEW_INDEX in indexes:
        op.drop_index(NEW_INDEX, table_name="standing_waiting_list_entries")
    if "lesson_id" in _columns("standing_waiting_list_entries"):
        # Series-scoped entries cannot survive the old one-per-coach-and-player index. Their
        # fanned-out rows go first, or SET NULL would leave them looking like student requests.
        op.execute(
            "UPDATE waiting_list_entries SET is_active = false WHERE standing_entry_id IN "
            "(SELECT id FROM standing_waiting_list_entries WHERE lesson_id IS NOT NULL)"
        )
        op.execute("DELETE FROM standing_waiting_list_entries WHERE lesson_id IS NOT NULL")
        with op.batch_alter_table("standing_waiting_list_entries") as batch:
            batch.drop_constraint("standing_waiting_list_entries_lesson_id_fkey", type_="foreignkey")
            batch.drop_column("lesson_id")
    if OLD_INDEX not in _indexes("standing_waiting_list_entries"):
        op.create_index(
            OLD_INDEX, "standing_waiting_list_entries", ["coach_id", "player_id"], unique=True,
            postgresql_where=sa.text("is_active"), sqlite_where=sa.text("is_active"),
        )
    if "added_by" in _columns("waiting_list_entries"):
        with op.batch_alter_table("waiting_list_entries") as batch:
            batch.drop_column("added_by")
