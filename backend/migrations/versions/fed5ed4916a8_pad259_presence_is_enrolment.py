"""PAD-259: the presence row is the per-occurrence enrolment (audit H5)

Revision ID: fed5ed4916a8
Revises: 390bf6e8be12
Create Date: 2026-09-11

Owner decision of 2026-09-11 (option A): one `presences` row per student per
occurrence is the enrolment; `player_in_lesson_instance` becomes a shadow copy
for one release (phase 1, this revision) and is dropped in phase 2.

What this does, guarded so a re-run is a no-op:

1. `presences.enrolment_source` VARCHAR(16) NOT NULL DEFAULT 'unknown', with a
   CHECK on the six values (classes.instance-enrollment rule 3).
2. Backfill, ONE statement: a presence for every junction row that has none
   (`roster` when the series roster holds the pair, else `coach`), skipping
   junction rows whose player or instance is gone (B-059: prod carries rows no
   foreign key ever protected). Existing presences that have a junction row are
   stamped the same way where still `unknown`.
3. Four counts logged at INFO so the deploy log can be compared with the
   staging run (staging is a prod copy per deploy, PAD-200):
   junction_without_presence_before, presences_inserted,
   junction_without_presence_after, capacity_changes.
   The upgrade FAILS if the "after" count is not exactly the orphan rows it was
   told to skip — a partial backfill must never reach the code that reads
   presences as the enrolment. Expected on prod (Session E, 2026-09-11):
   before=2, inserted=2, after=0, orphans=0.

Never deletes. Downgrade drops the check and the column, rows stay.
"""
import logging

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "fed5ed4916a8"
down_revision = "390bf6e8be12"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

SOURCES = ("roster", "coach", "fill", "walk_in", "import", "unknown")
CHECK_NAME = "ck_presences_enrolment_source"
CHECK_SQL = "enrolment_source IN ('roster', 'coach', 'fill', 'walk_in', 'import', 'unknown')"

#: junction rows with no presence — what the backfill inserts, and what must be
#: left afterwards only for rows it was told to skip.
MISSING = """
SELECT count(*) FROM player_in_lesson_instance j
LEFT JOIN presences p
  ON p.player_id = j.player_id AND p.lesson_instance_id = j.lesson_instance_id
WHERE p.id IS NULL
"""

#: junction rows whose player or instance no longer exists (skipped, B-059).
ORPHANS = """
SELECT count(*) FROM player_in_lesson_instance j
WHERE NOT EXISTS (SELECT 1 FROM players pl WHERE pl.id = j.player_id)
   OR NOT EXISTS (SELECT 1 FROM lesson_instances li WHERE li.id = j.lesson_instance_id)
"""

#: junction rows that are NOT orphans and still have no presence — must be 0
#: after the backfill (the assertion; consistent data with orphans passes).
MISSING_NON_ORPHAN = """
SELECT count(*) FROM player_in_lesson_instance j
LEFT JOIN presences p
  ON p.player_id = j.player_id AND p.lesson_instance_id = j.lesson_instance_id
WHERE p.id IS NULL
  AND EXISTS (SELECT 1 FROM players pl WHERE pl.id = j.player_id)
  AND EXISTS (SELECT 1 FROM lesson_instances li WHERE li.id = j.lesson_instance_id)
"""

#: duplicate (player, instance) pairs in the junction. uq_player_lesson_instance
#: exists on prod (Session E, 2026-09-11: 0 duplicates of 4,420 rows), so this is
#: logged, never repaired here; DISTINCT below keeps the backfill safe regardless.
JUNCTION_DUPLICATES = """
SELECT count(*) FROM (
  SELECT player_id, lesson_instance_id FROM player_in_lesson_instance
  GROUP BY player_id, lesson_instance_id HAVING count(*) > 1
) d
"""

#: instances whose filled count differs between the old formula (junction rows
#: minus absent presences) and the new one (presences minus absent presences).
CAPACITY_CHANGES = """
SELECT count(*) FROM (
  SELECT li.id,
    (SELECT count(*) FROM player_in_lesson_instance j WHERE j.lesson_instance_id = li.id)
    - (SELECT count(*) FROM player_in_lesson_instance j
         JOIN presences p ON p.player_id = j.player_id AND p.lesson_instance_id = j.lesson_instance_id
       WHERE j.lesson_instance_id = li.id AND p.status = 'absent') AS old_count,
    (SELECT count(*) FROM presences p
       WHERE p.lesson_instance_id = li.id AND (p.status IS NULL OR p.status <> 'absent')) AS new_count
  FROM lesson_instances li
) counts WHERE old_count <> new_count
"""

