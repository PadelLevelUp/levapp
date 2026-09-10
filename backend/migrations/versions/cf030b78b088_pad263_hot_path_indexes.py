"""PAD-263 (audit H11): index the hot foreign-key lookups

No foreign key on the class, attendance, invitation, waiting-list, calendar-block
or level-history tables had an index, so every "rows for this class", "events
for this vacancy" and "blocks for this user" lookup was a sequential scan. The
composite unique constraints that do exist (`uq_presence_player_lesson_instance`,
`uq_player_lesson`, ...) lead with the player or coach and cannot serve a lookup
by class.

Decisions:

- Plain indexes only. The audit asked for a UNIQUE index on
  `lesson_instances (lesson_id, original_lesson_occurence_date)`, but PAD-85's
  double materialisation created exactly those duplicates and prod may still
  hold some; a unique index would fail the upgrade and crash-loop the deploy.
  The lookup gets the same index without the constraint; the constraint is
  ledger B-033 (count on the staging copy of prod, merge, then constrain).
- Already present, so not here: `messages(sender_id)` and
  `conversation_participants(user_id)` (PAD-204); `conversation_participants
  (conversation_id)` is the leading column of `uq_conversation_participant`.
  The unique `players(user_id)` / `coaches(user_id)` belong to the H6 ticket.
- Plain `CREATE INDEX` inside Alembic's transaction, not `CONCURRENTLY`. These
  tables are small (the prod instance is 192 MB), so the SHARE lock each build
  takes is held for well under a second; a concurrent build would need an
  autocommit block and can leave an INVALID index behind that the guard below
  would then mistake for a finished one.
- Every create and drop is guarded. Staging is a prod copy on every deploy
  (PAD-200) and prod has carried indexes no revision created (PAD-204 crash-
  looped on exactly that), so the revision must apply over a schema that
  already has part of it.

The models declare the same sixteen indexes, and
`tests/test_pad263_hot_path_indexes.py` pins the two lists together, so
`flask db migrate` does not draft their removal (see ledger B-032).

Revision ID: cf030b78b088
Revises: ad97ec649746
Create Date: 2026-09-10
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect


revision = "cf030b78b088"
down_revision = "ad97ec649746"
branch_labels = None
depends_on = None


OPEN_VACANCY = "status = 'open'"

# (name, table, columns, partial WHERE or None)
INDEXES = (
    # Every calendar render and every get_or_materialize_instance call looks an
    # occurrence up by (lesson, date); the calendar range query filters on start.
    (
        "ix_lesson_instances_lesson_id_occurrence_date",
        "lesson_instances",
        ("lesson_id", "original_lesson_occurence_date"),
        None,
    ),
    ("ix_lesson_instances_start_datetime", "lesson_instances", ("start_datetime",), None),
    # Per-class rows: attendance sheet, enrolment, coach assignment.
    ("ix_presences_lesson_instance_id", "presences", ("lesson_instance_id",), None),
    (
        "ix_player_in_lesson_instance_lesson_instance_id",
        "player_in_lesson_instance",
        ("lesson_instance_id",),
        None,
    ),
    (
        "ix_coach_in_lesson_instance_lesson_instance_id",
        "coach_in_lesson_instance",
        ("lesson_instance_id",),
        None,
    ),
    ("ix_player_in_lesson_lesson_id", "player_in_lesson", ("lesson_id",), None),
    ("ix_coach_in_lesson_lesson_id", "coach_in_lesson", ("lesson_id",), None),
    # The invitation engine: events per vacancy and per class by status, a
    # coach's recent events, and "has this player been invited by this coach".
    (
        "ix_notification_events_vacancy_id_status",
        "notification_events",
        ("vacancy_id", "status"),
        None,
    ),
    (
        "ix_notification_events_lesson_instance_id_status",
        "notification_events",
        ("lesson_instance_id", "status"),
        None,
    ),
    (
        "ix_notification_events_coach_id_created_at",
        "notification_events",
        ("coach_id", "created_at"),
        None,
    ),
    (
        "ix_notification_events_player_id_coach_id",
        "notification_events",
        ("player_id", "coach_id"),
        None,
    ),
    (
        "ix_vacancies_lesson_instance_id_status",
        "vacancies",
        ("lesson_instance_id", "status"),
        None,
    ),
    # The engine's sweep only ever wants open vacancies; filled and expired ones
    # are the bulk of the table and never read by it.
    ("ix_vacancies_open", "vacancies", ("status",), OPEN_VACANCY),
    ("ix_calendar_blocks_user_id", "calendar_blocks", ("user_id",), None),
    (
        "ix_waiting_list_entries_standing_entry_id",
        "waiting_list_entries",
        ("standing_entry_id",),
        None,
    ),
    (
        "ix_player_level_history_player_id_assigned_at",
        "player_level_history",
        ("player_id", "assigned_at"),
        None,
    ),
)


def _has_index(table, name):
    # A fresh inspector per call: the reflection cache of a shared one would
    # not see the index this same revision created a moment earlier.
    return name in {i["name"] for i in sa_inspect(op.get_bind()).get_indexes(table)}


def upgrade():
    for name, table, columns, where in INDEXES:
        if _has_index(table, name):
            continue
        partial = {}
        if where:
            partial = {
                "postgresql_where": sa.text(where),
                "sqlite_where": sa.text(where),
            }
        op.create_index(name, table, list(columns), **partial)


def downgrade():
    for name, table, _columns, _where in reversed(INDEXES):
        if _has_index(table, name):
            op.drop_index(name, table_name=table)
