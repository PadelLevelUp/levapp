"""Every date the E2E seed plants, as a pure function of ``today`` (PAD-223).

The seed used to compute each fixture's date inline with weekday arithmetic
(``(7 - today.weekday()) % 7 or 7`` and friends). Two of those collided on
particular weekdays and failed specs unrelated to the code under test:

* **Monday**: "E2E Academy Class" landed a full week out (next Monday) while
  the Tuesday recurring class landed *tomorrow*, so the dashboard's "next
  class" — and the PAD-79 deep-link specs and the PAD-202 student home spec
  that read it — was the recurring class, not the academy one.
* **Sunday**: the "E2E Pending Confirm Class" ("tomorrow 18:00") fell on the
  first Monday after today, the very slot the availability spec reserves for
  its 18:00–20:00 blocker, so its "warns the coach" assertion tripped on a
  class it never meant to touch.

The anchors below are chosen so that no two fixtures can coincide on ANY
weekday, and ``test_seed_dates.py`` proves it by walking all seven. Rules:

* The academy class stays on **next Monday 10:00** — several specs read it
  as "in a later week than the calendar's default" — and the recurring
  Tuesday class starts on the **Tuesday after that Monday**, so the academy
  class is always the soonest class the student has, on every weekday.
* The pending-confirm class stays **tomorrow** (PAD-144's "tomorrow" is the
  behaviour under test) but at **12:00–13:00**, clear of every window the
  availability specs use (15:00–16:00, 18:00–20:00, 19:15–19:45).
* Everything else keeps its offset; it is listed here so the invariants can
  be asserted in one place.

Keep this module dependency-free: the pytest that guards it must run without
Flask, and the seed imports it from the same directory.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Tuple
from zoneinfo import ZoneInfo

# PAD-256 (R-023): fixture times are Lisbon wall-clock, like every class time,
# so the seed's "today" is the date on the club's clock.
CLUB_TZ = ZoneInfo("Europe/Lisbon")


def seed_today(env: dict | None = None) -> datetime:
    """Midnight of the club's (Lisbon) day the seed is anchored on (PAD-256).

    ``E2E_SEED_TODAY=YYYY-MM-DD`` pins it, so a run can be reproduced on any
    weekday; otherwise it is today's date on the club's clock. Between 00:00 and
    01:00 Lisbon in summer that is already the next UTC day's date.
    """
    env = os.environ if env is None else env
    pinned = env.get("E2E_SEED_TODAY")
    if pinned:
        return datetime.strptime(pinned, "%Y-%m-%d")
    return datetime.now(CLUB_TZ).replace(tzinfo=None, hour=0, minute=0, second=0, microsecond=0)


@dataclass(frozen=True)
class SeedDates:
    today: datetime
    academy_start: datetime
    academy_end: datetime
    declined_start: datetime
    declined_end: datetime
    recurring_start: datetime
    recurring_end: datetime
    recurring_rule: str
    recurring_end_date: object
    pending_start: datetime
    pending_end: datetime
    attended_starts: Tuple[datetime, ...]
    missed_starts: Tuple[Tuple[datetime, str], ...]
    validation_lesson_start: datetime
    validation_starts: Tuple[Tuple[datetime, bool], ...]


def _next_weekday(today: datetime, weekday: int) -> datetime:
    """The next occurrence of ``weekday`` (Mon=0) strictly after ``today``."""
    return today + timedelta(days=(weekday - today.weekday()) % 7 or 7)


def seed_dates(today: datetime) -> SeedDates:
    today = today.replace(hour=0, minute=0, second=0, microsecond=0)

    # Future class (next Monday 10:00), Lisbon wall-clock like every class time (R-023).
    next_monday = _next_weekday(today, 0)
    academy_start = next_monday.replace(hour=10)

    # Declined-count class: next Thursday 16:00 (PAD-71).
    next_thursday = _next_weekday(today, 3)
    declined_start = next_thursday.replace(hour=16)

    # Weekly recurring class on Tuesdays, starting the Tuesday AFTER the
    # academy class's Monday so it can never be the student's soonest class.
    first_tuesday = next_monday + timedelta(days=1)
    recurring_start = first_tuesday.replace(hour=14)
    recurring_end_date = (first_tuesday + timedelta(weeks=8)).date()
    # Python weekday() (Mon=0) → the app's JS getDay() convention (Sun=0).
    recurring_rule = json.dumps(
        {"frequency": "weekly", "daysOfWeek": [(first_tuesday.weekday() + 1) % 7]}
    )

    # Pending-confirm class (PAD-78/PAD-144): TOMORROW, at noon — away from
    # the availability specs' evening windows.
    pending_start = (today + timedelta(days=1)).replace(hour=12)

    attended_starts = tuple(
        (today - timedelta(days=d)).replace(hour=11) for d in (8, 15, 45, 120, 250)
    )
    missed_starts = tuple(
        ((today - timedelta(days=d)).replace(hour=11), justification)
        for d, justification in ((10, "justified"), (20, "unjustified"), (200, "justified"))
    )

    # Validation fixture: previous week's Wednesday and Thursday at 11:00 (Lisbon wall-clock) —
    # always in the past and always an earlier week than today.
    prev_monday = today - timedelta(days=today.weekday() + 7)
    validation_starts = tuple(
        ((prev_monday + timedelta(days=offset)).replace(hour=11), everyone_answered)
        for offset, everyone_answered in ((2, True), (3, False))
    )
    validation_lesson_start = today - timedelta(days=today.weekday() + 5)

    hour = timedelta(hours=1)
    return SeedDates(
        today=today,
        academy_start=academy_start,
        academy_end=academy_start + hour,
        declined_start=declined_start,
        declined_end=declined_start + hour,
        recurring_start=recurring_start,
        recurring_end=recurring_start + hour,
        recurring_rule=recurring_rule,
        recurring_end_date=recurring_end_date,
        pending_start=pending_start,
        pending_end=pending_start + hour,
        attended_starts=attended_starts,
        missed_starts=missed_starts,
        validation_lesson_start=validation_lesson_start,
        validation_starts=validation_starts,
    )
