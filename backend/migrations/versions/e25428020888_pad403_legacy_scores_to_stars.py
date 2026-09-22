"""PAD-403 (evaluations.legacy-conversion): every legacy 1-10 evaluation score
becomes a 1-5 star rating, in one data migration, with one fixed mapping.

**Owner decision, 2026-09-22 (Q1, the non-default).** Not coach-triggered, not
per category. The mapping (``padel_app.services.legacy_scale.to_stars``,
pinned value by value, R-048 — no client re-derives it)::

    score:  1  2  3  4  5  6  7  8  9  10
    stars:  1  1  2  2  3  3  4  4  5  5

i.e. ``stars = ceil(score / 2) = (score + 1) // 2``. The mapping must be
total, not just correct on 1-10: scores below 1 — a 0 on a 0-10 category —
become 1★; none exist in production on 2026-09-22.

Production shape (Session-A, 2026-09-22 08:50:35 UTC): 7 legacy categories, 16
entries, all 1-10, five of them the untouched midpoint 6 (-> 3 stars).

Scope — exactly the legacy rows (evaluations.competencies: ``competency_group
IS NULL`` is what marks a category legacy; a catalogue competency is already
1-5 and untouched):

- ``evaluation_categories`` rows with ``competency_group IS NULL AND
  scale_max = 10`` -> ``scale_min = 1, scale_max = 5``, with the original
  ``scale_max`` and ``scale_min`` preserved in the new
  ``scale_max_before_conversion`` / ``scale_min_before_conversion`` columns
  (a legacy category need not start at 1 — a 0-10 category exists — so the
  downgrade needs both to be reversible).
- ``evaluation_entries`` rows under those categories -> ``score = ceil(score /
  2)``, with the original ``score`` preserved in the new
  ``score_before_conversion`` column. Record-less rows convert with the rest
  (Q29): read by nothing, but not left on a dropped scale.

Never touches ``evaluated_at``, ``record_id``, ``created_at``, ``updated_at``,
``evaluation_records`` or ``evaluation_shares`` (rule 3 / prod-schema-drift).

Two guards make this idempotent and safe to re-run:

1. Each added column is added only if it is not already present (inspector
   check, house style of 21c864b3dd59) — a second run of the DDL is a no-op,
   and a hand-applied column is left alone.
2. The data step only ever touches an entry whose
   ``score_before_conversion IS NULL``; once converted, its category's
   ``scale_max`` is 5, not 10, so the category-selection subquery no longer
   matches it either. A second (or third) ``upgrade()`` therefore changes
   nothing by construction, without needing a separate "already converted"
   flag.

``score`` (``EvaluationEntry.score``) is a Postgres/SQLite ``FLOAT`` column, so
plain ``(score + 1) / 2`` would be FLOAT division on both engines (e.g.
score=8 -> 9.0/2 = 4.5, not the wanted 4) — wrong for every even score. The
data step therefore casts to ``INTEGER`` first: ``CAST((CAST(score AS INTEGER)
+ 1) / 2 AS INTEGER)``. With both operands INTEGER, ``/`` truncates towards
zero on Postgres (integer division) and on SQLite (the "/" operator's integer
path — SQLite docs: two integer operands make the result an integer, the
quotient truncated towards zero), which equals ``(score + 1) // 2`` for every
score in 1..10.

Reversible (rule 3): ``downgrade`` restores ``score`` from
``score_before_conversion`` and the scale (both ``scale_min`` and
``scale_max``) from ``scale_min_before_conversion`` /
``scale_max_before_conversion`` where they are not null, nulls all three
``*_before_conversion`` columns, then drops the three columns (guarded — only
if present), so an ``upgrade`` afterwards re-adds the columns and
re-converts from scratch, landing on the same rows.

Revision ID: e25428020888
Revises: 2240837cb663
Create Date: 2026-09-22
"""
import logging

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "e25428020888"
down_revision = "2240837cb663"  # slot 4, on slice 8 (PAD-404); chain 21c864b3dd59 → 6a6ac64d814b → 2240837cb663 → this
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

ENTRY_COLUMN = ("score_before_conversion", lambda: sa.Column("score_before_conversion", sa.Integer(), nullable=True))
CATEGORY_COLUMN = (
    "scale_max_before_conversion",
    lambda: sa.Column("scale_max_before_conversion", sa.Integer(), nullable=True),
)
CATEGORY_MIN_COLUMN = (
    "scale_min_before_conversion",
    lambda: sa.Column("scale_min_before_conversion", sa.Integer(), nullable=True),
)

