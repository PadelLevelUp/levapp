"""PAD-82: one recurring day/month season per coach

Revision ID: 7267e255bff2
Revises: ad97ec649746
Create Date: 2026-09-09

calendar.seasons rule 11. Idempotent on a prod-shaped database — every DDL
step checks for the table or column first, because prod carries drift that
never went through Alembic — and silent: PAD-91 showed every reconciliation
trigger empty in production, so `needs_review` is data only.

Steps:
  1. `seasons_legacy` — verbatim snapshot of the old `seasons` rows (created
     if missing; rows copied only when not yet present by id).
  2. `coach_seasons` — the new table, UNIQUE(coach_id).
  3. Per coach: the old row with the greatest start_date (the most recent
     intent, never a union of ranges) becomes the definition; `needs_review`
     when the coach had more than one row or the row spanned > 400 days.
     Coaches with no row get nothing.
  4. Lessons flagged `recurs_until_season_end` with a NULL `recurrence_end`
     whose coach now has a definition are capped at the end of the occurrence
     containing their start date — unless that occurrence ends within
     LATE_START_HORIZON_DAYS of the start (or the start is in a gap), in which
     case the NEXT occurrence's end is used. The two production rows start on
     2026-07-24 under a 1 Sep → 31 Jul season: "until season end" ticked a
     week before the season ends means the season about to start
     (PAD-91's option (b), threshold 30 days). This heuristic exists only for
     legacy rows; the live create path stays strictly fail-closed.
  5. Drop `seasons` (zero inbound foreign keys — PAD-83).

The occurrence maths is inlined below: migrations never import application
code (see the PAD-246 migration), so this is a copy of
`padel_app/tools/season_dates.py`, and `test_season_definition.py` checks the
two agree.
"""
from calendar import monthrange
from datetime import date, datetime

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "7267e255bff2"
down_revision = "ad97ec649746"
branch_labels = None
depends_on = None


# ---------------------------------------------------------------------------
# Occurrence maths (copy of padel_app/tools/season_dates.py)
# ---------------------------------------------------------------------------

def clamp_day(year, month, day):
    return date(year, month, min(day, monthrange(year, month)[1]))


def season_wraps_year(start_month, start_day, end_month, end_day):
    return (end_month, end_day) < (start_month, start_day)


def _occurrence_starting(year, start_month, start_day, end_month, end_day):
    start = clamp_day(year, start_month, start_day)
    end_year = year + 1 if season_wraps_year(start_month, start_day, end_month, end_day) else year
    return start, clamp_day(end_year, end_month, end_day)


def occurrence_containing(on_date, start_month, start_day, end_month, end_day):
    wraps = season_wraps_year(start_month, start_day, end_month, end_day)
    year = on_date.year
    if not wraps:
        start, end = _occurrence_starting(year, start_month, start_day, end_month, end_day)
        return (start, end) if start <= on_date <= end else None
    if on_date >= clamp_day(year, start_month, start_day):
        return _occurrence_starting(year, start_month, start_day, end_month, end_day)
    if on_date <= clamp_day(year, end_month, end_day):
        return _occurrence_starting(year - 1, start_month, start_day, end_month, end_day)
    return None


def next_occurrence_after(on_date, start_month, start_day, end_month, end_day):
    for year in (on_date.year, on_date.year + 1):
        start, end = _occurrence_starting(year, start_month, start_day, end_month, end_day)
        if start > on_date:
            return start, end
    return _occurrence_starting(on_date.year + 2, start_month, start_day, end_month, end_day)


# ---------------------------------------------------------------------------
# Pure helpers, unit-tested without a database
# ---------------------------------------------------------------------------

def collapse_seasons(rows):
    """`rows` are `(id, coach_id, name, start_date, end_date)` tuples of the old
    table. Returns `{coach_id: definition}` — the most recent row per coach
    (greatest start_date), `needs_review` when the coach had several rows or
    the chosen one spanned more than 400 days. An inverted range is tolerated
    (flagged), never a crash."""
    by_coach = {}
    for _id, coach_id, name, start_date, end_date in rows:
        by_coach.setdefault(coach_id, []).append((start_date, end_date, name))
    out = {}
    for coach_id, coach_rows in by_coach.items():
        coach_rows.sort(key=lambda r: r[0], reverse=True)  # ORDER BY start_date DESC
        start_date, end_date, name = coach_rows[0]
        span_days = (end_date - start_date).days
        out[coach_id] = dict(
            label=name,
            start_day=start_date.day,
            start_month=start_date.month,
            end_day=end_date.day,
            end_month=end_date.month,
            needs_review=len(coach_rows) > 1 or span_days > 400 or span_days < 0,
        )
    return out


LATE_START_HORIZON_DAYS = 30


def cap_for_lesson(lesson_start, definition):
    """Rule 11's cap for a legacy unbounded flagged lesson: the containing
    occurrence's end — unless the start falls in a gap or within
    LATE_START_HORIZON_DAYS of that end, in which case the next occurrence's
    end (the season the coach meant)."""
    markers = (
        definition["start_month"],
        definition["start_day"],
        definition["end_month"],
        definition["end_day"],
    )
    containing = occurrence_containing(lesson_start, *markers)
    if containing is not None and (containing[1] - lesson_start).days > LATE_START_HORIZON_DAYS:
        return containing[1]
    return next_occurrence_after(lesson_start, *markers)[1]


