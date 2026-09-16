"""Datetime utilities and the backend's two clocks (R-023, PAD-256).

Event timestamps (created_at, sent_at, decided_at, expires_at, ...) are naive
UTC. Class, block and request times (`start_datetime` / `end_datetime` on
lessons, lesson_instances, calendar_blocks and class_requests) are naive Lisbon
wall-clock: the digits the person typed. Compare each with its own clock
(`utcnow_naive()` / `club_now_naive()`) and cross between the two only through
`wall_to_utc_naive()` / `utc_to_wall_naive()`."""

from datetime import datetime, time, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

# The club's wall clock. Every human-facing "day", "hour" or "week" in the
# product is read off THIS clock, and class, block and request times are stored
# on it as naive wall-clock values (R-023, PAD-256). Event timestamps are naive UTC.
#
# PAD-144: this constant previously existed in three places (`scheduler`,
# `student_availability_service`, and lazily imported into `notification_service`
# from the first). It lives here now so the next site cannot invent a fourth.
# `utils.dates` imports nothing from the app, so there is no circular-import
# risk in depending on it from anywhere.
CLUB_TZ = ZoneInfo("Europe/Lisbon")


def utcnow_naive() -> datetime:
    """Return the current time as a naive UTC datetime.

    Equivalent to the deprecated `datetime.utcnow()`, but uses a timezone-aware
    intermediate to avoid host-timezone drift.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utc_to_wall_naive(instant: Optional[datetime]) -> Optional[datetime]:
    """A naive UTC instant as a naive Lisbon wall-clock value (R-023)."""
    if instant is None:
        return None
    return instant.replace(tzinfo=timezone.utc).astimezone(CLUB_TZ).replace(tzinfo=None)


def wall_to_utc_naive(wall: Optional[datetime]) -> Optional[datetime]:
    """A naive Lisbon wall-clock value (a class, block or request time) as a
    naive UTC instant (R-023).

    `zoneinfo` applies the offset in force on that wall date, so a class stored
    at 14:00 is 13:00 UTC in July and 14:00 UTC in January. A wall time inside
    the spring-forward gap (01:00-01:59 on the change day) does not exist on the
    club's clock and resolves one hour forward; no real class sits there.
    """
    if wall is None:
        return None
    return wall.replace(tzinfo=CLUB_TZ).astimezone(timezone.utc).replace(tzinfo=None)


def club_now_naive() -> datetime:
    """'Now' on the club's wall clock, the clock class times are stored in.

    Compare the `start_datetime` / `end_datetime` of classes, blocks and
    requests with this, never with `utcnow_naive()` (R-023, PAD-256). It is
    derived from `utcnow_naive()`, so a test that pins one pins both.
    """
    return utc_to_wall_naive(utcnow_naive())


def to_utc_iso(dt: Optional[datetime]) -> Optional[str]:
    """Serialize a datetime as a UTC-aware ISO 8601 string.

    Datetimes are stored naive-UTC in the DB. Calling `.isoformat()` on those
    produces a string with no timezone offset (e.g. "2026-07-01T17:00:00"),
    which browsers' `new Date(...)` interpret as *local* time — displaying the
    wrong wall-clock (e.g. 1 hour behind in Lisbon summer time). Attaching the
    UTC offset here lets clients convert to the viewer's local timezone.

    A naive datetime is assumed to be UTC. An already-aware datetime is
    converted to UTC. Returns None for None.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat()


def club_day_start_utc(instant: datetime, *, days_offset: int = 0) -> datetime:
    """Naive-UTC instant at which a CLUB-LOCAL calendar day begins.

    `instant` is a naive UTC datetime (as stored). The returned value is the
    naive-UTC instant of local midnight starting the club-local day that
    contains `instant`, shifted by `days_offset` calendar days.

    PAD-144. Day boundaries that a coach reads off their own calendar ("per
    day", "tomorrow") are club-local, but they must be compared against columns
    stored as naive UTC. Deriving them with a bare `.replace(hour=0, ...)` on a
    naive-UTC instant silently pins them to UTC midnight, which is 01:00 local
    through Portuguese summer time (WEST = UTC+1) and correct only in winter
    (WET = UTC+0) — which is why the resulting bugs always look intermittent.
    So: convert out to local, take the calendar day there, then convert back.

    `days_offset` walks CALENDAR days rather than adding 24-hour blocks, so a
    step across a DST transition still lands on real local midnight.
    """
    local = instant.replace(tzinfo=timezone.utc).astimezone(CLUB_TZ)
    target_date = local.date() + timedelta(days=days_offset)
    local_midnight = datetime.combine(target_date, time.min, tzinfo=CLUB_TZ)
    return local_midnight.astimezone(timezone.utc).replace(tzinfo=None)