# stars = ceil(score / 2), as integer division: (score + 1) // 2. `score` is a
# FLOAT column, so both operands are cast to INTEGER first — plain arithmetic
# on a FLOAT operand would be FLOAT division on Postgres and SQLite alike.
# The mapping must be total: a 0-10 category (scale_min = 0) can hold a score
# of 0, and (0 + 1) // 2 = 0 falls outside 1-5. Scores below 1 — a 0 on a
# 0-10 category — become 1 star; none exist in production on 2026-09-22.
CONVERT_ENTRIES_SQL = """
    UPDATE evaluation_entries
    SET score_before_conversion = score,
        score = CASE
            WHEN CAST(score AS INTEGER) < 2 THEN 1
            ELSE CAST((CAST(score AS INTEGER) + 1) / 2 AS INTEGER)
        END
    WHERE score_before_conversion IS NULL
      AND category_id IN (
          SELECT id FROM evaluation_categories
          WHERE competency_group IS NULL AND scale_max = 10
      )
"""

CONVERT_CATEGORIES_SQL = """
    UPDATE evaluation_categories
    SET scale_max_before_conversion = scale_max,
        scale_min_before_conversion = scale_min,
        scale_min = 1,
        scale_max = 5
    WHERE competency_group IS NULL
      AND scale_max = 10
      AND scale_max_before_conversion IS NULL
"""

RESTORE_ENTRIES_SQL = """
    UPDATE evaluation_entries
    SET score = score_before_conversion,
        score_before_conversion = NULL
    WHERE score_before_conversion IS NOT NULL
"""

RESTORE_CATEGORIES_SQL = """
    UPDATE evaluation_categories
    SET scale_max = scale_max_before_conversion,
        scale_min = scale_min_before_conversion,
        scale_max_before_conversion = NULL,
        scale_min_before_conversion = NULL
    WHERE scale_max_before_conversion IS NOT NULL
"""


def _insp():
    return sa_inspect(op.get_bind())


def _has_column(table, name):
    return any(c["name"] == name for c in _insp().get_columns(table))


# ── upgrade ──────────────────────────────────────────────────────────────────


def upgrade():
    name, make = ENTRY_COLUMN
    if _has_column("evaluation_entries", name):
        log.info("PAD-403: evaluation_entries.%s already present — skipping", name)
    else:
        op.add_column("evaluation_entries", make())
        log.info("PAD-403: added evaluation_entries.%s", name)

    name, make = CATEGORY_COLUMN
    if _has_column("evaluation_categories", name):
        log.info("PAD-403: evaluation_categories.%s already present — skipping", name)
    else:
        op.add_column("evaluation_categories", make())
        log.info("PAD-403: added evaluation_categories.%s", name)

    name, make = CATEGORY_MIN_COLUMN
    if _has_column("evaluation_categories", name):
        log.info("PAD-403: evaluation_categories.%s already present — skipping", name)
    else:
        op.add_column("evaluation_categories", make())
        log.info("PAD-403: added evaluation_categories.%s", name)

    _convert()


def _convert():
    """The data step (rule 2). Order matters: entries are converted while
    their category still reads ``scale_max = 10`` — only then is the category
    itself rescaled to 1-5. Idempotent by construction (module docstring)."""
    bind = op.get_bind()
    entries_result = bind.execute(sa.text(CONVERT_ENTRIES_SQL))
    categories_result = bind.execute(sa.text(CONVERT_CATEGORIES_SQL))
    log.info(
        "PAD-403: converted %d entries and %d categories from legacy 1-10 to 1-5",
        entries_result.rowcount, categories_result.rowcount,
    )


# ── downgrade ────────────────────────────────────────────────────────────────


def downgrade():
    bind = op.get_bind()

    # Guarded: a second downgrade (or one run against a database that never
    # upgraded) finds the columns already gone and has nothing to restore.
    name, _make = ENTRY_COLUMN
    if _has_column("evaluation_entries", name):
        entries_result = bind.execute(sa.text(RESTORE_ENTRIES_SQL))
        log.info("PAD-403 downgrade: restored %d entries to their legacy score", entries_result.rowcount)

    name, _make = CATEGORY_COLUMN
    if _has_column("evaluation_categories", name):
        categories_result = bind.execute(sa.text(RESTORE_CATEGORIES_SQL))
        log.info("PAD-403 downgrade: restored %d categories to their legacy scale", categories_result.rowcount)

    name, _make = ENTRY_COLUMN
    if _has_column("evaluation_entries", name):
        if bind.dialect.name == "sqlite":
            with op.batch_alter_table("evaluation_entries") as batch:
                batch.drop_column(name)
        else:
            op.drop_column("evaluation_entries", name)
        log.info("PAD-403 downgrade: dropped evaluation_entries.%s", name)

    name, _make = CATEGORY_COLUMN
    if _has_column("evaluation_categories", name):
        if bind.dialect.name == "sqlite":
            with op.batch_alter_table("evaluation_categories") as batch:
                batch.drop_column(name)
        else:
            op.drop_column("evaluation_categories", name)
        log.info("PAD-403 downgrade: dropped evaluation_categories.%s", name)

    name, _make = CATEGORY_MIN_COLUMN
    if _has_column("evaluation_categories", name):
        if bind.dialect.name == "sqlite":
            with op.batch_alter_table("evaluation_categories") as batch:
                batch.drop_column(name)
        else:
            op.drop_column("evaluation_categories", name)
        log.info("PAD-403 downgrade: dropped evaluation_categories.%s", name)
