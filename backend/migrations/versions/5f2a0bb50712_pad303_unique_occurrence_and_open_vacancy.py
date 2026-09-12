"""PAD-303 (B-046): the occurrence key and the open vacancy are unique in the database

Revision ID: 5f2a0bb50712
Revises: fed5ed4916a8
Create Date: 2026-09-11

classes.instances rule 9 and notifications.invitations rule 14. Two indexes:

1. ``uq_lesson_instance_occurrence`` UNIQUE on
   ``lesson_instances (lesson_id, original_lesson_occurence_date)`` — the occurrence
   key every materialisation lookup takes. It supersedes PAD-263's plain index
   ``ix_lesson_instances_lesson_id_occurrence_date``, which is dropped. Rows with a
   NULL occurrence date are not covered (NULLs never collide); their duplicate
   (lesson, day) groups are only counted and logged.
2. ``uq_vacancies_open_original_player`` UNIQUE on
   ``vacancies (lesson_instance_id, original_player_id)`` WHERE ``status = 'open'
   AND original_player_id IS NOT NULL`` — B-046 step 5 / B-051's deferred backstop.

Fail-closed, done on purpose: BEFORE creating anything the upgrade counts the
offending groups for both keys and REFUSES — raises, naming every group and its
row ids — if either count is not zero. It never skips (PAD-273's uniques did),
because Session E's read-only scan of the staging copy of prod found zero groups
for both keys on 2026-09-11, so a non-zero count later means new duplicates that
need the B-046 merge first, and a partially applied constraint set must not
reach the code that relies on it. Every create and drop is guarded, so a re-run
is a no-op. Downgrade drops both unique indexes and restores the plain index.
"""
import logging

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "5f2a0bb50712"
down_revision = "fed5ed4916a8"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

OCCURRENCE_UNIQUE = "uq_lesson_instance_occurrence"
OLD_PLAIN_INDEX = "ix_lesson_instances_lesson_id_occurrence_date"
OPEN_VACANCY_UNIQUE = "uq_vacancies_open_original_player"
OPEN_VACANCY_WHERE = "status = 'open' AND original_player_id IS NOT NULL"

#: (lesson_id, date, ids) for every duplicate occurrence group.
DUPLICATE_OCCURRENCES = """
SELECT lesson_id, original_lesson_occurence_date, count(*) AS n,
       string_agg(CAST(id AS TEXT), ',' ORDER BY id) AS ids
FROM lesson_instances
WHERE original_lesson_occurence_date IS NOT NULL
GROUP BY lesson_id, original_lesson_occurence_date HAVING count(*) > 1
ORDER BY lesson_id, original_lesson_occurence_date
"""
DUPLICATE_OCCURRENCES_SQLITE = DUPLICATE_OCCURRENCES.replace(
    "string_agg(CAST(id AS TEXT), ',' ORDER BY id)", "group_concat(id, ',')"
)

#: (instance, player, ids) for every duplicate OPEN vacancy group.
DUPLICATE_OPEN_VACANCIES = """
SELECT lesson_instance_id, original_player_id, count(*) AS n,
       string_agg(CAST(id AS TEXT), ',' ORDER BY id) AS ids
FROM vacancies
WHERE status = 'open' AND original_player_id IS NOT NULL
GROUP BY lesson_instance_id, original_player_id HAVING count(*) > 1
ORDER BY lesson_instance_id, original_player_id
"""
DUPLICATE_OPEN_VACANCIES_SQLITE = DUPLICATE_OPEN_VACANCIES.replace(
    "string_agg(CAST(id AS TEXT), ',' ORDER BY id)", "group_concat(id, ',')"
)

#: Legacy rows with no occurrence date that share a lesson and a calendar day —
#: the unique index cannot cover them; counted so they can be backfilled.
NULL_DATE_DAY_GROUPS = """
SELECT count(*) FROM (
  SELECT lesson_id, CAST(start_datetime AS DATE) AS day
  FROM lesson_instances
  WHERE original_lesson_occurence_date IS NULL
  GROUP BY lesson_id, CAST(start_datetime AS DATE) HAVING count(*) > 1
) groups
"""


def _inspector():
    return sa_inspect(op.get_bind())


def _has_index(table, name):
    return _inspector().has_table(table) and name in {i["name"] for i in _inspector().get_indexes(table)}


def _rows(sql):
    return op.get_bind().execute(sa.text(sql)).all()


def _sqlite():
    return op.get_bind().dialect.name == "sqlite"


def _refuse_on_duplicates():
    occ = _rows(DUPLICATE_OCCURRENCES_SQLITE if _sqlite() else DUPLICATE_OCCURRENCES)
    vac = _rows(DUPLICATE_OPEN_VACANCIES_SQLITE if _sqlite() else DUPLICATE_OPEN_VACANCIES)
    if not occ and not vac:
        return
    lines = ["PAD-303 refused: duplicates exist that the unique indexes would reject; merge them first (B-046 step 2 / step 5), then re-run."]
    for lesson_id, day, n, ids in occ:
        lines.append(f"  lesson_instances: lesson_id={lesson_id} original_lesson_occurence_date={day} x{n} ids={ids}")
    for instance_id, player_id, n, ids in vac:
        lines.append(f"  vacancies (open): lesson_instance_id={instance_id} original_player_id={player_id} x{n} ids={ids}")
    message = "\n".join(lines)
    log.error(message)
    raise RuntimeError(message)


def upgrade():
    # 0. Refuse, never skip, while any duplicate group exists (rule 9 / rule 13).
    _refuse_on_duplicates()

    null_groups = op.get_bind().execute(sa.text(NULL_DATE_DAY_GROUPS)).scalar()
    if null_groups:
        log.warning(
            "PAD-303: %s group(s) of NULL-dated lesson_instances share a lesson and a day; "
            "the unique index does not cover them — backfill original_lesson_occurence_date (B-046 step 1)",
            null_groups,
        )

    # 1. The occurrence key: unique index in, PAD-263's plain index out.
    if not _has_index("lesson_instances", OCCURRENCE_UNIQUE):
        op.create_index(
            OCCURRENCE_UNIQUE, "lesson_instances",
            ["lesson_id", "original_lesson_occurence_date"], unique=True,
        )
    if _has_index("lesson_instances", OLD_PLAIN_INDEX):
        op.drop_index(OLD_PLAIN_INDEX, table_name="lesson_instances")

    # 2. One open vacancy per departing player per occurrence.
    if not _has_index("vacancies", OPEN_VACANCY_UNIQUE):
        op.create_index(
            OPEN_VACANCY_UNIQUE, "vacancies",
            ["lesson_instance_id", "original_player_id"], unique=True,
            postgresql_where=sa.text(OPEN_VACANCY_WHERE),
            sqlite_where=sa.text(OPEN_VACANCY_WHERE),
        )
    log.info("PAD-303: %s and %s in place (duplicate groups: 0)", OCCURRENCE_UNIQUE, OPEN_VACANCY_UNIQUE)


def downgrade():
    if _has_index("vacancies", OPEN_VACANCY_UNIQUE):
        op.drop_index(OPEN_VACANCY_UNIQUE, table_name="vacancies")
    if _has_index("lesson_instances", OCCURRENCE_UNIQUE):
        op.drop_index(OCCURRENCE_UNIQUE, table_name="lesson_instances")
    if not _has_index("lesson_instances", OLD_PLAIN_INDEX):
        op.create_index(OLD_PLAIN_INDEX, "lesson_instances", ["lesson_id", "original_lesson_occurence_date"])
