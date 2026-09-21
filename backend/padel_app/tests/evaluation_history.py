"""Past-dated evaluation entries for tests and for the E2E seed (PAD-362).

`POST /api/app/add_evaluation_entry` always stamps `utcnow`, so history cannot be
produced through the API; the only product path that writes a historical
`evaluated_at` is the bulk import. This writes the rows directly.

Every date is derived from the `anchor` the caller passes — never from the wall
clock — so a test that pins "now" pins its fixtures with it (B-100).
"""
from datetime import datetime, timedelta

from padel_app.sql_db import db


def seed_evaluation_history(coach_player_id: int, category_id: int, points, *, anchor: datetime) -> list:
    """Write one EvaluationEntry per ``(days_before_anchor, score)`` in ``points``.

    Returns the new entry ids, oldest first. Flushes, does not commit: the
    caller owns the transaction.
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
    return [entry.id for entry in entries]
