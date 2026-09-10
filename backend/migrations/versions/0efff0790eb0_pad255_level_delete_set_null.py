"""PAD-255: deleting a level (or a coach) unassigns, never deletes (audit C2, H7)

Six foreign keys were NO ACTION: four that point at `coach_levels`
(`coach_in_player.level_id`, `lessons.default_level_id`,
`lesson_instances.level_id`, `vacancies.level_id`) and the two
`invited_by_coach_id` columns on the invitation tables. With those, deleting a
level 500'd the moment a class referenced it, and the ORM-side cascade that
"fixed" that for the roster deleted the players' records instead
(`levels.coach-levels` rule 11). Deleting a coach was impossible while any
invitation they sent still existed.

Every one becomes ON DELETE SET NULL. Each step is guarded: the constraint is
found by column through the inspector (prod's names are whatever `create_all`
gave them years ago), skipped when it already says SET NULL, and recreated
under a stable name otherwise — so the revision can run on a database that
already carries part of it (staging is a prod copy per deploy, PAD-200).

The pytest suite builds its schema with `create_all` on SQLite, so it exercises
the model definitions rather than this file; the models carry the same
`ondelete` values so the two schemas do not drift.

Revision ID: 0efff0790eb0
Revises: ad97ec649746
Create Date: 2026-09-10
"""

from alembic import op
from sqlalchemy import inspect as sa_inspect


revision = "0efff0790eb0"
down_revision = "ad97ec649746"
branch_labels = None
depends_on = None

#: (table, column, referred table) — every FK this revision rewrites.
TARGETS = (
    ("coach_in_player", "level_id", "coach_levels"),
    ("lessons", "default_level_id", "coach_levels"),
    ("lesson_instances", "level_id", "coach_levels"),
    ("vacancies", "level_id", "coach_levels"),
    ("coach_invitations", "invited_by_coach_id", "coaches"),
    ("player_invitations", "invited_by_coach_id", "coaches"),
)


def _inspector():
    return sa_inspect(op.get_bind())


def _fk_on_column(table, column):
    for fk in _inspector().get_foreign_keys(table):
        if fk["constrained_columns"] == [column]:
            return fk
    return None


def _set_ondelete(table, column, referred, ondelete):
    insp = _inspector()
    if not insp.has_table(table):
        return
    fk = _fk_on_column(table, column)
    if fk is not None and (fk.get("options") or {}).get("ondelete", "").upper() == ondelete:
        return
    if fk is not None and fk.get("name"):
        op.drop_constraint(fk["name"], table, type_="foreignkey")
    # B-059: prod's schema has drifted (its constraints came from create_all,
    # and some are missing). A column with no constraint can hold ids whose row
    # is gone, and creating the FK over them aborts the whole deploy. Clear them
    # first: SET NULL is exactly what the new constraint does when a row goes.
    op.execute(
        f"UPDATE {table} SET {column} = NULL "
        f"WHERE {column} IS NOT NULL AND {column} NOT IN (SELECT id FROM {referred})"
    )
    op.create_foreign_key(
        f"fk_{table}_{column}", table, referred, [column], ["id"], ondelete=ondelete
    )


def upgrade():
    for table, column, referred in TARGETS:
        _set_ondelete(table, column, referred, "SET NULL")


def downgrade():
    # Back to NO ACTION (no ondelete clause), the state before this revision.
    for table, column, referred in TARGETS:
        insp = _inspector()
        if not insp.has_table(table):
            continue
        fk = _fk_on_column(table, column)
        if fk is None or (fk.get("options") or {}).get("ondelete") is None:
            continue
        if fk.get("name"):
            op.drop_constraint(fk["name"], table, type_="foreignkey")
        op.create_foreign_key(f"fk_{table}_{column}", table, referred, [column], ["id"])
