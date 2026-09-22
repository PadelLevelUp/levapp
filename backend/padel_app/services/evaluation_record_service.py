"""The one writer of evaluation scores (PAD-363, evaluations.records).

An evaluation is a **record**: one coach-player, one day, an optional class, one
private note, and at most one rating per category. A rating is an
`evaluation_entries` row whose `record_id` points at the record.

"The day" is the calendar date on the club's clock (`utils.dates.CLUB_TZ`,
R-023) of the naive-UTC instant the score was given — there is no per-coach
zone. 23:30 UTC on a summer evening already belongs to the next day.

Two ways a rating is written, because two kinds of caller exist:

- **append** — the legacy `POST /app/add_evaluation_entry` and the import. Every
  score stays a row of its own (the table has always been append-only history);
  the latest row of the day holds the record's slot for its category, and the
  one it replaces becomes record-less. This is exactly what the PAD-363 backfill
  did to the rows that were already there.
- **in place** — `upsert_rating` without `append`, for the record API: re-rating
  a category in the same record updates its one row.

Bulk deletes that go around this module (an import revert deletes its entries by
id) can remove a slot's holder without giving the slot back to the row it had
displaced: that row stays record-less. Harmless — record-less rows are history —
and deliberate: a revert restores the rows, not the bookkeeping.

Everything here flushes or commits through `commit_or_flush`, like `Model.create()`.
"""
from datetime import date, datetime, timezone

from sqlalchemy.exc import IntegrityError

from padel_app.sql_db import db
from padel_app.models import (
    Association_CoachPlayer,
    EvaluationCategory,
    EvaluationEntry,
    EvaluationRecord,
)
from padel_app.tools.unit_of_work import commit_or_flush
from padel_app.utils.dates import utc_to_wall_naive, utcnow_naive


def record_day(instant: datetime | None = None) -> date:
    """The club-local calendar date of `instant` (naive = UTC; default: now)."""
    if instant is None:
        instant = utcnow_naive()
    elif instant.tzinfo is not None:
        instant = instant.astimezone(timezone.utc).replace(tzinfo=None)
    return utc_to_wall_naive(instant).date()


def _find_record(coach_player_id, day, lesson_instance_id):
    query = EvaluationRecord.query.filter_by(coach_player_id=coach_player_id, evaluated_on=day)
    if lesson_instance_id is None:
        query = query.filter(EvaluationRecord.lesson_instance_id.is_(None))
    else:
        query = query.filter_by(lesson_instance_id=lesson_instance_id)
    return query.first()


def get_or_create_record(coach_player_id, *, day: date | None = None, lesson_instance_id=None) -> EvaluationRecord:
    """The record for (coach-player, class-or-none, day); created when absent.

    Two requests racing for the same record: the partial unique indexes let one
    insert win; the loser's savepoint rolls back and it reads the winner's row.
    """
    day = day or record_day()
    record = _find_record(coach_player_id, day, lesson_instance_id)
    if record is not None:
        return record
    try:
        with db.session.begin_nested():
            record = EvaluationRecord(
                coach_player_id=coach_player_id, lesson_instance_id=lesson_instance_id, evaluated_on=day,
            )
            db.session.add(record)
    except IntegrityError:
        record = _find_record(coach_player_id, day, lesson_instance_id)
        if record is None:
            raise
    commit_or_flush()
    return record


def _holder(record, category_id):
    return EvaluationEntry.query.filter_by(record_id=record.id, category_id=category_id).first()


def _take_slot(record, entry):
    """Give `entry` its category's slot in `record` unless a later row holds it.

    Never fails the caller. Two saves for the same coach-player, category and day
    in flight together both read "nobody holds the slot" and both take it; the
    unique (record_id, category_id) index lets one win. The loser's savepoint is
    rolled back and its entry simply stays record-less: the score is kept (no
    legacy save may fail, or lose a score, over record bookkeeping — the endpoint
    is frozen), it is history like any earlier row of the day, and the record API
    does not read record-less rows. Returns whether the entry holds the slot.
    """
    try:
        with db.session.begin_nested():
            holder = _holder(record, entry.category_id)
            if holder is not None and holder.id != entry.id:
                if (holder.evaluated_at, holder.id) > (entry.evaluated_at, entry.id):
                    return False  # an older score arriving late (an import): it is history
                holder.record_id = None
                db.session.flush()  # free the slot before the unique index sees two holders
            entry.record_id = record.id
            db.session.flush()
        return True
    except IntegrityError:
        # The savepoint rollback expired what it touched; the entry row itself was
        # flushed before it and stands, with record_id NULL.
        return False


