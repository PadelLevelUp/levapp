"""PAD-363: evaluation records, competency columns, evaluation_entries.record_id — and the backfill.

Additive, every DDL guarded so a re-run is a no-op and a hand-applied object is
left alone (production schemas drift):

- evaluation_categories + catalogue_key VARCHAR(64) NULL, competency_group
  VARCHAR(16) NULL (general|technique|tactics|custom; **NULL = legacy** — what
  the five App Store endpoints filter on, evaluations.legacy-client-contract),
  is_active BOOLEAN NOT NULL DEFAULT true, sort_order INTEGER NULL; unique
  (coach_id, catalogue_key) WHERE catalogue_key IS NOT NULL. Existing rows stay
  legacy and active. Nothing here assumes uq_evaluation_categories_coach_name
  exists.
- evaluation_records (new): coach_player_id FK CASCADE, lesson_instance_id FK
  SET NULL, evaluated_on DATE, note TEXT, created_at, updated_at; one class-less
  record per (coach_player, day), one more per class of that day (two partial
  unique indexes).
- evaluation_entries + record_id FK CASCADE NULL; unique (record_id, category_id)
  WHERE record_id IS NOT NULL.

Backfill (evaluations.records — data survives): every record-less entry is
grouped by (coach_player_id, club-local day of its naive-UTC evaluated_at). Per
category the row with the greatest (evaluated_at, id) holds the slot in that
day's class-less record; the earlier rows of the day stay record-less, as
history. **The only column written on an existing row is `record_id`** — no row
is deleted, rescaled, re-dated or re-scored. Re-running changes nothing: a
record-less row is considered only when no later-or-equal row of its category
already sits in the day's record; a record-less row LATER than the holder (one
written around the service during a deploy window) takes the slot and the former
holder becomes record-less. Entries whose coach_in_player row is gone (drift: no
FK guaranteed) are skipped with a WARNING. A record's created_at / updated_at
are the first and last evaluated_at it groups.

Downgrade drops the three additions, each guarded. It is lossless while nothing
lives only in the new schema; it REFUSES when a non-legacy competency, a
switched-off category, a record note or a class-linked record exists (dropping
competency_group or is_active would show those to App Store 1.0/1.1.0, which
post a midpoint for whatever they list) unless PAD363_DOWNGRADE_DISCARDS_DATA=1.

Revision ID: 21c864b3dd59
Revises: 8da963ad8591
Create Date: 2026-09-21
"""
import logging
import os
from collections import defaultdict
from datetime import timezone
from zoneinfo import ZoneInfo

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "21c864b3dd59"
down_revision = "8da963ad8591"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

# The club's clock — the same zone as padel_app.utils.dates.CLUB_TZ (R-023).
# Inlined because a migration must not import the app; test_pad363_migration
# asserts the two are equal.
CLUB_TZ = ZoneInfo("Europe/Lisbon")

FORCE_DOWNGRADE_ENV = "PAD363_DOWNGRADE_DISCARDS_DATA"

CATEGORY_COLUMNS = (
    ("catalogue_key", lambda: sa.Column("catalogue_key", sa.String(length=64), nullable=True)),
    ("competency_group", lambda: sa.Column("competency_group", sa.String(length=16), nullable=True)),
    ("is_active", lambda: sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true())),
    ("sort_order", lambda: sa.Column("sort_order", sa.Integer(), nullable=True)),
)

#: table, index name, columns, partial predicate
INDEXES = (
    ("evaluation_categories", "uq_evaluation_categories_coach_catalogue_key",
     ("coach_id", "catalogue_key"), "catalogue_key IS NOT NULL"),
    ("evaluation_records", "uq_evaluation_records_classless_day",
     ("coach_player_id", "evaluated_on"), "lesson_instance_id IS NULL"),
    ("evaluation_records", "uq_evaluation_records_class_day",
     ("coach_player_id", "lesson_instance_id", "evaluated_on"), "lesson_instance_id IS NOT NULL"),
    ("evaluation_entries", "uq_evaluation_entries_record_category",
     ("record_id", "category_id"), "record_id IS NOT NULL"),
)

RECORD_FK = "evaluation_entries_record_id_fkey"


def club_day(instant):
    """The club-local calendar date of a stored `evaluated_at` (naive = UTC)."""
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=timezone.utc)
    return instant.astimezone(CLUB_TZ).date()


def _insp():
    return sa_inspect(op.get_bind())


def _has_table(table):
    return _insp().has_table(table)


def _has_column(table, name):
    return _has_table(table) and any(c["name"] == name for c in _insp().get_columns(table))