# ---------------------------------------------------------------------------
# Migration
# ---------------------------------------------------------------------------

def _has_table(bind, name):
    return sa.inspect(bind).has_table(name)


def upgrade():
    bind = op.get_bind()

    # 1. Snapshot.
    if not _has_table(bind, "seasons_legacy"):
        op.create_table(
            "seasons_legacy",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("coach_id", sa.Integer(), nullable=True),
            sa.Column("name", sa.String(length=120), nullable=True),
            sa.Column("start_date", sa.Date(), nullable=True),
            sa.Column("end_date", sa.Date(), nullable=True),
            sa.Column("archived_at", sa.DateTime(), nullable=True),
        )
    old_rows = []
    if _has_table(bind, "seasons"):
        old_rows = bind.execute(
            sa.text("SELECT id, coach_id, name, start_date, end_date FROM seasons ORDER BY start_date DESC")
        ).fetchall()
        already = {r[0] for r in bind.execute(sa.text("SELECT id FROM seasons_legacy")).fetchall()}
        now = datetime.utcnow()
        for _id, coach_id, name, start_date, end_date in old_rows:
            if _id in already:
                continue
            bind.execute(
                sa.text(
                    "INSERT INTO seasons_legacy (id, coach_id, name, start_date, end_date, archived_at) "
                    "VALUES (:id, :coach_id, :name, :start_date, :end_date, :archived_at)"
                ),
                dict(id=_id, coach_id=coach_id, name=name, start_date=start_date, end_date=end_date, archived_at=now),
            )

    # 2. The new table.
    if not _has_table(bind, "coach_seasons"):
        op.create_table(
            "coach_seasons",
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("coach_id", sa.Integer(), nullable=False),
            sa.Column("label", sa.String(length=120), nullable=True),
            sa.Column("start_day", sa.SmallInteger(), nullable=False),
            sa.Column("start_month", sa.SmallInteger(), nullable=False),
            sa.Column("end_day", sa.SmallInteger(), nullable=False),
            sa.Column("end_month", sa.SmallInteger(), nullable=False),
            sa.Column("needs_review", sa.Boolean(), nullable=False, server_default="0"),
            sa.ForeignKeyConstraint(["coach_id"], ["coaches.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("coach_id", name="uq_coach_seasons_coach_id"),
        )

    # 3. Collapse, for coaches that have no definition yet.
    existing = {
        r[0] for r in bind.execute(sa.text("SELECT coach_id FROM coach_seasons")).fetchall()
    }
    definitions = collapse_seasons(old_rows)
    now = datetime.utcnow()
    for coach_id, definition in definitions.items():
        if coach_id in existing:
            continue
        bind.execute(
            sa.text(
                "INSERT INTO coach_seasons (created_at, updated_at, coach_id, label, start_day, start_month, "
                "end_day, end_month, needs_review) VALUES (:created_at, :updated_at, :coach_id, :label, "
                ":start_day, :start_month, :end_day, :end_month, :needs_review)"
            ),
            dict(created_at=now, updated_at=now, coach_id=coach_id, **definition),
        )

    # 4. Cap the unbounded flagged lessons (PAD-90's live rows).
    all_definitions = {
        r[0]: dict(start_day=r[1], start_month=r[2], end_day=r[3], end_month=r[4])
        for r in bind.execute(
            sa.text("SELECT coach_id, start_day, start_month, end_day, end_month FROM coach_seasons")
        ).fetchall()
    }
    if _has_table(bind, "lessons") and _has_table(bind, "coach_in_lesson"):
        unbounded = bind.execute(
            sa.text(
                "SELECT l.id, l.start_datetime, cil.coach_id FROM lessons l "
                "JOIN coach_in_lesson cil ON cil.lesson_id = l.id "
                "WHERE l.recurs_until_season_end = TRUE AND l.recurrence_end IS NULL"
            )
        ).fetchall()
        for lesson_id, start_datetime, coach_id in unbounded:
            definition = all_definitions.get(coach_id)
            if definition is None or start_datetime is None:
                continue
            start = start_datetime.date() if hasattr(start_datetime, "date") else datetime.fromisoformat(str(start_datetime)).date()
            bind.execute(
                sa.text("UPDATE lessons SET recurrence_end = :end WHERE id = :id AND recurrence_end IS NULL"),
                dict(end=cap_for_lesson(start, definition), id=lesson_id),
            )

    # 5. The old table goes.
    if _has_table(bind, "seasons"):
        op.drop_table("seasons")


def downgrade():
    bind = op.get_bind()
    if not _has_table(bind, "seasons"):
        op.create_table(
            "seasons",
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("coach_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("start_date", sa.Date(), nullable=False),
            sa.Column("end_date", sa.Date(), nullable=False),
            sa.ForeignKeyConstraint(["coach_id"], ["coaches.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        if _has_table(bind, "seasons_legacy"):
            bind.execute(
                sa.text(
                    "INSERT INTO seasons (id, coach_id, name, start_date, end_date, created_at, updated_at) "
                    "SELECT id, coach_id, name, start_date, end_date, archived_at, archived_at FROM seasons_legacy"
                )
            )
    if _has_table(bind, "coach_seasons"):
        op.drop_table("coach_seasons")
    # seasons_legacy is left in place: it is the audit trail.
