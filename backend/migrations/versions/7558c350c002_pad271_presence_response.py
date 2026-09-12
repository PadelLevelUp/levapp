"""PAD-271 M5: one presence response field; late_cancellation derived; dead status values dropped

Revision ID: 7558c350c002
Revises: 5f2a0bb50712
Create Date: 2026-09-11

Decided 2026-09-11 (coordinator, owner informed), attendance.presence rule 7.
Guarded so a re-run is a no-op; staging is a prod copy per deploy (PAD-200).

1. `presences.response` VARCHAR(20) NOT NULL DEFAULT 'none' with a CHECK on the
   five values, `responded_at` TIMESTAMP NULL, `recorded_by` VARCHAR(10) NULL
   with a CHECK on the four writers.
2. Backfill, ONE statement on Postgres (loop on SQLite), mirroring
   ``services/presence_response.response_from_legacy_flags`` exactly:
     status='absent' AND validated=false AND late_cancellation=true -> 'cancelled'
     status='absent' AND validated=false                             -> 'declined'
     confirmed=true AND status IS DISTINCT FROM 'absent'             -> 'confirmed'
     else                                                           -> 'none'
   responded_at = the latest reminder_attempts.responded_at for the same
   (lesson_instance_id, player_id) where one exists; recorded_by = 'student'
   where an answer was recorded. Only rows still at the default are touched,
   so a second run changes nothing.
3. Five counts logged at INFO for the deploy watch: rows per response value
   and rows_with_responded_at. The upgrade FAILS if any row has response NULL.
4. `late_cancellation` is dropped AFTER the backfill read it: lateness is
   derived on read from response + responded_at against the deadline.
5. The never-written enum values are dropped, each guarded: 'queued' from
   notification_event_status, 'ended' from lesson_status, 'rescheduled' from
   lesson_instance_status. Postgres cannot DROP VALUE, so the type is recreated
   without the value (new type, ALTER COLUMN ... USING, drop old, rename). A
   value still held by a row is SKIPPED with a WARNING and its count; SQLite is
   a no-op (tests rebuild the schema from the models).

Downgrade re-adds late_cancellation (true where response='cancelled'), drops
the three columns and their checks, and re-adds the three enum values.
"""
import logging

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect as sa_inspect

revision = "7558c350c002"
down_revision = "5f2a0bb50712"
branch_labels = None
depends_on = None

log = logging.getLogger("alembic.runtime.migration")

RESPONSES = ("none", "confirmed", "declined", "cancelled", "proactive_decline")
RECORDED_BY = ("student", "coach", "system", "import")
CK_RESPONSE = "ck_presences_response"
CK_RESPONSE_SQL = "response IN ('none', 'confirmed', 'declined', 'cancelled', 'proactive_decline')"
CK_RECORDED_BY = "ck_presences_recorded_by"
CK_RECORDED_BY_SQL = "recorded_by IS NULL OR recorded_by IN ('student', 'coach', 'system', 'import')"

#: (enum type name, table, column, value to drop)
DEAD_VALUES = (
    ("notification_event_status", "notification_events", "status", "queued"),
    ("lesson_status", "lessons", "status", "ended"),
    ("lesson_instance_status", "lesson_instances", "status", "rescheduled"),
)

#: The mapping, as SQL. `{false}` / `{true}` are substituted per dialect.
BACKFILL_RESPONSE = """
UPDATE presences SET
  response = CASE
    WHEN status = 'absent' AND validated = {false} AND late_cancellation = {true} THEN 'cancelled'
    WHEN status = 'absent' AND validated = {false} THEN 'declined'
    WHEN confirmed = {true} AND (status IS NULL OR status <> 'absent') THEN 'confirmed'
    ELSE 'none' END,
  responded_at = (SELECT max(ra.responded_at) FROM reminder_attempts ra
                  WHERE ra.lesson_instance_id = presences.lesson_instance_id
                    AND ra.player_id = presences.player_id
                    AND ra.responded_at IS NOT NULL)
WHERE response = 'none' AND recorded_by IS NULL
"""

STAMP_RECORDED_BY = """
UPDATE presences SET recorded_by = 'student'
WHERE response <> 'none' AND recorded_by IS NULL
"""

COUNT_BY_RESPONSE = "SELECT response, count(*) FROM presences GROUP BY response"
COUNT_RESPONDED = "SELECT count(*) FROM presences WHERE responded_at IS NOT NULL"
COUNT_NULL = "SELECT count(*) FROM presences WHERE response IS NULL"


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


def _add_check(table, name, sql, sqlite):
    if _has_check(table, name):
        return
    if sqlite:
        with op.batch_alter_table(table) as batch:
            batch.create_check_constraint(name, sql)
    else:
        op.create_check_constraint(name, table, sql)


def _drop_check(table, name, sqlite):
    if not _has_check(table, name):
        return
    if sqlite:
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint(name, type_="check")
    else:
        op.drop_constraint(name, table, type_="check")


def _enum_values(type_name):
    """Postgres only: the current labels of an enum type, or None if absent."""
    rows = op.get_bind().execute(sa.text(
        "SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid "
        "WHERE t.typname = :n ORDER BY e.enumsortorder"
    ), {"n": type_name}).fetchall()
    return [r[0] for r in rows] if rows else None


