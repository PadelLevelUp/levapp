"""'Later' on a needs-you queue item (dashboard.blocks rule 3c).

A snooze hides one empty-seats card from the coach's queue for
``SNOOZE_HOURS``. It is stored server-side so the same coach sees the same
queue on the web and on the phone, and it expires on its own — nothing is
resolved by it, the class is simply not nagging for a day.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Optional, Set

from padel_app.models import NeedsYouSnooze
from padel_app.sql_db import db
from padel_app.utils.dates import utcnow_naive

SNOOZE_HOURS = 24

# `lessoninstance-<pk>` or `lesson-<pk>-<YYYY-MM-DD>`; anything else is not a
# queue item id and is rejected before it reaches the table.
ITEM_ID_RE = re.compile(r"^[a-z]+-\d+(?:-\d{4}-\d{2}-\d{2})?$")


def is_item_id(value: object) -> bool:
    return isinstance(value, str) and len(value) <= 64 and bool(ITEM_ID_RE.match(value))


def snooze_item(*, coach_id: int, item_id: str, now: Optional[datetime] = None) -> datetime:
    """Push one queue item back by ``SNOOZE_HOURS`` from ``now``; returns the new deadline.

    Snoozing an already-snoozed item restarts the clock rather than stacking,
    so "Later" always means the same thing.
    """
    now = now or utcnow_naive()
    until = now + timedelta(hours=SNOOZE_HOURS)
    row = NeedsYouSnooze.query.filter_by(coach_id=coach_id, item_id=item_id).one_or_none()
    if row is None:
        row = NeedsYouSnooze(coach_id=coach_id, item_id=item_id, snoozed_until=until)
        db.session.add(row)
    else:
        row.snoozed_until = until
    db.session.commit()
    return until


def snoozed_item_ids(*, coach_id: int, now: Optional[datetime] = None) -> Set[str]:
    """The item ids this coach has snoozed and whose snooze has not yet lapsed."""
    now = now or utcnow_naive()
    rows = (
        db.session.query(NeedsYouSnooze.item_id)
        .filter(NeedsYouSnooze.coach_id == coach_id, NeedsYouSnooze.snoozed_until > now)
        .all()
    )
    return {item_id for (item_id,) in rows}