def append_entry(entry: EvaluationEntry, *, lesson_instance_id=None) -> EvaluationEntry:
    """Persist a fully-built entry as a new row of history and give it the slot
    in its day's record.

    The entry is flushed BEFORE the record is looked up or created, so a row the
    database refuses (the legacy form layer can hand over a NULL score — B-136,
    pinned by PAD-362) fails without stranding an empty record.
    """
    db.session.add(entry)
    db.session.flush()
    record = get_or_create_record(
        entry.coach_player_id, day=record_day(entry.evaluated_at), lesson_instance_id=lesson_instance_id,
    )
    _take_slot(record, entry)
    commit_or_flush()
    return entry


def _category_of(record, category_id) -> EvaluationCategory:
    category = db.session.get(EvaluationCategory, category_id)
    link = record.coach_player or db.session.get(Association_CoachPlayer, record.coach_player_id)
    if category is None or category.coach_id != link.coach_id:
        raise ValueError(f"category {category_id!r} does not belong to this record's coach")
    return category


def upsert_rating(record, category_id, score, *, evaluated_at: datetime | None = None, append=False) -> EvaluationEntry:
    """Rate `category_id` in `record`. In place by default; `append=True` keeps
    the previous score as a row of history (see the module docstring)."""
    category = _category_of(record, category_id)
    when = evaluated_at or utcnow_naive()

    def in_place():
        holder = _holder(record, category.id)
        if holder is not None:
            holder.score = float(score)
            if evaluated_at is not None:
                holder.evaluated_at = evaluated_at
        return holder

    if not append:
        holder = in_place()
        if holder is not None:
            commit_or_flush()
            return holder

    entry = EvaluationEntry(
        coach_player_id=record.coach_player_id, category_id=category.id, score=float(score), evaluated_at=when,
    )
    if append:
        db.session.add(entry)
        db.session.flush()
        _take_slot(record, entry)
        commit_or_flush()
        return entry

    # In place, and the record has no rating yet: a double tap can race here too.
    # The loser must not leave a second row behind — it re-reads and updates the winner's.
    try:
        with db.session.begin_nested():
            entry.record_id = record.id
            db.session.add(entry)
            db.session.flush()
    except IntegrityError:
        entry = in_place()
        if entry is None:
            raise
    commit_or_flush()
    return entry


def clear_rating(record, category_id) -> bool:
    """Remove the record's rating for a category. False when it had none."""
    holder = _holder(record, category_id)
    if holder is None:
        return False
    db.session.delete(holder)
    commit_or_flush()
    return True


def set_note(record, note) -> EvaluationRecord:
    record.note = (note or "").strip() or None
    commit_or_flush()
    return record


def _is_empty(record) -> bool:
    return record.note is None and EvaluationEntry.query.filter_by(record_id=record.id).count() == 0


def delete_record_if_empty(record) -> bool:
    """Delete a record that holds neither a rating nor a note."""
    if not _is_empty(record):
        return False
    db.session.delete(record)
    commit_or_flush()
    return True


def prune_empty_records(coach_player_ids, *, commit=True) -> int:
    """After a bulk removal of entries (a category delete, an import revert):
    drop the records of these coach-players that were left with nothing.
    `commit=False` only flushes, for a caller that commits its own unit."""
    ids = list({i for i in coach_player_ids if i is not None})
    if not ids:
        return 0
    held = db.session.query(EvaluationEntry.record_id).filter(EvaluationEntry.record_id.isnot(None))
    empty = (
        EvaluationRecord.query
        .filter(EvaluationRecord.coach_player_id.in_(ids))
        .filter(EvaluationRecord.note.is_(None))
        .filter(~EvaluationRecord.id.in_(held))
        .all()
    )
    for record in empty:
        db.session.delete(record)
    if empty:
        if commit:
            commit_or_flush()
        else:
            db.session.flush()
    return len(empty)


def latest_legacy_entries(coach_player) -> list:
    """The latest score per LEGACY category of a coach-player — all that the
    endpoints App Store 1.0/1.1.0 call may see (evaluations.legacy-client-contract,
    R-047). Same order as `Association_CoachPlayer.current_evaluations`."""
    return [entry for entry in coach_player.current_evaluations if entry.category.is_legacy]