def _recreate_enum(type_name, table, column, values):
    """Replace a Postgres enum type by one holding exactly ``values``."""
    bind = op.get_bind()
    tmp = f"{type_name}_pad271"
    labels = ", ".join(f"'{v}'" for v in values)
    bind.execute(sa.text(f"CREATE TYPE {tmp} AS ENUM ({labels})"))
    default = bind.execute(sa.text(
        "SELECT column_default FROM information_schema.columns "
        "WHERE table_name = :t AND column_name = :c"
    ), {"t": table, "c": column}).scalar()
    if default:
        bind.execute(sa.text(f"ALTER TABLE {table} ALTER COLUMN {column} DROP DEFAULT"))
    bind.execute(sa.text(
        f"ALTER TABLE {table} ALTER COLUMN {column} TYPE {tmp} USING {column}::text::{tmp}"
    ))
    bind.execute(sa.text(f"DROP TYPE {type_name}"))
    bind.execute(sa.text(f"ALTER TYPE {tmp} RENAME TO {type_name}"))
    if default:
        # e.g. 'scheduled'::lesson_instance_status — re-point at the new type name.
        literal = default.split("::")[0]
        bind.execute(sa.text(
            f"ALTER TABLE {table} ALTER COLUMN {column} SET DEFAULT {literal}::{type_name}"
        ))


def _drop_dead_values():
    bind = op.get_bind()
    for type_name, table, column, dead in DEAD_VALUES:
        values = _enum_values(type_name)
        if values is None or dead not in values:
            continue
        held = bind.execute(sa.text(
            f"SELECT count(*) FROM {table} WHERE {column} = :v"
        ), {"v": dead}).scalar()
        if held:
            log.warning(
                "PAD-271: %s.%s still holds %s row(s) with %r — value NOT dropped from %s",
                table, column, held, dead, type_name,
            )
            continue
        _recreate_enum(type_name, table, column, [v for v in values if v != dead])
        log.info("PAD-271: dropped %r from enum %s", dead, type_name)


def _readd_dead_values():
    for type_name, _table, _column, dead in DEAD_VALUES:
        values = _enum_values(type_name)
        if values is None or dead in values:
            continue
        # ADD VALUE cannot run inside a transaction on older Postgres; recreating
        # the type the same way the upgrade did keeps this in one transaction.
        _recreate_enum(type_name, _table, _column, values + [dead])


def upgrade():
    bind = op.get_bind()
    sqlite = bind.dialect.name == "sqlite"
    true, false = ("1", "0") if sqlite else ("TRUE", "FALSE")

    # 1. Columns and checks.
    if _column("presences", "response") is None:
        op.add_column("presences", sa.Column("response", sa.String(20), nullable=False, server_default="none"))
    if _column("presences", "responded_at") is None:
        op.add_column("presences", sa.Column("responded_at", sa.DateTime(), nullable=True))
    if _column("presences", "recorded_by") is None:
        op.add_column("presences", sa.Column("recorded_by", sa.String(10), nullable=True))
    _add_check("presences", CK_RESPONSE, CK_RESPONSE_SQL, sqlite)
    _add_check("presences", CK_RECORDED_BY, CK_RECORDED_BY_SQL, sqlite)

    # 2. Backfill, while late_cancellation still exists to be read.
    if _column("presences", "late_cancellation") is not None:
        bind.execute(sa.text(BACKFILL_RESPONSE.format(true=true, false=false)))
        bind.execute(sa.text(STAMP_RECORDED_BY))

    # 3. Counts for the deploy watch; fail closed on a NULL answer.
    counts = {r[0]: r[1] for r in bind.execute(sa.text(COUNT_BY_RESPONSE)).fetchall()}
    responded = _scalar(COUNT_RESPONDED)
    log.info(
        "PAD-271 backfill: response_none=%s response_confirmed=%s response_declined=%s "
        "response_cancelled=%s response_proactive_decline=%s rows_with_responded_at=%s",
        counts.get("none", 0), counts.get("confirmed", 0), counts.get("declined", 0),
        counts.get("cancelled", 0), counts.get("proactive_decline", 0), responded,
    )
    if _scalar(COUNT_NULL) != 0:
        raise RuntimeError("PAD-271 backfill incomplete: presences.response is NULL on some rows")

    # 4. late_cancellation is derived from now on.
    if _column("presences", "late_cancellation") is not None:
        if sqlite:
            with op.batch_alter_table("presences") as batch:
                batch.drop_column("late_cancellation")
        else:
            op.drop_column("presences", "late_cancellation")

    # 5. Dead enum values (Postgres only).
    if not sqlite:
        _drop_dead_values()


def downgrade():
    bind = op.get_bind()
    sqlite = bind.dialect.name == "sqlite"
    if _column("presences", "late_cancellation") is None:
        op.add_column("presences", sa.Column("late_cancellation", sa.Boolean(), nullable=False, server_default=sa.text("false") if not sqlite else "0"))
        if _column("presences", "response") is not None:
            bind.execute(sa.text(
                "UPDATE presences SET late_cancellation = %s WHERE response = 'cancelled'" % ("1" if sqlite else "TRUE")
            ))
    for name in (CK_RESPONSE, CK_RECORDED_BY):
        _drop_check("presences", name, sqlite)
    for col in ("recorded_by", "responded_at", "response"):
        if _column("presences", col) is not None:
            if sqlite:
                with op.batch_alter_table("presences") as batch:
                    batch.drop_column(col)
            else:
                op.drop_column("presences", col)
    if not sqlite:
        _readd_dead_values()
