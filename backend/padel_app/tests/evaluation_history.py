"""Past-dated evaluation entries for tests and for the E2E seed (PAD-362).

`POST /api/app/add_evaluation_entry` always stamps `utcnow`, so history cannot be
produced through the API; the only product path that writes a historical
`evaluated_at` is the bulk import. This writes the rows directly.

Every date is derived from the `anchor` the caller passes — never from the wall
clock — so a test that pins "now" pins its fixtures with it (B-100).
"""
from datetime import datetime, timedelta

from padel_app.sql_db import db


def seed_evaluation_history(coach_player_id: int, category_id: int, points, *, anchor: datetime, in_records: bool = False) -> list:
    """Write one EvaluationEntry per ``(days_before_anchor, score)`` in ``points``.

    Returns the new entry ids, oldest first. Flushes, does not commit: the
    caller owns the transaction. `in_records=True` (PAD-375) also files each row in
    its day's evaluation record, which is what the v2 reads serve; the default
    leaves them record-less, as every row was before PAD-363.
    """
    from padel_app.models import EvaluationEntry

    if not isinstance(anchor, datetime):
        raise TypeError("anchor must be a datetime the caller chose, not the wall clock")
    entries = []
    for days_before, score in sorted(points, key=lambda point: -point[0]):
        entry = EvaluationEntry(
            coach_player_id=coach_player_id,
            category_id=category_id,
            score=float(score),
            evaluated_at=anchor - timedelta(days=days_before),
        )
        db.session.add(entry)
        entries.append(entry)
    db.session.flush()
    if in_records:
        # PAD-375: the record API reads ONLY ratings that sit in a record (Q29), so history meant
        # for the new surfaces — the "Histórico" cards, "Evolução" — is filed the way the one writer
        # files it: each row in the class-less record of its club-local day. Inside a unit of work
        # (the E2E seed) this only flushes; the caller commits when its unit of work ends.
        from padel_app.services import evaluation_record_service as records

        for entry in entries:
            record = records.get_or_create_record(coach_player_id, day=records.record_day(entry.evaluated_at))
            entry.record_id = record.id
        db.session.flush()
    return [entry.id for entry in entries]
