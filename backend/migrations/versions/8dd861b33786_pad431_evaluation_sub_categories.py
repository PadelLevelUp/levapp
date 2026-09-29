"""PAD-431 (evaluations.competencies rule 15, D150 D2): categories and sub-categories.

1. `evaluation_categories.parent_id` (Integer, nullable, FK to `evaluation_categories.id` ON DELETE
   CASCADE, indexed): the category a sub-category belongs to; NULL for a category.
2. Backfill, per coach: every `technique` / `tactics` group row (a catalogue sub-level entry) goes
   under the coach's row keyed `technique` / `tactics`. When the coach lacks that row it is created
   first — the catalogue entry's pt label, group `general`, on its sub-categories' scale, active iff
   one of them is — unless the coach already holds a row of that name (either label, compared
   case-insensitively), in which case nothing is created and those rows stay top-level.
   `general`, `custom` and legacy rows keep `parent_id` NULL. No name, scale, flag or score of an
   existing row changes. Every legacy row stays legacy (`competency_group` NULL; R-047).

Every DDL statement is guarded and the backfill only touches rows still without a parent, so a
second run is a no-op (memory prod-schema-drift). Downgrade drops the column; the rows the backfill
created stay — they are ordinary catalogue rows.

Revision ID: 8dd861b33786
Revises: 149faa7df297
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "8dd861b33786"
down_revision = "149faa7df297"  # PAD-423
branch_labels = None
depends_on = None

TABLE = "evaluation_categories"
FK = "evaluation_categories_parent_id_fkey"
INDEX = "ix_evaluation_categories_parent_id"

#: (group word = the default category's catalogue key, pt label, en label) — evaluation_catalogue.CATALOGUE
DEFAULT_PARENTS = (
    ("technique", "Técnica", "Technique"),
    ("tactics", "Tática", "Tactics"),
)


def _inspector():
    return sa_inspect(op.get_bind())


def _has_column(name):
    return any(c["name"] == name for c in _inspector().get_columns(TABLE))


def _has_fk():
    return any(fk.get("name") == FK for fk in _inspector().get_foreign_keys(TABLE))


def _has_index():
    return any(ix.get("name") == INDEX for ix in _inspector().get_indexes(TABLE))


def upgrade():
    if not _has_column("parent_id"):
        op.add_column(TABLE, sa.Column("parent_id", sa.Integer(), nullable=True))
    if not _has_fk():
        op.create_foreign_key(FK, TABLE, TABLE, ["parent_id"], ["id"], ondelete="CASCADE")
    if not _has_index():
        op.create_index(INDEX, TABLE, ["parent_id"], unique=False)

    for key, pt, en in DEFAULT_PARENTS:
        params = {"key": key, "pt": pt, "en": en}
        # The default category, where the coach has sub-level rows of this group but no such row
        # and no row already holding either of its labels.
        op.execute(sa.text(
            f"""
            INSERT INTO {TABLE} (coach_id, name, scale_min, scale_max, catalogue_key, competency_group,
                                 is_active, sort_order, created_at, updated_at)
            SELECT sub.coach_id, :pt, 1, MAX(sub.scale_max), :key, 'general', BOOL_OR(sub.is_active), NULL,
                   now(), now()
            FROM {TABLE} sub
            WHERE sub.competency_group = :key
              AND NOT EXISTS (SELECT 1 FROM {TABLE} p WHERE p.coach_id = sub.coach_id AND p.catalogue_key = :key)
              AND NOT EXISTS (SELECT 1 FROM {TABLE} t WHERE t.coach_id = sub.coach_id
                              AND lower(btrim(t.name)) IN (lower(:pt), lower(:en)))
            GROUP BY sub.coach_id
            """
        ).bindparams(**params))
        # Each sub-level row under it.
        op.execute(sa.text(
            f"""
            UPDATE {TABLE} AS sub SET parent_id = p.id
            FROM {TABLE} p
            WHERE sub.competency_group = :key
              AND sub.parent_id IS NULL
              AND p.coach_id = sub.coach_id
              AND p.catalogue_key = :key
              AND p.parent_id IS NULL
            """
        ).bindparams(key=key))


def downgrade():
    if _has_index():
        op.drop_index(INDEX, table_name=TABLE)
    if _has_fk():
        op.drop_constraint(FK, TABLE, type_="foreignkey")
    if _has_column("parent_id"):
        op.drop_column(TABLE, "parent_id")
