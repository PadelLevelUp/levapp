import json
from dateutil.rrule import rrule, WEEKLY, MO, TU, WE, TH, FR, SA, SU
from datetime import datetime, timezone, time

def ensure_utc(dt):
    if dt is None:
        return None

    if isinstance(dt, datetime) is False:
        if hasattr(dt, "year") and hasattr(dt, "month") and hasattr(dt, "day"):
            dt = datetime.combine(dt, time.max)

    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)

    return dt.astimezone(timezone.utc)

WEEKDAY_MAP = {
    0: SU,
    1: MO,
    2: TU,
    3: WE,
    4: TH,
    5: FR,
    6: SA,
}

FREQ_MAP = {
    "weekly": WEEKLY,
}

def build_rrule(recurrence_rule, dtstart, until=None):
    if not recurrence_rule:
        return None

    try:
        rule = json.loads(recurrence_rule)
    except (TypeError, ValueError):
        return None

    freq = FREQ_MAP.get(rule.get("frequency"))
    if not freq:
        return None

    byweekday = [
        WEEKDAY_MAP[d]
        for d in rule.get("daysOfWeek", [])
        if d in WEEKDAY_MAP
    ]

    return rrule(
        freq=freq,
        dtstart=ensure_utc(dtstart),
        byweekday=byweekday or None,
        until=ensure_utc(until),
    )
    
def expand_occurrences(
    start_datetime,
    recurrence_rule,
    recurrence_end,
    range_start,
    range_end,
):
    range_start = ensure_utc(range_start)
    range_end = ensure_utc(range_end)
    start_datetime = ensure_utc(start_datetime)
    recurrence_end = ensure_utc(recurrence_end)

    # Non-recurring
    if not recurrence_rule:
        if range_start <= start_datetime <= range_end:
            return [start_datetime]
        return []

    rule = build_rrule(
        recurrence_rule,
        dtstart=start_datetime,
        until=recurrence_end,
    )

    if not rule:
        return []

    return rule.between(range_start, range_end, inc=True)

def build_datetime(date_str: str, time_str: str) -> datetime:
    return datetime.strptime(
        f"{date_str} {time_str}",
        "%Y-%m-%d %H:%M"
    ).strftime("%d/%m/%Y, %H:%M")

def _format_date(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d")


def _format_time(dt: datetime) -> str:
    return dt.strftime("%H:%M")