def _has_index(table, name):
    return _has_table(table) and any(i["name"] == name for i in _insp().get_indexes(table))


def _is_sqlite():
    return op.get_bind().dialect.name == "sqlite"


# ── upgrade ──────────────────────────────────────────────────────────────────


def upgrade():
    for name, make in CATEGORY_COLUMNS:
        if _has_column("evaluation_categories", name):
            log.info("PAD-363: evaluation_categories.%s already present — skipping", name)
            continue
        op.add_column("evaluation_categories", make())
        log.info("PAD-363: added evaluation_categories.%s", name)

    if not _has_table("evaluation_records"):
        op.create_table(
            "evaluation_records",
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("coach_player_id", sa.Integer(), nullable=False),
            sa.Column("lesson_instance_id", sa.Integer(), nullable=True),
            sa.Column("evaluated_on", sa.Date(), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(
                ["coach_player_id"], ["coach_in_player.id"],
                name="evaluation_records_coach_player_id_fkey", ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["lesson_instance_id"], ["lesson_instances.id"],
                name="evaluation_records_lesson_instance_id_fkey", ondelete="SET NULL",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        log.info("PAD-363: created evaluation_records")
    else:
        log.info("PAD-363: evaluation_records already present — skipping")

    if not _has_column("evaluation_entries", "record_id"):
        op.add_column("evaluation_entries", sa.Column("record_id", sa.Integer(), nullable=True))
        log.info("PAD-363: added evaluation_entries.record_id")
    # SQLite cannot add a constraint to an existing table; only the scratch
    # migration tests run there (the sqlite test backend uses create_all).
    if not _is_sqlite():
        fks = {fk["name"] for fk in _insp().get_foreign_keys("evaluation_entries")}
        refs = {
            tuple(fk["constrained_columns"]) for fk in _insp().get_foreign_keys("evaluation_entries")
        }
        if RECORD_FK not in fks and ("record_id",) not in refs:
            op.create_foreign_key(
                RECORD_FK, "evaluation_entries", "evaluation_records", ["record_id"], ["id"], ondelete="CASCADE",
            )
            log.info("PAD-363: added %s", RECORD_FK)

    for table, name, columns, predicate in INDEXES:
        if _has_index(table, name):
            log.info("PAD-363: index %s already present — skipping", name)
            continue
        op.create_index(
            name, table, list(columns), unique=True,
            postgresql_where=sa.text(predicate), sqlite_where=sa.text(predicate),
        )
        log.info("PAD-363: created index %s", name)

    _backfill()


def _tables():
    meta = sa.MetaData()
    entries = sa.Table(
        "evaluation_entries", meta,
        sa.Column("id", sa.Integer), sa.Column("coach_player_id", sa.Integer),
        sa.Column("category_id", sa.Integer), sa.Column("record_id", sa.Integer),
        sa.Column("evaluated_at", sa.DateTime),
    )
    records = sa.Table(
        "evaluation_records", meta,
        sa.Column("id", sa.Integer, primary_key=True), sa.Column("coach_player_id", sa.Integer),
        sa.Column("lesson_instance_id", sa.Integer), sa.Column("evaluated_on", sa.Date),
        sa.Column("created_at", sa.DateTime), sa.Column("updated_at", sa.DateTime),
    )
    links = sa.Table("coach_in_player", meta, sa.Column("id", sa.Integer))
    return entries, records, links


def _backfill():
    bind = op.get_bind()
    entries, records, links = _tables()

    candidates = bind.execute(
        sa.select(entries.c.id, entries.c.coach_player_id, entries.c.category_id, entries.c.evaluated_at)
        .where(entries.c.record_id.is_(None))
        .order_by(entries.c.id)
    ).fetchall()
    if not candidates:
        log.info("PAD-363 backfill: no record-less entries — nothing to do")
        return

    live_links = {row[0] for row in bind.execute(sa.select(links.c.id))}
    orphans = undated = 0

    # (coach_player_id, day) -> category_id -> best candidate (evaluated_at, id)
    groups = defaultdict(dict)
    spans = {}
    for entry_id, link_id, category_id, evaluated_at in candidates:
        if link_id not in live_links:
            orphans += 1
            continue
        if evaluated_at is None:  # NOT NULL since PAD-273, but that migration is guarded too
            undated += 1
            continue
        key = (link_id, club_day(evaluated_at))
        best = groups[key].get(category_id)
        if best is None or (evaluated_at, entry_id) > best:
            groups[key][category_id] = (evaluated_at, entry_id)
        first, last = spans.get(key, (evaluated_at, evaluated_at))
        spans[key] = (min(first, evaluated_at), max(last, evaluated_at))

    created = joined = displaced = 0
    for (link_id, day), winners in sorted(groups.items()):
        record_id = bind.execute(
            sa.select(records.c.id).where(
                records.c.coach_player_id == link_id,
                records.c.evaluated_on == day,
                records.c.lesson_instance_id.is_(None),
            )
        ).scalar()
        if record_id is None:
            first, last = spans[(link_id, day)]
            result = bind.execute(
                records.insert().values(
                    coach_player_id=link_id, lesson_instance_id=None, evaluated_on=day,
                    created_at=first, updated_at=last,
                )
            )
            record_id = result.inserted_primary_key[0]
            created += 1

        holders = {
            row[0]: (row[1], row[2])
            for row in bind.execute(
                sa.select(entries.c.category_id, entries.c.evaluated_at, entries.c.id)
                .where(entries.c.record_id == record_id)
            )
        }
        for category_id, (evaluated_at, entry_id) in winners.items():
            holder = holders.get(category_id)
            if holder is not None:
                if holder >= (evaluated_at, entry_id):
                    continue  # the slot is held by a later row: the candidate stays history
                bind.execute(entries.update().where(entries.c.id == holder[1]).values(record_id=None))
                displaced += 1
            bind.execute(entries.update().where(entries.c.id == entry_id).values(record_id=record_id))
            joined += 1

    log.info(
        "PAD-363 backfill: %d record-less entries read, %d records created, %d entries joined a record, "
        "%d former holders made record-less, %d left as same-day history",
        len(candidates), created, joined, displaced, len(candidates) - joined - orphans - undated,
    )
    if orphans or undated:
        log.warning(
            "PAD-363 backfill: skipped %d entries whose coach_in_player row is missing and %d with no evaluated_at",
            orphans, undated,
        )


# ── downgrade ────────────────────────────────────────────────────────────────


def _only_in_the_new_schema():
    """What a downgrade would destroy or expose, as (label, count)."""
    bind = op.get_bind()
    found = []
    if _has_column("evaluation_categories", "competency_group"):
        n = bind.execute(sa.text("SELECT count(*) FROM evaluation_categories WHERE competency_group IS NOT NULL")).scalar()
        found.append(("non-legacy competencies (would become visible to App Store 1.0/1.1.0)", n))
    if _has_column("evaluation_categories", "is_active"):
        n = bind.execute(sa.text("SELECT count(*) FROM evaluation_categories WHERE is_active IS NOT TRUE")).scalar()
        found.append(("switched-off categories (would become visible again to App Store 1.0/1.1.0)", n))
    if _has_table("evaluation_records"):
        n = bind.execute(sa.text("SELECT count(*) FROM evaluation_records WHERE note IS NOT NULL")).scalar()
        found.append(("record notes", n))
        n = bind.execute(sa.text("SELECT count(*) FROM evaluation_records WHERE lesson_instance_id IS NOT NULL")).scalar()
        found.append(("class-linked records", n))
    return [(label, n) for label, n in found if n]


def downgrade():
    at_risk = _only_in_the_new_schema()
    if at_risk and os.environ.get(FORCE_DOWNGRADE_ENV) != "1":
        raise RuntimeError(
            "PAD-363 downgrade refused: "
            + "; ".join(f"{n} {label}" for label, n in at_risk)
            + f". Set {FORCE_DOWNGRADE_ENV}=1 to discard them."
        )

    for table, name, _columns, _predicate in INDEXES:
        if _has_index(table, name):
            op.drop_index(name, table_name=table)
            log.info("PAD-363 downgrade: dropped index %s", name)

    if _has_column("evaluation_entries", "record_id"):
        if _is_sqlite():
            with op.batch_alter_table("evaluation_entries") as batch:
                batch.drop_column("record_id")
        else:
            for fk in _insp().get_foreign_keys("evaluation_entries"):
                if fk["constrained_columns"] == ["record_id"] and fk.get("name"):
                    op.drop_constraint(fk["name"], "evaluation_entries", type_="foreignkey")
            op.drop_column("evaluation_entries", "record_id")
        log.info("PAD-363 downgrade: dropped evaluation_entries.record_id")

    if _has_table("evaluation_records"):
        op.drop_table("evaluation_records")
        log.info("PAD-363 downgrade: dropped evaluation_records")

    for name, _make in reversed(CATEGORY_COLUMNS):
        if not _has_column("evaluation_categories", name):
            continue
        if _is_sqlite():
            with op.batch_alter_table("evaluation_categories") as batch:
                batch.drop_column(name)
        else:
            op.drop_column("evaluation_categories", name)
        log.info("PAD-363 downgrade: dropped evaluation_categories.%s", name)