#: The single-statement backfill. Portable: TRUE/FALSE literals are accepted by
#: Postgres and SQLite (3.23+) alike; the timestamp expression is substituted per
#: dialect (Postgres: UTC, whatever the session time zone; SQLite: UTC already).
#: DISTINCT: a duplicate junction pair must never become two presences. status and
#: justification are left to their NULL default: under DISTINCT Postgres types a bare
#: NULL as text and refuses the enum columns.
BACKFILL_INSERT = """
INSERT INTO presences (lesson_instance_id, player_id, invited, confirmed,
                       validated, late_cancellation, enrolment_source, created_at, updated_at)
SELECT DISTINCT j.lesson_instance_id, j.player_id, TRUE, FALSE, FALSE, FALSE,
       CASE WHEN EXISTS (
              SELECT 1 FROM player_in_lesson pl
              JOIN lesson_instances li ON li.id = j.lesson_instance_id
              WHERE pl.lesson_id = li.lesson_id AND pl.player_id = j.player_id)
            THEN 'roster' ELSE 'coach' END,
       {now}, {now}
FROM player_in_lesson_instance j
WHERE EXISTS (SELECT 1 FROM players pl WHERE pl.id = j.player_id)
  AND EXISTS (SELECT 1 FROM lesson_instances li WHERE li.id = j.lesson_instance_id)
  AND NOT EXISTS (SELECT 1 FROM presences p
                  WHERE p.player_id = j.player_id AND p.lesson_instance_id = j.lesson_instance_id)
"""

#: Existing presences that have a junction row get their origin stamped.
STAMP_EXISTING = """
UPDATE presences SET enrolment_source = CASE WHEN EXISTS (
        SELECT 1 FROM player_in_lesson pl
        JOIN lesson_instances li ON li.id = presences.lesson_instance_id
        WHERE pl.lesson_id = li.lesson_id AND pl.player_id = presences.player_id)
      THEN 'roster' ELSE 'coach' END
WHERE enrolment_source = 'unknown'
  AND EXISTS (SELECT 1 FROM player_in_lesson_instance j
              WHERE j.player_id = presences.player_id
                AND j.lesson_instance_id = presences.lesson_instance_id)
"""


def _inspector():
    return sa_inspect(op.get_bind())


def _column(table, name):
    insp = _inspector()
    if not insp.has_table(table):
        return None
    return next((c for c in insp.get_columns(table) if c["name"] == name), None)


def _has_check(table, name):
    try:
        return name in {c["name"] for c in _inspector().get_check_constraints(table)}
    except NotImplementedError:
        return False


def _scalar(sql):
    return op.get_bind().execute(sa.text(sql)).scalar()


def upgrade():
    bind = op.get_bind()
    sqlite = bind.dialect.name == "sqlite"

    # 1. The column and its check.
    if _column("presences", "enrolment_source") is None:
        op.add_column(
            "presences",
            sa.Column("enrolment_source", sa.String(16), nullable=False, server_default="unknown"),
        )
    if not _has_check("presences", CHECK_NAME):
        if sqlite:
            with op.batch_alter_table("presences") as batch:
                batch.create_check_constraint(CHECK_NAME, CHECK_SQL)
        else:
            op.create_check_constraint(CHECK_NAME, "presences", CHECK_SQL)

    # 2. Counts before, the backfill, counts after.
    before = _scalar(MISSING)
    orphans = _scalar(ORPHANS)
    duplicates = _scalar(JUNCTION_DUPLICATES)
    capacity_changes = _scalar(CAPACITY_CHANGES)
    now_sql = "CURRENT_TIMESTAMP" if sqlite else "(now() AT TIME ZONE 'UTC')"
    inserted = bind.execute(sa.text(BACKFILL_INSERT.format(now=now_sql))).rowcount
    bind.execute(sa.text(STAMP_EXISTING))
    after = _scalar(MISSING)
    uncovered = _scalar(MISSING_NON_ORPHAN)

    # 3. The numbers the deploy watch compares with the staging run.
    log.info(
        "PAD-259 backfill: junction_without_presence_before=%s presences_inserted=%s "
        "junction_without_presence_after=%s capacity_changes=%s junction_duplicate_pairs=%s "
        "(orphan junction rows skipped=%s)",
        before, inserted, after, capacity_changes, duplicates, orphans,
    )
    if uncovered != 0:
        raise RuntimeError(
            f"PAD-259 backfill incomplete: {uncovered} non-orphan junction row(s) still have "
            f"no presence (orphans skipped: {orphans})"
        )


def downgrade():
    if _column("presences", "enrolment_source") is None:
        return
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("presences") as batch:
            if _has_check("presences", CHECK_NAME):
                batch.drop_constraint(CHECK_NAME, type_="check")
            batch.drop_column("enrolment_source")
    else:
        if _has_check("presences", CHECK_NAME):
            op.drop_constraint(CHECK_NAME, "presences", type_="check")
        op.drop_column("presences", "enrolment_source")
